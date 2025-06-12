#!/usr/bin/env node

/**
 * Принудительная очистка Telegram API для решения проблемы 409 Conflict
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не установлен в переменных окружения');
  process.exit(1);
}

async function forceResetTelegramBot() {
  console.log('🔧 Принудительная очистка Telegram API и локальных блокировок...');
  
  // Удаление lock файла
  const fs = require('fs');
  const path = require('path');
  const lockFile = path.join(__dirname, 'src/services/telegramBot/.telegram-bot.lock');
  
  console.log('0️⃣ Проверка lock файла...');
  if (fs.existsSync(lockFile)) {
    console.log('   🔓 Удаление lock файла...');
    fs.unlinkSync(lockFile);
    console.log('   ✅ Lock файл удален');
  } else {
    console.log('   ✅ Lock файл не найден');
  }
  
  try {
    // Создаем временный бот для очистки
    const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false, webHook: false });
    
    console.log('1️⃣ Удаление webhook...');
    try {
      const webhookInfo = await bot.getWebHookInfo();
      if (webhookInfo.url) {
        console.log(`   Найден активный webhook: ${webhookInfo.url}`);
        await bot.deleteWebHook();
        console.log('   ✅ Webhook удален');
      } else {
        console.log('   ✅ Webhook не найден');
      }
    } catch (error) {
      console.log(`   ⚠️ Ошибка при удалении webhook: ${error.message}`);
    }
    
    console.log('2️⃣ Очистка очереди обновлений...');
    try {
      // Получаем все накопившиеся обновления
      let updates = await bot.getUpdates({ limit: 100 });
      let totalCleared = 0;
      
      while (updates.length > 0) {
        totalCleared += updates.length;
        const lastUpdateId = updates[updates.length - 1].update_id;
        updates = await bot.getUpdates({ offset: lastUpdateId + 1, limit: 100 });
      }
      
      if (totalCleared > 0) {
        console.log(`   ✅ Очередь очищена (удалено ${totalCleared} обновлений)`);
      } else {
        console.log('   ✅ Очередь уже пуста');
      }
    } catch (error) {
      console.log(`   ⚠️ Ошибка при очистке очереди: ${error.message}`);
    }
    
    console.log('3️⃣ Проверка статуса бота...');
    try {
      const me = await bot.getMe();
      console.log(`   ✅ Бот активен: @${me.username} (${me.first_name})`);
    } catch (error) {
      console.log(`   ❌ Ошибка получения информации о боте: ${error.message}`);
    }
    
    // Закрываем временный бот
    await bot.close();
    
    console.log('4️⃣ Завершение очистки...');
    console.log('   ⏳ Ожидание освобождения ресурсов (10 секунд)...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('✅ Принудительная очистка завершена');
    console.log('💡 Теперь запустите сервер: npm start');
    console.log('💡 Или используйте: npm run dev');
    console.log('💡 Проверить статус: npm run telegram:status');
    
  } catch (error) {
    console.error('❌ Критическая ошибка при очистке:', error.message);
    console.log('💡 Попробуйте:');
    console.log('   1. Подождать 5-10 минут');
    console.log('   2. Проверить правильность токена');
    console.log('   3. Перезапустить все Node.js процессы');
    console.log('   4. Проверить статус: npm run telegram:status');
  }
}

// Проверяем процессы Node.js
console.log('🔍 Проверка активных Node.js процессов...');

const { exec } = require('child_process');

if (process.platform === 'win32') {
  exec('tasklist /FI "IMAGENAME eq node.exe" /FO CSV', (error, stdout) => {
    if (!error) {
      const lines = stdout.split('\n').filter(line => line.includes('node.exe'));
      if (lines.length > 1) {
        console.log(`⚠️ Найдено ${lines.length} Node.js процессов`);
        console.log('💡 Рекомендуется завершить все процессы перед запуском:');
        console.log('   taskkill /F /IM node.exe');
        console.log('   Затем запустить сервер заново');
        console.log('');
      }
    }
    
    // Запускаем очистку
    forceResetTelegramBot();
  });
} else {
  exec('ps aux | grep node', (error, stdout) => {
    if (!error) {
      const lines = stdout.split('\n').filter(line => line.includes('node') && !line.includes('grep'));
      if (lines.length > 1) {
        console.log(`⚠️ Найдено ${lines.length} Node.js процессов`);
        console.log('💡 Рекомендуется завершить все процессы перед запуском:');
        console.log('   pkill -f node');
        console.log('   Затем запустить сервер заново');
        console.log('');
      }
    }
    
    // Запускаем очистку
    forceResetTelegramBot();
  });
}