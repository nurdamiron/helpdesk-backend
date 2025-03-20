// server.js
require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const app = require('./src/index');
const pool = require('./src/config/database');
const net = require('net');

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
    
    // Запускаем сервер на выбранном порту
    // Серверді таңдалған портта іске қосамыз
    server.listen(finalPort, '0.0.0.0', () => {
      console.log('=================================');
      console.log(`Server started on port ${finalPort}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(`Time: ${new Date().toISOString()}`);
      console.log('=================================');
    });
    
    // Настраиваем WebSocket сервер
    // WebSocket серверін орнатамыз
    setupWebSocketServer(server, finalPort);
    
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
 * Настройка WebSocket сервера
 * WebSocket серверін орнату
 * 
 * @param {http.Server} server - HTTP сервер
 * @param {number} port - Порт сервера
 */
function setupWebSocketServer(server, port) {
  // Создаем WebSocket сервер
  // WebSocket серверін құрамыз
  const wss = new WebSocket.Server({
    server,
    path: '/ws',
  });
  
  // Хранение соединений с привязкой к ID пользователя
  // Пайдаланушы идентификаторына байланысты қосылымдарды сақтау
  const clients = new Map();
  
  // Обработка подключения клиента
  // Клиенттің қосылуын өңдеу
  wss.on('connection', (ws, req) => {
    // Получаем параметры из URL
    // URL-ден параметрлерді аламыз
    const url = new URL(req.url, `http://localhost:${port}`);
    const userId = url.searchParams.get('userId');
    const userType = url.searchParams.get('userType') || 'requester';
    
    console.log(`WebSocket client connected: userId=${userId}, type=${userType}`);
    console.log(`WebSocket клиенті қосылды: userId=${userId}, type=${userType}`);
    
    if (!userId) {
      ws.close(4000, 'User ID is required');
      console.log('Соединение закрыто: отсутствует ID пользователя');
      console.log('Байланыс жабылды: пайдаланушы идентификаторы жоқ');
      return;
    }
    
    // Сохраняем соединение с привязкой к типу и ID пользователя
    // Пайдаланушының түрі мен идентификаторына байланысты қосылымды сақтаймыз
    if (!clients.has(userType)) {
      clients.set(userType, new Map());
    }
    clients.get(userType).set(userId, ws);
    
    // Отправляем подтверждение соединения
    // Қосылым растауын жіберемізs
    sendToWebSocket(ws, {
      type: 'connection_established',
      userId: userId,
      userType: userType,
      timestamp: new Date().toISOString()
    });
    
    // Обработка входящих сообщений
    // Кіріс хабарламаларды өңдеу
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('Received WebSocket message:', data.type);
        
        // Обработка различных типов сообщений
        // Әртүрлі хабарлама түрлерін өңдеу
        switch (data.type) {
          case 'message_status':
            // Обновление статуса сообщения
            // Хабарлама күйін жаңарту
            await handleMessageStatus(data, clients);
            break;
            
          case 'chat_message':
            // Сохранение нового сообщения
            // Жаңа хабарламаны сақтау
            await handleChatMessage(data, clients);
            break;
            
          case 'typing':
            // Индикатор набора текста
            // Мәтін теру индикаторы
            handleTypingIndicator(data, clients);
            break;
            
          case 'ping':
            // Пинг для поддержания соединения
            // Байланысты сақтау үшін пинг
            sendToWebSocket(ws, { 
              type: 'pong', 
              timestamp: new Date().toISOString() 
            });
            break;
            
          default:
            console.log(`Неизвестный тип сообщения: ${data.type}`);
            console.log(`Белгісіз хабарлама түрі: ${data.type}`);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        console.error('WebSocket хабарламасын өңдеу қатесі:', error);
      }
    });
    
    // Обработка закрытия соединения
    // Байланысты жабуды өңдеу
    ws.on('close', (code, reason) => {
      if (userId && clients.has(userType) && clients.get(userType).has(userId)) {
        clients.get(userType).delete(userId);
        console.log(`WebSocket client disconnected: userId=${userId}, type=${userType}, code=${code}, reason=${reason}`);
        console.log(`WebSocket клиенті ажыратылды: userId=${userId}, type=${userType}, code=${code}, reason=${reason}`);
      }
    });
    
    // Обработка ошибок соединения
    // Байланыс қателерін өңдеу
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      console.error('WebSocket қатесі:', error);
    });
  });
  
  // Сохраняем WebSocket сервер и клиентов глобально для доступа из других модулей
  // WebSocket серверін және клиенттерді басқа модульдерден қол жеткізу үшін жаһандық түрде сақтаймыз
  global.wsServer = {
    wss,
    clients,
    sendToClient,
    sendToSpecificClient,
    broadcastToType,
    broadcastToAll,
    handleMessageStatus,
    handleChatMessage,
    handleTypingIndicator
  };
  
  console.log('WebSocket server initialized');
  console.log('WebSocket сервері инициализацияланды');
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

