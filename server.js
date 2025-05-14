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
    console.log(`WS_URL: ${process.env.WS_URL || 'not set'}`);
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
    
    // Добавляем обработчик HTTP запросов к /ws в приложение Express для проверки доступности
    app.get('/ws', (req, res) => {
      console.log('HTTP запрос к WebSocket эндпоинту:');
      console.log('- URL:', req.url);
      console.log('- IP:', req.ip);
      console.log('- User-Agent:', req.headers['user-agent']);
      console.log('- Параметры:', req.query);
      
      res.status(200).json({
        status: 'success',
        message: 'WebSocket сервер доступен. Используйте WebSocket клиент для подключения.',
        available: true,
        server_time: new Date().toISOString(),
        port: finalPort,
        websocket_url: `ws://localhost:${finalPort}/ws`,
        connection_params: {
          userId: 'required parameter',
          userType: 'required parameter (requester/staff)',
          t: 'timestamp for cache prevention'
        }
      });
    });
    
    // Настраиваем CORS для WebSocket соединений
    const wsOptions = {
      noServer: true, // Важно: используем noServer вместо server
      clientTracking: true,
      path: '/ws',
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024
        },
        concurrencyLimit: 10,
        threshold: 1024
      }
    };
    
    // Инициализируем WebSocket Manager с нашими опциями
    webSocketManager.initWithOptions(null, finalPort, wsOptions); // null вместо server - используем noServer mode
    global.wsServer = webSocketManager;
    console.log('WebSocket server initialized successfully with custom options');
    console.log(`WebSocket endpoint is available at: ws://localhost:${finalPort}/ws`);
    
    // Явная обработка WebSocket upgrade запросов
    server.on('upgrade', (request, socket, head) => {
      // Проверяем путь запроса
      let pathname;
      try {
        pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
      } catch (e) {
        console.error('Error parsing request URL:', e);
        pathname = request.url.split('?')[0]; // Fallback для старых браузеров
      }
      
      console.log(`WebSocket upgrade request received for: ${pathname}`);
      
      // Проверка CORS для WebSocket
      const origin = request.headers.origin;
      const isAllowed = !origin || 
        origin.startsWith('http://localhost:') || 
        origin.includes('helpdesk-client') || 
        origin.includes('helpdesk-admin');
      
      if (!isAllowed) {
        console.warn(`WebSocket соединение отклонено из-за CORS: ${origin}`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      
      // Если это запрос к нашему WebSocket пути
      if (pathname === '/ws') {
        console.log('Handling WebSocket upgrade for /ws path');
        
        // Парсим параметры запроса
        let params;
        try {
          params = new URL(request.url, `http://${request.headers.host}`).searchParams;
        } catch (e) {
          // Ручной парсинг параметров для обратной совместимости
          params = new URLSearchParams(request.url.split('?')[1] || '');
        }
        
        const userId = params.get('userId');
        const userType = params.get('userType');
        
        // Проверяем обязательные параметры
        if (!userId || !userType) {
          console.warn('WebSocket соединение отклонено: отсутствуют обязательные параметры');
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          socket.destroy();
          return;
        }
        
        // Обрабатываем upgrade запрос через WebSocketServer
        if (webSocketManager.wss) {
          try {
            webSocketManager.wss.handleUpgrade(request, socket, head, (ws) => {
              console.log('WebSocket upgrade successful, emitting connection event');
              // Передаем соединение в наш обработчик
              webSocketManager.handleExternalConnection(ws, request);
            });
          } catch (error) {
            console.error('Error in handleUpgrade:', error);
            socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
            socket.destroy();
          }
        } else {
          console.error('WebSocketServer not available for handling upgrade');
          socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
          socket.destroy();
        }
      } else {
        // Закрываем соединение для неизвестных путей
        console.log(`Rejected WebSocket upgrade for unknown path: ${pathname}`);
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
      }
    });
    
    // Запускаем сервер на выбранном порту
    // ВАЖНО: используем server.listen вместо app.listen
    // Серверді таңдалған портта іске қосамыз
    server.listen(finalPort, '0.0.0.0', () => {
      console.log('=================================');
      console.log(`Server started on port ${finalPort}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(`Time: ${new Date().toISOString()}`);
      console.log('WebSocket server is running on path: /ws');
      console.log('=================================');
      
      // Log the available endpoints for clients
      console.log('Available WebSocket endpoint:');
      console.log(`ws://localhost:${finalPort}/ws?userId=[id]&userType=[type]`);
      console.log('=================================');
      
      // Добавляем обработчик HTTP запросов к /ws для проверки доступности сервера
      app.use('/ws', (req, res, next) => {
        // Проверяем, что это HTTP запрос к /ws, а не WebSocket
        if (!req.headers.upgrade || req.headers.upgrade.toLowerCase() !== 'websocket') {
          // Это HTTP запрос к /ws эндпоинту
          console.log('HTTP request to WebSocket endpoint detected');
          console.log('Client is checking WebSocket availability');
          console.log('Headers:', JSON.stringify(req.headers, null, 2));
          console.log('Query params:', JSON.stringify(req.query, null, 2));
          console.log('Remote IP:', req.ip);
          
          // Уведомляем клиента как правильно подключиться
          return res.status(200).json({
            message: 'WebSocket endpoint is available at this URL. To connect, use a WebSocket client instead of HTTP request.',
            available: true,
            port: finalPort,
            websocket_url: `ws://localhost:${finalPort}/ws`,
            server_time: new Date().toISOString(),
            environment: process.env.NODE_ENV,
            connected_clients: webSocketManager.countClients()
          });
        } else {
          // Если это запрос на апгрейд - пропускаем дальше
          next();
        }
      });
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