// server.js
require('dotenv').config();
const http = require('http');
const app = require('./src/index');
const pool = require('./src/config/database');
const net = require('net');
const webSocketManager = require('./src/services/WebSocketManager');

/**
 * Порт для запуска сервера
 * Серверді іске қосу порты
 */
const PORT = process.env.PORT || 5000;

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
    // Проверяем подключение к БД
    // Дерекқор қосылымын тексереміз
    const isConnected = await pool.testConnection();
    if (!isConnected) {
      console.error('FATAL: Could not connect to database. Please check your configuration.');
      console.error('ҚАТЕ: Дерекқорға қосылу мүмкін емес. Конфигурацияңызды тексеріңіз.');
      process.exit(1);
    }
    
    // Проверяем доступность порта
    // Порттың қолжетімділігін тексереміз
    const isPortFree = await isPortAvailable(PORT);
    const finalPort = isPortFree ? PORT : await findAvailablePort(PORT);
    
    if (finalPort !== PORT) {
      console.log(`Порт ${PORT} занят, используем порт ${finalPort}`);
      console.log(`Порт ${PORT} бос емес, ${finalPort} портын қолданамыз`);
    }
    
    // Создаем HTTP сервер
    // HTTP серверін құрамыз
    const server = http.createServer(app);
    
    // Инициализируем WebSocket Manager
    // WebSocket Manager инициализациялау
    webSocketManager.init(server, finalPort);
    
    // Запускаем сервер на выбранном порту
    // Серверді таңдалған портта іске қосамыз
    server.listen(finalPort, '0.0.0.0', () => {
      console.log('=================================');
      console.log(`Server started on port ${finalPort}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(`Time: ${new Date().toISOString()}`);
      console.log('WebSocket server is running on path: /ws');
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
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    console.error('Өңделмеген қате:', error);
    
    // Не закрываем процесс, если ошибка связана с занятым портом
    // Егер қате бос емес портқа байланысты болса, процесті жаппаймыз
    if (error.code !== 'EADDRINUSE') {
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    }
  });
}

module.exports = app;