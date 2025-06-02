// server.js
require('dotenv').config();
const http = require('http');
const app = require('./src/index');
const pool = require('./src/config/database');
const net = require('net');

/**
 * Порт для запуска сервера
 * Серверді іске қосу порты
 */
const PORT = process.env.PORT || 5002;

/**
 * Проверка доступности порта
 * Порттың қолжетімділігін тексеру
 * 
 * @param {number} port - Порт для проверки
 * @returns {Promise<boolean>} - Результат проверки
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => {
        // Порт занят (Порт бос емес)
        resolve(false);
      })
      .once('listening', () => {
        // Порт свободен (Порт бос)
        tester.close(() => resolve(true));
      })
      .listen(port, '0.0.0.0');
  });
}

/**
 * Функция для поиска свободного порта
 * Бос порт іздеу функциясы
 * 
 * @param {number} startPort - Начальный порт для поиска
 * @returns {Promise<number>} - Свободный порт
 */
async function findAvailablePort(startPort) {
  let port = startPort;
  while (!(await isPortAvailable(port))) {
    console.log(`Порт ${port} занят, пробуем следующий... (Порт ${port} бос емес, келесісін тексереміз...)`);
    port++;
    if (port > startPort + 100) {
      throw new Error('Не удалось найти свободный порт после 100 попыток (100 талпыныстан кейін бос порт табылмады)');
    }
  }
  return port;
}

// Запуск сервера
// Серверді іске қосу
startServer();

/**
 * Запуск сервера с проверкой порта
 * Портты тексерумен серверді іске қосу
 */
async function startServer() {
  try {
    // Явно выводим переменные окружения для диагностики
    console.log('=================================');
    console.log('ENVIRONMENT VARIABLES:');
    console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`PORT: ${process.env.PORT}`);
    console.log('=================================');
    
    // Проверяем подключение к БД
    // Дерекқор қосылымын тексереміз
    const isConnected = await pool.testConnection();
    if (!isConnected) {
      console.error('FATAL: Could not connect to database. Please check your configuration.');
      console.error('ҚАТЕ: Дерекқорға қосылу мүмкін емес. Конфигурацияңызды тексеріңіз.');
      process.exit(1);
    }
    
    // Проверяем доступность порта - делаем несколько попыток (до 3-х)
    // Порттың қолжетімділігін тексереміз - бірнеше әрекет жасаймыз (3-ке дейін)
    let isPortFree = false;
    let retries = 0;
    const maxRetries = 3;
    
    while (!isPortFree && retries < maxRetries) {
      isPortFree = await isPortAvailable(PORT);
      if (!isPortFree) {
        console.log(`Попытка ${retries + 1}/${maxRetries}: Порт ${PORT} занят, повторная проверка через 1 секунду...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Подождать 1 секунду
        retries++;
      }
    }
    
    const finalPort = isPortFree ? PORT : await findAvailablePort(PORT);
    
    if (finalPort !== PORT) {
      console.log(`Порт ${PORT} занят, используем порт ${finalPort}`);
      console.log(`Порт ${PORT} бос емес, ${finalPort} портын қолданамыз`);
      
      // Особенности среды Render и других облачных платформ - посоветуем пользователю
      if (process.env.RENDER || process.env.NODE_ENV === 'production') {
        console.log('Предупреждение! Вы запускаете сервер в производственной среде, но нужный порт занят.');
        console.log('В средах типа Render это может произойти при перезапуске сервиса.');
        console.log('Рекомендуется добавить время задержки между остановкой и запуском сервиса.');
      }
    }
    
    // Создаем HTTP сервер
    // HTTP серверін құрамыз
    const server = http.createServer(app);
    
    
    // Запускаем сервер на выбранном порту
    // ВАЖНО: используем server.listen вместо app.listen
    // Серверді таңдалған портта іске қосамыз
    server.listen(finalPort, '0.0.0.0', () => {
      console.log('=================================');
      console.log(`Server started on port ${finalPort}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(`Time: ${new Date().toISOString()}`);
      console.log('=================================');
      
    });
    
    // Обработчики процесса
    // Процесс өңдеушілері
    setupProcessHandlers(server);
    
    return { server, finalPort };
  } catch (error) {
    console.error('Error starting server:', error);
    console.error('Серверді іске қосу қатесі:', error);
    process.exit(1);
  }
}

/**
 * Настройка обработчиков процесса
 * Процесс өңдеушілерін орнату
 * 
 * @param {http.Server} server - HTTP сервер
 */
function setupProcessHandlers(server) {
  // Обработчик сигнала завершения
  // Аяқтау сигналын өңдеуші
  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    console.log('SIGTERM алынды. Серверді дұрыс жабамыз...');
    server.close(() => {
      console.log('Process terminated');
      console.log('Процесс аяқталды');
      process.exit(0);
    });
  });
  
  // Обработчик необработанных отклонений Promise
  // Өңделмеген Promise қателерін өңдеу
  process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
    console.error('Өңделмеген қабылдамау:', error);
  });
  
  // Обработчик необработанных исключений
  // Өңделмеген қателерді өңдеу
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    console.error('Өңделмеген қате:', error);
    
    // Специальная обработка для ошибки EADDRINUSE (занятый порт)
    if (error.code === 'EADDRINUSE') {
      console.log(`Ошибка: порт ${error.port} уже используется другим процессом.`);
      console.log('Пробуем перезапустить сервер на другом порту...');
      
      try {
        // Попытка найти свободный порт и перезапустить сервер
        const newPort = await findAvailablePort(error.port + 1);
        console.log(`Найден свободный порт: ${newPort}. Перезапуск сервера...`);
        
        // Если это среда Render или другая облачная платформа, выдаем рекомендацию
        if (process.env.RENDER || process.env.NODE_ENV === 'production') {
          console.log('ВАЖНО: В среде облачного хостинга рекомендуется:');
          console.log('1. Настроить время ожидания между остановкой и запуском сервера');
          console.log('2. Убедиться, что старый процесс полностью завершен перед запуском нового');
          console.log('3. Проверить настройки порта в панели управления платформой');
        }
        
        // В производственной среде завершаем процесс с ошибкой для перезапуска
        if (process.env.NODE_ENV === 'production') {
          console.log('В производственной среде завершаем процесс для корректного перезапуска...');
          setTimeout(() => {
            process.exit(1);
          }, 2000);
        }
      } catch (e) {
        console.error('Ошибка при попытке перезапуска на другом порту:', e);
        setTimeout(() => {
          process.exit(1);
        }, 1000);
      }
    } else {
      // Для других ошибок - завершаем процесс после логирования
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    }
  });
}

module.exports = app;