/**
 * Отправка данных через WebSocket соединение
 * WebSocket байланысы арқылы деректерді жіберу
 * 
 * @param {WebSocket} ws - WebSocket соединение
 * @param {Object} data - Данные для отправки
 * @returns {boolean} - Успешность отправки
 */
function sendToWebSocket(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
    return true;
  }
  return false;
}

/**
 * Отправка сообщения конкретному клиенту
 * Белгілі бір клиентке хабарлама жіберу
 * 
 * @param {string} userType - Тип пользователя
 * @param {string} userId - ID пользователя
 * @param {Object} data - Данные для отправки
 * @returns {boolean} - Успешность отправки
 */
function sendToClient(userType, userId, data) {
  const clients = global.wsServer?.clients;
  if (!clients) return false;
  
  if (clients.has(userType)) {
    const clientsMap = clients.get(userType);
    if (clientsMap.has(userId)) {
      const ws = clientsMap.get(userId);
      return sendToWebSocket(ws, data);
    }
  }
  return false;
}

/**
 * Отправка сообщения конкретному клиенту
 * Белгілі бір клиентке хабарлама жіберу
 * 
 * @param {string} userType - Тип пользователя
 * @param {string} userId - ID пользователя
 * @param {Object} data - Данные для отправки
 * @returns {boolean} - Успешность отправки
 */
function sendToSpecificClient(userType, userId, data) {
  return sendToClient(userType, userId, data);
}

/**
 * Широковещательная отправка сообщения всем клиентам определенного типа
 * Белгілі бір түрдегі барлық клиенттерге хабарлама жіберу
 * 
 * @param {string} userType - Тип пользователя
 * @param {Object} data - Данные для отправки
 */
function broadcastToType(userType, data) {
  const clients = global.wsServer?.clients;
  if (!clients || !clients.has(userType)) return;
  
  clients.get(userType).forEach((ws, userId) => {
    sendToWebSocket(ws, data);
  });
}

/**
 * Широковещательная отправка сообщения всем клиентам
 * Барлық клиенттерге хабарлама жіберу
 * 
 * @param {Object} data - Данные для отправки
 */
function broadcastToAll(data) {
  const clients = global.wsServer?.clients;
  if (!clients) return;
  
  clients.forEach((typeClients) => {
    typeClients.forEach((ws) => {
      sendToWebSocket(ws, data);
    });
  });
}

/**
 * Обработка обновления статуса сообщения
 * Хабарлама күйін жаңартуды өңдеу
 * 
 * @param {Object} data - Данные статуса сообщения
 * @param {Map} clients - Подключенные клиенты
 */
