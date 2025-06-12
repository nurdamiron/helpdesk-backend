#!/usr/bin/env node
/**
 * Скрипт для принудительной очистки и сброса Telegram бота
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

console.log('🔧 Принудительный сброс Telegram бота...\n');

async function killProcesses() {
  console.log('🔪 Завершение всех процессов node...');
  
  try {
    // Получаем список процессов
    const { stdout } = await execPromise('ps aux | grep "node.*server.js" | grep -v grep || true');
    
    if (stdout.trim()) {
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length > 1) {
          const pid = parts[1];
          console.log(`   Завершаем процесс PID: ${pid}`);
          try {
            await execPromise(`kill -9 ${pid}`);
          } catch (e) {
            console.log(`   ⚠️ Не удалось завершить процесс ${pid}`);
          }
        }
      }
    } else {
      console.log('   Процессы не найдены');
    }
  } catch (error) {
    console.log(`   ⚠️ Ошибка: ${error.message}`);
  }
}

async function clearLockFile() {
  console.log('\n🔓 Удаление lock файла...');
  
  const lockFilePath = path.join(process.cwd(), '.telegram-bot.lock');
  
  if (fs.existsSync(lockFilePath)) {
    try {
      fs.unlinkSync(lockFilePath);
      console.log('   ✅ Lock файл удален');
    } catch (error) {
      console.log(`   ❌ Ошибка удаления lock файла: ${error.message}`);
    }
  } else {
    console.log('   Lock файл не найден');
  }
}

async function clearTelegramApi() {
  console.log('\n🧹 Очистка Telegram API...');
  
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.log('   ❌ TELEGRAM_BOT_TOKEN не установлен');
    return;
  }
  
  try {
    // Создаем временный экземпляр бота
    const bot = new TelegramBot(token, { polling: false });
    
    // Удаляем webhook
    console.log('   🌐 Удаление webhook...');
    try {
      await bot.deleteWebHook();
      console.log('   ✅ Webhook удален');
    } catch (error) {
      console.log(`   ⚠️ Ошибка удаления webhook: ${error.message}`);
    }
    
    // Очищаем очередь обновлений
    console.log('   📨 Очистка очереди обновлений...');
    try {
      let hasUpdates = true;
      let totalCleared = 0;
      
      while (hasUpdates) {
        const updates = await bot.getUpdates({ 
          offset: -1, 
          limit: 100,
          timeout: 0
        });
        
        if (updates.length > 0) {
          const lastUpdateId = updates[updates.length - 1].update_id;
          await bot.getUpdates({ 
            offset: lastUpdateId + 1, 
            limit: 1,
            timeout: 0 
          });
          totalCleared += updates.length;
          console.log(`   🗑️ Очищено ${updates.length} обновлений...`);
        } else {
          hasUpdates = false;
        }
      }
      
      console.log(`   ✅ Очередь очищена (всего удалено: ${totalCleared})`);
    } catch (error) {
      console.log(`   ⚠️ Ошибка очистки очереди: ${error.message}`);
    }
    
    // Закрываем соединение
    try {
      await bot.close();
    } catch (error) {
      // Игнорируем ошибки закрытия
    }
    
  } catch (error) {
    console.log(`   ❌ Ошибка: ${error.message}`);
  }
}

async function main() {
  console.log('⚠️  ВНИМАНИЕ: Этот скрипт остановит все процессы Node.js!');
  console.log('   Нажмите Ctrl+C для отмены или подождите 3 секунды...\n');
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 1. Завершаем процессы
  await killProcesses();
  
  // 2. Удаляем lock файл
  await clearLockFile();
  
  // 3. Очищаем Telegram API
  await clearTelegramApi();
  
  // 4. Ждем полной очистки
  console.log('\n⏳ Ожидание полной очистки (10 секунд)...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  console.log('\n✅ Сброс завершен!');
  console.log('   Теперь вы можете запустить сервер: npm start');
}

// Запуск
main().catch(error => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});