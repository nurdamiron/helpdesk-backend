#!/usr/bin/env node
/**
 * Скрипт для проверки статуса Telegram бота
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const lockFilePath = path.join(process.cwd(), '.telegram-bot.lock');

console.log('🔍 Проверка статуса Telegram бота...\n');

// Проверка lock файла
function checkLockFile() {
  console.log('📋 Проверка lock файла:');
  
  if (fs.existsSync(lockFilePath)) {
    try {
      const lockData = fs.readFileSync(lockFilePath, 'utf8');
      const lockInfo = JSON.parse(lockData);
      const lockAge = Date.now() - lockInfo.timestamp;
      const ageMinutes = Math.floor(lockAge / 1000 / 60);
      const ageSeconds = Math.floor((lockAge % 60000) / 1000);
      
      console.log(`✅ Lock файл существует`);
      console.log(`   PID: ${lockInfo.pid}`);
      console.log(`   Instance ID: ${lockInfo.instanceId}`);
      console.log(`   Возраст: ${ageMinutes}м ${ageSeconds}с`);
      console.log(`   Timestamp: ${new Date(lockInfo.timestamp).toLocaleString()}`);
      
      if (lockAge > 5 * 60 * 1000) {
        console.log(`   ⚠️ Lock файл устарел (старше 5 минут)`);
      }
      
      return lockInfo;
    } catch (error) {
      console.log(`❌ Ошибка чтения lock файла: ${error.message}`);
    }
  } else {
    console.log('❌ Lock файл не найден');
  }
  
  return null;
}

// Проверка процессов
async function checkProcesses() {
  console.log('\n📋 Проверка запущенных процессов:');
  
  try {
    // Проверяем процессы node
    const { stdout: nodeProcesses } = await execPromise('ps aux | grep "node.*server.js" | grep -v grep || true');
    
    if (nodeProcesses.trim()) {
      console.log('✅ Найдены процессы сервера:');
      const lines = nodeProcesses.trim().split('\n');
      lines.forEach(line => {
        const parts = line.split(/\s+/);
        if (parts.length > 10) {
          console.log(`   PID: ${parts[1]} - ${parts.slice(10).join(' ')}`);
        }
      });
    } else {
      console.log('❌ Процессы сервера не найдены');
    }
    
    // Проверяем процессы с telegram в названии
    const { stdout: telegramProcesses } = await execPromise('ps aux | grep -i telegram | grep -v grep || true');
    
    if (telegramProcesses.trim()) {
      console.log('\n⚠️ Найдены процессы с "telegram" в названии:');
      const lines = telegramProcesses.trim().split('\n');
      lines.forEach(line => {
        const parts = line.split(/\s+/);
        if (parts.length > 10) {
          console.log(`   PID: ${parts[1]} - ${parts.slice(10).join(' ')}`);
        }
      });
    }
    
  } catch (error) {
    console.log(`❌ Ошибка проверки процессов: ${error.message}`);
  }
}

// Проверка переменных окружения
function checkEnvironment() {
  console.log('\n📋 Проверка окружения:');
  
  require('dotenv').config();
  
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    console.log(`✅ TELEGRAM_BOT_TOKEN установлен (${botToken.substring(0, 10)}...)`);
  } else {
    console.log('❌ TELEGRAM_BOT_TOKEN не установлен');
  }
  
  const nodeEnv = process.env.NODE_ENV;
  console.log(`   NODE_ENV: ${nodeEnv || 'не установлен'}`);
  
  const frontendUrl = process.env.FRONTEND_URL;
  console.log(`   FRONTEND_URL: ${frontendUrl || 'не установлен'}`);
}

// Проверка портов
async function checkPorts() {
  console.log('\n📋 Проверка портов:');
  
  try {
    const { stdout } = await execPromise('netstat -tuln | grep :5002 || lsof -i :5002 || true');
    
    if (stdout.trim()) {
      console.log('✅ Порт 5002 используется:');
      console.log(`   ${stdout.trim()}`);
    } else {
      console.log('❌ Порт 5002 не используется');
    }
  } catch (error) {
    console.log(`⚠️ Не удалось проверить порты (требуются права администратора)`);
  }
}

// Основная функция
async function main() {
  // Проверка lock файла
  const lockInfo = checkLockFile();
  
  // Проверка процессов
  await checkProcesses();
  
  // Проверка окружения
  checkEnvironment();
  
  // Проверка портов
  await checkPorts();
  
  // Рекомендации
  console.log('\n📝 Рекомендации:');
  
  if (lockInfo && lockInfo.timestamp && Date.now() - lockInfo.timestamp > 5 * 60 * 1000) {
    console.log('⚠️ Lock файл устарел. Рекомендуется запустить: npm run telegram:force-reset');
  }
  
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log('⚠️ Установите TELEGRAM_BOT_TOKEN в файле .env');
  }
  
  console.log('\n✅ Проверка завершена');
}

// Запуск
main().catch(error => {
  console.error('❌ Ошибка:', error.message);
  process.exit(1);
});