async function handleMessageStatus(data, clients) {
  try {
    const { message_id, status } = data;
    
    if (!message_id || !status) {
      console.error('Недостаточно данных для обновления статуса сообщения');
      console.error('Хабарлама күйін жаңарту үшін деректер жеткіліксіз');
      return;
    }
    
    // Обновляем статус сообщения в базе данных
    // Дерекқордағы хабарлама күйін жаңартамыз
    if (status === 'delivered') {
      await pool.query(
        'UPDATE ticket_messages SET status = ?, delivered_at = CURRENT_TIMESTAMP WHERE id = ? AND delivered_at IS NULL',
        [status, message_id]
      );
    } else if (status === 'read') {
      await pool.query(
        'UPDATE ticket_messages SET status = ?, read_at = CURRENT_TIMESTAMP, delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP) WHERE id = ? AND read_at IS NULL',
        [status, message_id]
      );
    }
    
    // Получаем информацию о сообщении
    // Хабарлама туралы ақпаратты аламыз
    const [messages] = await pool.query(
      'SELECT * FROM ticket_messages WHERE id = ?',
      [message_id]
    );
    
    if (messages.length > 0) {
      const message = messages[0];
      
      // Оповещаем отправителя сообщения о смене статуса через WebSocket
      // WebSocket арқылы хабарлама жіберушіні күйдің өзгеруі туралы хабардар етеміз
      if (clients.has(message.sender_type)) {
        const clientsMap = clients.get(message.sender_type);
        if (clientsMap.has(message.sender_id)) {
          sendToWebSocket(clientsMap.get(message.sender_id), {
            type: 'status_update',
            message_id: message_id,
            ticket_id: message.ticket_id,
            status: status,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
  } catch (error) {
    console.error('Error handling message status:', error);
    console.error('Хабарлама күйін өңдеу қатесі:', error);
  }
}

/**
 * Обработка нового сообщения чата
 * Жаңа чат хабарламасын өңдеу
 * 
 * @param {Object} data - Данные сообщения
 * @param {Map} clients - Подключенные клиенты
 */
async function handleChatMessage(data, clients) {
  try {
    const { ticket_id, content, sender_id, sender_type, attachments = [] } = data;
    
    if (!ticket_id || !content || !sender_id || !sender_type) {
      console.error('Недостаточно данных для сообщения чата');
      console.error('Чат хабарламасы үшін деректер жеткіліксіз');
      return;
    }
    
    // Сохраняем сообщение в базе данных
    // Хабарламаны дерекқорға сақтаймыз
    const [result] = await pool.query(
      `INSERT INTO ticket_messages (
        ticket_id, sender_type, sender_id, content, content_type, status
      ) VALUES (?, ?, ?, ?, ?, 'sent')`,
      [ticket_id, sender_type, sender_id, content, 'text']
    );
    
    const message_id = result.insertId;
    
    // Привязываем вложения к сообщению, если они есть
    // Егер тіркемелер болса, оларды хабарламаға байланыстырамыз
    if (attachments.length > 0) {
      for (const attachmentId of attachments) {
        await pool.query(
          'UPDATE ticket_attachments SET message_id = ? WHERE id = ? AND ticket_id = ?',
          [message_id, attachmentId, ticket_id]
        );
      }
    }
    
    // Обновляем дату изменения заявки
    // Өтінімнің өзгерту күнін жаңартамыз
    await pool.query(
      'UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [ticket_id]
    );
    
    // Получаем созданное сообщение для отправки
    // Жіберу үшін жасалған хабарламаны аламыз
    const [messages] = await pool.query(
      `SELECT 
        tm.*,
        CASE 
          WHEN tm.sender_type='requester' THEN r.full_name
          WHEN tm.sender_type='staff' THEN u.first_name
          ELSE 'Unknown'
        END as sender_name,
        CASE
          WHEN tm.sender_type='requester' THEN r.email
          WHEN tm.sender_type='staff' THEN u.email
          ELSE NULL
        END as sender_email
      FROM ticket_messages tm
      LEFT JOIN requesters r ON (tm.sender_type='requester' AND tm.sender_id = r.id)
      LEFT JOIN users u ON (tm.sender_type='staff' AND tm.sender_id = u.id)
      WHERE tm.id = ?`,
      [message_id]
    );
    
    if (messages.length > 0) {
      const message = messages[0];
      
      // Получаем вложения сообщения
      // Хабарламаның тіркемелерін аламыз
      const [attachmentsData] = await pool.query(
        'SELECT * FROM ticket_attachments WHERE message_id = ?',
        [message_id]
      );
      
      // Определяем получателя сообщения
      // Хабарлама алушыны анықтаймыз
      let recipientId;
      let recipientType;
      
      if (sender_type === 'requester') {
        recipientType = 'staff';
        // Отправляем всем сотрудникам
        // Барлық қызметкерлерге жіберу
        broadcastToType(recipientType, {
          type: 'new_message',
          message: {
            id: message.id,
            ticket_id: parseInt(ticket_id),
            content: message.content,
            content_type: message.content_type,
            created_at: message.created_at,
            sender: {
              id: message.sender_id,
              type: message.sender_type,
              name: message.sender_name,
              email: message.sender_email
            },
            attachments: attachmentsData,
            status: 'sent'
          }
        });
      } else {
        recipientType = 'requester';
        // Получаем ID клиента из заявки
        // Өтінімнен клиент идентификаторын аламыз
        const [tickets] = await pool.query(
          'SELECT requester_id FROM tickets WHERE id = ?',
          [ticket_id]
        );
        recipientId = tickets.length > 0 ? tickets[0].requester_id : null;
        
        if (recipientId) {
          // Отправляем сообщение клиенту
          // Клиентке хабарлама жіберу
          sendToSpecificClient(recipientType, recipientId, {
            type: 'new_message',
            message: {
              id: message.id,
              ticket_id: parseInt(ticket_id),
              content: message.content,
              content_type: message.content_type,
              created_at: message.created_at,
              sender: {
                id: message.sender_id,
                type: message.sender_type,
                name: message.sender_name,
                email: message.sender_email
              },
              attachments: attachmentsData,
              status: 'sent'
            }
          });
        }
      }
      
      // Оповещаем отправителя о успешной отправке
      // Жіберушіні сәтті жіберілгені туралы хабардар етеміз
      sendToSpecificClient(sender_type, sender_id, {
        type: 'message_sent',
        message_id: message.id,
        ticket_id: parseInt(ticket_id),
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error handling chat message:', error);
    console.error('Чат хабарламасын өңдеу қатесі:', error);
  }
}

/**
 * Обработка индикатора набора текста
 * Мәтін теру индикаторын өңдеу
 * 
 * @param {Object} data - Данные индикатора
 * @param {Map} clients - Подключенные клиенты
 */
function handleTypingIndicator(data) {
  try {
    const { ticket_id, sender_id, sender_type, isTyping } = data;
    
    if (!ticket_id || !sender_id || !sender_type) {
      console.error('Недостаточно данных для индикатора набора текста');
      console.error('Мәтін теру индикаторы үшін деректер жеткіліксіз');
      return;
    }
    
    // Определяем получателя индикатора
    // Индикатор алушыны анықтаймыз
    const recipientType = sender_type === 'requester' ? 'staff' : 'requester';
    
    // Если получатель - сотрудник, отправляем всем сотрудникам
    // Егер алушы қызметкер болса, барлық қызметкерлерге жіберу
    if (recipientType === 'staff') {
      broadcastToType('staff', {
        type: 'typing_indicator',
        ticket_id: parseInt(ticket_id),
        user_id: sender_id,
        user_type: sender_type,
        isTyping: isTyping
      });
    } else {
      // Если получатель - клиент, находим его ID из заявки
      // Егер алушы клиент болса, оның идентификаторын өтінімнен табамыз
      pool.query('SELECT requester_id FROM tickets WHERE id = ?', [ticket_id])
        .then(([tickets]) => {
          if (tickets.length > 0 && tickets[0].requester_id) {
            sendToSpecificClient('requester', tickets[0].requester_id, {
              type: 'typing_indicator',
              ticket_id: parseInt(ticket_id),
              user_id: sender_id,
              user_type: sender_type,
              isTyping: isTyping
            });
          }
        })
        .catch(err => {
          console.error('Error getting requester_id:', err);
          console.error('Requester_id алу қатесі:', err);
        });
    }
  } catch (error) {
    console.error('Error handling typing indicator:', error);
    console.error('Мәтін теру индикаторын өңдеу қатесі:', error);
  }
}

// Экспорт функций для использования в других модулях
// Басқа модульдерде пайдалану үшін функцияларды экспорттау
module.exports = {
  sendToClient,
  sendToSpecificClient,
  broadcastToType,
  broadcastToAll,
  handleMessageStatus,
  handleChatMessage,
  handleTypingIndicator
};