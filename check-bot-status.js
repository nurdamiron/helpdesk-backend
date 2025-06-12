#!/usr/bin/env node

/**
 * Утилита для проверки состояния Telegram бота и очистки зависших процессов
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const lockFile = path.join(__dirname, 'src/services/telegramBot/.telegram-bot.lock');

async function checkBotStatus() {
  console.log('🔍 Проверка состояния Telegram бота...\n');
  
  // 1. Проверка lock файла
  console.log('1️⃣ Проверка lock файла...');
  if (fs.existsSync(lockFile)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      const lockAge = Date.now() - lockData.timestamp;
      const ageMinutes = Math.floor(lockAge / 60000);
      
      console.log(`   📁 Lock файл найден:`);
      console.log(`   • PID: ${lockData.pid}`);
      console.log(`   • Instance ID: ${lockData.instanceId}`);
      console.log(`   • Возраст: ${ageMinutes} минут`);
      
      // Проверяем, существует ли процесс
      try {
        if (process.platform === 'win32') {
          const { stdout } = await execPromise(`tasklist /FI "PID eq ${lockData.pid}" /FO CSV`);
          const processExists = stdout.includes(`"${lockData.pid}"`);
          
          if (processExists) {
            console.log(`   ✅ Процесс ${lockData.pid} активен`);
          } else {
            console.log(`   ❌ Процесс ${lockData.pid} не найден (зомби lock)`);
            console.log(`   🧹 Удаляем устаревший lock файл...`);
            fs.unlinkSync(lockFile);
          }
        } else {
          const { stdout } = await execPromise(`ps -p ${lockData.pid} -o pid=`);
          if (stdout.trim()) {
            console.log(`   ✅ Процесс ${lockData.pid} активен`);
          } else {
            console.log(`   ❌ Процесс ${lockData.pid} не найден (зомби lock)`);
            console.log(`   🧹 Удаляем устаревший lock файл...`);
            fs.unlinkSync(lockFile);
          }
        }
      } catch (error) {
        console.log(`   ❌ Процесс ${lockData.pid} не найден`);
        console.log(`   🧹 Удаляем устаревший lock файл...`);
        fs.unlinkSync(lockFile);
      }
      
    } catch (error) {
      console.log(`   ⚠️ Ошибка чтения lock файла:`, error.message);
    }
  } else {
    console.log(`   ✅ Lock файл не найден (бот не запущен)`);
  }
  
  // 2. Проверка Node.js процессов
  console.log('\n2️⃣ Проверка Node.js процессов...');
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execPromise('tasklist /FI "IMAGENAME eq node.exe" /FO CSV');
      const lines = stdout.split('\n').filter(line => line.includes('node.exe'));
      console.log(`   📊 Найдено Node.js процессов: ${lines.length}`);
      
      if (lines.length > 0) {
        console.log('   Процессы:');
        lines.forEach(line => {
          const parts = line.split(',');
          if (parts.length > 1) {
            const pid = parts[1].replace(/"/g, '');
            console.log(`   • PID: ${pid}`);
          }
        });
      }
    } else {
      const { stdout } = await execPromise('ps aux | grep node | grep -v grep');
      const lines = stdout.split('\n').filter(line => line.trim());
      console.log(`   📊 Найдено Node.js процессов: ${lines.length}`);
      
      if (lines.length > 0) {
        console.log('   Процессы:');
        lines.forEach(line => {
          const parts = line.split(/\s+/);
          if (parts.length > 1) {
            console.log(`   • PID: ${parts[1]} - ${parts.slice(10).join(' ')}`);
          }
        });
      }
    }
  } catch (error) {
    console.log('   ℹ️ Node.js процессы не найдены');
  }
  
  // 3. Проверка Telegram API
  if (process.env.TELEGRAM_BOT_TOKEN) {
    console.log('\n3️⃣ Проверка Telegram API...');
    try {
      const TelegramBot = require('node-telegram-bot-api');
      const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
      
      // Получаем информацию о боте
      const botInfo = await bot.getMe();
      console.log(`   ✅ Бот доступен: @${botInfo.username}`);
      
      // Проверяем webhook
      const webhookInfo = await bot.getWebHookInfo();
      if (webhookInfo.url) {
        console.log(`   🌐 Webhook установлен: ${webhookInfo.url}`);
      } else {
        console.log(`   ✅ Webhook не установлен`);
      }
      
      await bot.close();
    } catch (error) {
      console.log(`   ❌ Ошибка доступа к Telegram API:`, error.message);
    }
  } else {
    console.log('\n3️⃣ TELEGRAM_BOT_TOKEN не установлен');
  }
  
  // 4. Рекомендации
  console.log('\n📋 Рекомендации:');
  if (fs.existsSync(lockFile)) {
    console.log('   • Бот может быть запущен в другом процессе');
    console.log('   • Используйте npm run telegram:force-reset для принудительной очистки');
  } else {
    console.log('   • Бот готов к запуску');
    console.log('   • Используйте npm start для запуска сервера');
  }
}

// Запуск проверки
checkBotStatus().catch(error => {
  console.error('❌ Ошибка проверки:', error);
  process.exit(1);
});