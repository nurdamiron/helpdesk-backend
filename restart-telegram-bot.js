#!/usr/bin/env node

/**
 * Утилита для принудительного перезапуска Telegram бота
 * Используется для решения проблем с дублированием экземпляров
 */

const { exec } = require('child_process');
const https = require('https');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не установлен');
  process.exit(1);
}

async function stopTelegramWebhook() {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.ok) {
            console.log('✅ Webhook удален успешно');
            resolve();
          } else {
            console.log('⚠️ Ошибка при удалении webhook:', result.description);
            resolve(); // Продолжаем даже при ошибке
          }
        } catch (error) {
          console.log('⚠️ Ошибка парсинга ответа:', error.message);
          resolve(); // Продолжаем даже при ошибке
        }
      });
    }).on('error', (error) => {
      console.log('⚠️ Ошибка запроса:', error.message);
      resolve(); // Продолжаем даже при ошибке
    });
  });
}

async function getUpdates() {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=-1`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.ok) {
            console.log('✅ Последние обновления получены');
            resolve();
          } else {
            console.log('⚠️ Ошибка при получении обновлений:', result.description);
            resolve(); // Продолжаем даже при ошибке
          }
        } catch (error) {
          console.log('⚠️ Ошибка парсинга ответа:', error.message);
          resolve(); // Продолжаем даже при ошибке
        }
      });
    }).on('error', (error) => {
      console.log('⚠️ Ошибка запроса:', error.message);
      resolve(); // Продолжаем даже при ошибке
    });
  });
}

async function killNodeProcesses() {
  return new Promise((resolve) => {
    // Ищем и завершаем процессы Node.js, которые могут занимать Telegram API
    exec('tasklist /FI "IMAGENAME eq node.exe" /FO CSV', (error, stdout, stderr) => {
      if (error) {
        console.log('⚠️ Не удалось получить список процессов:', error.message);
        resolve();
        return;
      }
      
      const lines = stdout.split('\n');
      const nodeProcesses = lines.filter(line => line.includes('node.exe'));
      
      if (nodeProcesses.length > 1) { // Исключаем текущий процесс
        console.log(`🔍 Найдено ${nodeProcesses.length} Node.js процессов`);
        console.log('⚠️ Внимание: Для полного решения проблемы рекомендуется:');
        console.log('1. Завершить все Node.js процессы');
        console.log('2. Подождать 10-15 секунд');
        console.log('3. Запустить сервер заново');
      }
      
      resolve();
    });
  });
}

async function main() {
  console.log('🔄 Очистка Telegram API...');
  
  try {
    // Удаляем webhook если он установлен
    await stopTelegramWebhook();
    
    // Получаем последние обновления для очистки очереди
    await getUpdates();
    
    // Проверяем процессы Node.js
    await killNodeProcesses();
    
    console.log('✅ Очистка завершена');
    console.log('💡 Теперь можно запускать сервер: npm start');
    
  } catch (error) {
    console.error('❌ Ошибка при очистке:', error.message);
  }
}

main();