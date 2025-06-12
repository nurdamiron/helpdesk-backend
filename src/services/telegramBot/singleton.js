/**
 * Singleton для Telegram бота - гарантирует единственный экземпляр
 */

const HelpdeskTelegramBot = require('./bot');
const fs = require('fs');
const path = require('path');

class TelegramBotSingleton {
  constructor() {
    this.instance = null;
    this.isInitializing = false;
    this.initializationPromise = null;
    this.lockFile = path.join(__dirname, '.telegram-bot.lock');
    this.instanceId = `${process.pid}-${Date.now()}`;
  }

  async getInstance() {
    // Если уже есть промис инициализации, ждем его
    if (this.initializationPromise) {
      console.log('⏳ Ожидание текущей инициализации Telegram бота...');
      return await this.initializationPromise;
    }

    // Если экземпляр уже существует и работает, возвращаем его
    if (this.instance && this.instance.isRunning) {
      return this.instance;
    }

    // Создаем промис инициализации
    this.initializationPromise = this._createInstance();
    
    try {
      const instance = await this.initializationPromise;
      return instance;
    } finally {
      this.initializationPromise = null;
    }
  }

  async _createInstance() {
    try {
      console.log('🤖 Создание единственного экземпляра Telegram бота...');
      console.log(`📍 Instance ID: ${this.instanceId}`);
      
      // Проверяем и создаем lock файл
      if (!await this._acquireLock()) {
        throw new Error('Не удалось получить блокировку для создания бота');
      }

      // Принудительно очищаем все существующие экземпляры
      await this._cleanupExistingInstances();

      // Дополнительная задержка для полной очистки Telegram API
      console.log('⏳ Ожидание полной очистки Telegram API (10 секунд)...');
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Создаем новый экземпляр
      this.instance = new HelpdeskTelegramBot();
      
      // Ждем завершения инициализации с улучшенной проверкой
      let attempts = 0;
      const maxAttempts = 60; // 60 секунд
      
      while (this.instance.isInitializing && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
        
        // Каждые 10 секунд выводим статус
        if (attempts % 10 === 0) {
          console.log(`⏳ Инициализация бота... (${attempts}/${maxAttempts} сек)`);
        }
      }

      if (this.instance.isInitializing) {
        await this._releaseLock();
        throw new Error('Timeout: инициализация бота заняла слишком много времени');
      }

      // Устанавливаем флаг работающего экземпляра
      this.instance.isRunning = true;

      console.log('✅ Единственный экземпляр Telegram бота создан успешно');
      return this.instance;

    } catch (error) {
      console.error('❌ Ошибка создания экземпляра Telegram бота:', error.message);
      this.instance = null;
      await this._releaseLock();
      throw error;
    }
  }

  async _cleanupExistingInstances() {
    console.log('🧹 Очистка существующих экземпляров...');
    
    // Очищаем глобальный экземпляр
    if (global.telegramBot) {
      try {
        console.log('📍 Остановка глобального экземпляра...');
        await global.telegramBot.shutdown();
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.log('⚠️ Ошибка при остановке глобального экземпляра:', error.message);
      }
      global.telegramBot = null;
    }

    // Очищаем текущий экземпляр
    if (this.instance) {
      try {
        console.log('📍 Остановка текущего экземпляра синглтона...');
        await this.instance.shutdown();
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.log('⚠️ Ошибка при остановке текущего экземпляра:', error.message);
      }
      this.instance = null;
    }

    // Принудительная очистка через Telegram API
    try {
      console.log('📍 Принудительная очистка Telegram API...');
      const TelegramBot = require('node-telegram-bot-api');
      const token = process.env.TELEGRAM_BOT_TOKEN;
      
      if (token) {
        const tempBot = new TelegramBot(token, { polling: false, webHook: false });
        
        // Удаляем webhook
        try {
          await tempBot.deleteWebHook();
          console.log('✅ Webhook удален');
        } catch (e) {
          console.log('⚠️ Webhook уже удален или ошибка:', e.message);
        }
        
        // Очищаем очередь обновлений
        try {
          await tempBot.getUpdates({ offset: -1, limit: 100 });
          console.log('✅ Очередь обновлений очищена');
        } catch (e) {
          console.log('⚠️ Ошибка очистки очереди:', e.message);
        }
        
        // Закрываем временный бот
        try {
          await tempBot.close();
        } catch (e) {
          // Игнорируем ошибки закрытия
        }
      }
    } catch (error) {
      console.log('⚠️ Ошибка принудительной очистки:', error.message);
    }
  }

  async _acquireLock() {
    try {
      // Проверяем существование lock файла
      if (fs.existsSync(this.lockFile)) {
        const lockData = fs.readFileSync(this.lockFile, 'utf8');
        const lockInfo = JSON.parse(lockData);
        
        // Проверяем, не устарел ли lock (более 5 минут)
        const lockAge = Date.now() - lockInfo.timestamp;
        if (lockAge > 5 * 60 * 1000) {
          console.log('🔓 Удаляем устаревший lock файл');
          fs.unlinkSync(this.lockFile);
        } else {
          console.log(`⚠️ Бот уже запускается другим процессом (PID: ${lockInfo.pid})`);
          return false;
        }
      }
      
      // Создаем lock файл
      fs.writeFileSync(this.lockFile, JSON.stringify({
        pid: process.pid,
        instanceId: this.instanceId,
        timestamp: Date.now()
      }));
      
      console.log('🔒 Lock файл создан');
      return true;
    } catch (error) {
      console.error('❌ Ошибка работы с lock файлом:', error.message);
      return false;
    }
  }

  async _releaseLock() {
    try {
      if (fs.existsSync(this.lockFile)) {
        const lockData = fs.readFileSync(this.lockFile, 'utf8');
        const lockInfo = JSON.parse(lockData);
        
        // Удаляем lock только если он принадлежит текущему процессу
        if (lockInfo.instanceId === this.instanceId) {
          fs.unlinkSync(this.lockFile);
          console.log('🔓 Lock файл удален');
        }
      }
    } catch (error) {
      console.error('❌ Ошибка удаления lock файла:', error.message);
    }
  }

  async destroy() {
    console.log('🛑 Уничтожение экземпляра Telegram бота...');
    
    if (this.instance) {
      try {
        this.instance.isRunning = false;
        await this.instance.shutdown();
        this.instance = null;
        console.log('✅ Экземпляр Telegram бота уничтожен');
      } catch (error) {
        console.error('❌ Ошибка при уничтожении экземпляра:', error.message);
        this.instance = null;
      }
    }
    
    // Освобождаем lock
    await this._releaseLock();
    
    // Очищаем глобальную ссылку
    if (global.telegramBot === this.instance) {
      global.telegramBot = null;
    }
  }

  hasInstance() {
    return this.instance !== null && this.instance.isRunning === true;
  }

  getInstanceInfo() {
    return {
      hasInstance: this.hasInstance(),
      instanceId: this.instanceId,
      isInitializing: this.isInitializing,
      pid: process.pid
    };
  }
}

// Экспортируем единственный экземпляр синглтона
const singleton = new TelegramBotSingleton();

// Обработка завершения процесса
process.on('exit', async () => {
  await singleton._releaseLock();
});

process.on('SIGINT', async () => {
  await singleton.destroy();
});

process.on('SIGTERM', async () => {
  await singleton.destroy();
});

module.exports = singleton;