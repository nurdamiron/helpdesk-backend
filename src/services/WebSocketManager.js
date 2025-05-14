// src/services/WebSocketManager.js
const WebSocket = require('ws');
const url = require('url');

/**
 * Класс для работы с WebSocket соединениями на серверной стороне
 * Клиент жағында WebSocket байланыстарымен жұмыс істеуге арналған класс
 */
class WebSocketManager {
  constructor() {
    this.wss = null;
    // Хранение клиентских соединений с привязкой к типу пользователя и ID
    // Пайдаланушы түрі және ID байланысты клиенттік қосылымдарды сақтау
    this.clients = new Map();
    this.debug = process.env.NODE_ENV === 'development';
    this.port = null;
    
    console.log('WebSocketManager created, debug mode:', this.debug);
  }

  /**
   * Инициализация WebSocket сервера
   * WebSocket серверін инициализациялау
   * 
   * @param {http.Server} server - HTTP сервер для прикрепления WebSocket
   * @param {number} port - Порт сервера для формирования URL
   */
  init(server, port) {
    // Проверяем, не был ли уже инициализирован сервер
    if (this.wss) {
      console.log('WebSocket server already initialized');
      return this;
    }

    try {
      this.port = port;
      console.log(`Initializing WebSocket server on port ${port}`);
      
      // Создаем WebSocket сервер
      this.wss = new WebSocket.Server({
        server,
        path: '/ws',
        // Добавляем обработку ошибок для предотвращения падения сервера
        clientTracking: true,
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
      });
      
      // Настраиваем серверные обработчики
      this._setupServerHandlers();
      
      console.log(`WebSocket server initialized on port ${port}, path: /ws`);
      
      return this;
    } catch (error) {
      console.error('Error initializing WebSocket server:', error);
      throw error;
    }
  }
  
  /**
   * Инициализация WebSocket сервера с пользовательскими опциями
   * Пайдаланушы опцияларымен WebSocket серверін инициализациялау
   * 
   * @param {http.Server|null} server - HTTP сервер для прикрепления WebSocket, или null если используется noServer
   * @param {number} port - Порт сервера для формирования URL
   * @param {Object} options - Пользовательские опции для WebSocket сервера
   */
  initWithOptions(server, port, options) {
    // Проверяем, не был ли уже инициализирован сервер
    if (this.wss) {
      console.log('WebSocket server already initialized');
      return this;
    }

    try {
      this.port = port;
      console.log(`Initializing WebSocket server on port ${port} with custom options`);
      
      // Настраиваем базовые опции для WebSocket сервера
      const serverOptions = {
        ...options,
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
      
      // Создаем WebSocket сервер с пользовательскими опциями
      // Важно: в режиме noServer мы создаем "отсоединенный" сервер, который будет
      // обрабатывать соединения только через handleUpgrade
      this.wss = new WebSocket.Server(serverOptions);
      
      // Настраиваем серверные обработчики
      this._setupServerHandlers();
      
      console.log(`WebSocket server initialized with custom options on port ${port}, path: ${options.path || '/ws'}`);
      console.log(`Mode: ${options.noServer ? 'noServer (manual upgrade handling)' : 'attached to HTTP server'}`);
      
      return this;
    } catch (error) {
      console.error('Error initializing WebSocket server with custom options:', error);
      throw error;
    }
  }
  
  /**
   * Настройка обработчиков событий для WebSocket сервера
   * WebSocket сервер үшін оқиғалар өңдеушілерін орнату
   */
  _setupServerHandlers() {
    // Устанавливаем обработчики событий
    this.wss.on('connection', (ws, req) => {
      // Подробное логирование нового подключения
      const ipAddress = req.socket.remoteAddress;
      const ipFamily = req.socket.remoteFamily;
      const { userId, userType = 'requester', ticketId } = url.parse(req.url, true).query;
      
      console.log('=================================');
      console.log(`NEW WEBSOCKET CONNECTION: ${new Date().toISOString()}`);
      console.log(`From IP: ${ipAddress} (${ipFamily})`);
      console.log(`User ID: ${userId || 'unknown'}`);
      console.log(`User Type: ${userType || 'unknown'}`);
      console.log(`Ticket ID: ${ticketId || 'N/A'}`);
      console.log(`URL: ${req.url}`);
      console.log(`Headers:`, JSON.stringify(req.headers, null, 2));
      console.log('=================================');
      
      this.handleConnection(ws, req);
    });
    
    // Обработка ошибок сервера
    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
    
    // Установка пинга для предотвращения таймаута
    this.wss.on('listening', () => {
      console.log('WebSocket server is now listening for connections');
      
      // Пинг для поддержания соединения
      setInterval(() => {
        this.wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            // Отправляем пинг
            try {
              client.ping('', false, (err) => {
                if (err) console.error('Error sending ping to client:', err);
              });
            } catch (e) {
              console.error('Error sending ping:', e);
            }
          }
        });
      }, 30000); // Пинг каждые 30 секунд
    });
    
    // Логируем текущее состояние сервера каждые 60 секунд
    if (this.debug) {
      setInterval(() => {
        console.log('=================================');
        console.log(`WebSocket server status: ${new Date().toISOString()}`);
        console.log(`- Port: ${this.port}`);
        console.log(`- Clients connected: ${this.countClients()}`);
        this.logConnectedClients();
        console.log('=================================');
      }, 60000);
    }
  }

  /**
   * Внешний обработчик для событий connection
   * Сыртқы байланыс оқиғаларын өңдеуші
   * 
   * Этот метод вызывается из server.js при обработке upgrade
   */
  handleExternalConnection(ws, req) {
    try {
      // Логируем новое подключение через внешний обработчик
      console.log('External connection handler called');
      
      // Подробное логирование нового подключения
      const ipAddress = req.socket.remoteAddress;
      const ipFamily = req.socket.remoteFamily;
      
      let params;
      try {
        params = new URL(req.url, `http://${req.headers.host}`).searchParams;
      } catch (e) {
        // Ручной парсинг параметров для обратной совместимости
        params = new URLSearchParams(req.url.split('?')[1] || '');
      }
      
      const userId = params.get('userId');
      const userType = params.get('userType') || 'requester';
      const ticketId = params.get('ticketId');
      
      console.log('=================================');
      console.log(`NEW EXTERNAL WEBSOCKET CONNECTION: ${new Date().toISOString()}`);
      console.log(`From IP: ${ipAddress} (${ipFamily})`);
      console.log(`User ID: ${userId || 'unknown'}`);
      console.log(`User Type: ${userType || 'unknown'}`);
      console.log(`Ticket ID: ${ticketId || 'N/A'}`);
      console.log(`URL: ${req.url}`);
      console.log(`Headers:`, JSON.stringify(req.headers, null, 2));
      console.log('=================================');
      
      // Установка атрибутов для WebSocket соединения
      ws.isAlive = true;
      ws.userId = userId;
      ws.userType = userType;
      ws.ticketId = ticketId;
      
      // Обновляем время последней активности
      ws.lastPing = Date.now();
      
      // Добавляем клиента в соответствующую группу
      this.addClient(userType, userId, ws);
      
      // Отправляем подтверждение соединения
      this.sendToClient(ws, {
        type: 'connection',
        status: 'connected',
        timestamp: new Date().toISOString(),
        userId,
        userType
      });
      
      // Настраиваем обработчики сообщений для этого соединения
      this._setupClientHandlers(ws, req);
    } catch (error) {
      console.error('Error in external connection handler:', error);
      
      // Пытаемся отправить сообщение об ошибке
      try {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Connection error',
          details: error.message
        }));
      } catch (sendError) {
        console.error('Could not send error message to client:', sendError);
      }
    }
  }

  /**
   * Настройка обработчиков событий для конкретного клиента
   * Нақты клиент үшін оқиға өңдеушілерін орнату
   * 
   * @param {WebSocket} ws - WebSocket соединение
   * @param {http.IncomingMessage} req - HTTP запрос
   */
  _setupClientHandlers(ws, req) {
    // Обработка сообщений от клиента
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        console.log(`Received message from ${ws.userType}/${ws.userId}:`, data.type || 'unknown type');
        
        // Обновляем время последней активности
        ws.lastPing = Date.now();
        ws.isAlive = true;
        
        // Обрабатываем различные типы сообщений
        switch (data.type) {
          case 'chat_message':
            this.handleChatMessage(data, ws);
            break;
          case 'message_status':
            this.handleMessageStatus(data);
            break;
          case 'typing':
            this.handleTypingIndicator(data);
            break;
          case 'heartbeat':
            this.handleHeartbeat(data, ws);
            break;
          default:
            console.warn(`Unhandled message type: ${data.type}`);
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });
    
    // Обработка закрытия соединения
    ws.on('close', (code, reason) => {
      console.log(`WebSocket connection closed for ${ws.userType}/${ws.userId}. Code: ${code}, Reason: ${reason || 'No reason provided'}`);
      this.removeClient(ws.userType, ws.userId);
    });
    
    // Обработка ошибок соединения
    ws.on('error', (error) => {
      console.error(`WebSocket error for ${ws.userType}/${ws.userId}:`, error);
    });
    
    // Обработка пингов для поддержания соединения
    ws.on('pong', () => {
      ws.isAlive = true;
      ws.lastPing = Date.now();
    });
  }

  /**
   * Подсчет общего количества подключенных клиентов
   * @returns {number} - Количество клиентов
   */
  countClients() {
    let count = 0;
    this.clients.forEach(clients => {
      count += clients.size;
    });
    return count;
  }

  /**
   * Обработка нового подключения
   * Жаңа қосылымды өңдеу
   * 
   * @param {WebSocket} ws - WebSocket соединение
   * @param {http.IncomingMessage} req - HTTP запрос
   */
  handleConnection(ws, req) {
    try {
      // Разбираем URL для получения параметров запроса
      const parsedUrl = url.parse(req.url, true);
      const { userId, userType = 'requester', ticketId } = parsedUrl.query;
      
      console.log(`WebSocket client connected: userId=${userId}, type=${userType}, ticketId=${ticketId || 'N/A'}, ip=${req.socket.remoteAddress}`);
      
      // Явно устанавливаем протокол (помогает в случае проблем совместимости)
      if (req.headers['sec-websocket-protocol']) {
        ws.protocol = req.headers['sec-websocket-protocol'];
      }
      
      // Настраиваем тайм-аут и размер буфера
      ws.binaryType = 'arraybuffer';
      ws.isAlive = true;
      
      // Устанавливаем таймаут для соединения
      ws.timeout = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          console.log(`Closing inactive WebSocket connection for user ${userId}`);
          ws.terminate();
        }
      }, 30 * 60 * 1000); // 30 минут таймаут
      
      // Обработчик пингов
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      
      // Сохраняем информацию о клиенте в экземпляре WebSocket для удобного доступа
      ws.userInfo = { userId, userType, ticketId };
      
      // Добавляем информацию о времени подключения и IP-адресе
      ws.connectionInfo = {
        connectedAt: new Date(),
        ip: req.socket.remoteAddress,
        headers: req.headers
      };
      
      // Добавляем клиента в карту отслеживания
      this.addClient(userType, userId, ws);
      
      // Отправляем приветственное сообщение
      this.sendToClient(ws, {
        type: 'connection_established',
        userId,
        userType,
        ticketId,
        timestamp: new Date().toISOString(),
        server_info: {
          port: this.port,
          clients_count: this.countClients(),
          server_time: new Date().toISOString()
        }
      });
      
      // Устанавливаем обработчик сообщений
      ws.on('message', (message) => {
        try {
          ws.isAlive = true; // Обновляем статус активности при получении сообщения
          
          // Обновляем таймаут
          clearTimeout(ws.timeout);
          ws.timeout = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              console.log(`Closing inactive WebSocket connection for user ${userId}`);
              ws.terminate();
            }
          }, 30 * 60 * 1000); // 30 минут таймаут
          
          const data = JSON.parse(message);
          if (this.debug) {
            console.log(`Received WebSocket message of type ${data.type} from ${userType}:${userId}`);
          }
          
          // Обрабатываем различные типы сообщений
          switch (data.type) {
            case 'chat_message':
              this.handleChatMessage(data, ws);
              break;
            case 'typing':
              this.handleTypingIndicator(data);
              break;
            case 'message_status':
              this.handleMessageStatus(data);
              break;
            case 'ping':
              this.sendToClient(ws, { 
                type: 'pong', 
                timestamp: new Date().toISOString() 
              });
              break;
            case 'heartbeat':
              this.handleHeartbeat(data, ws);
              break;
            default:
              console.log(`Unknown message type: ${data.type}`);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });
      
      // Обработка отключения
      ws.on('close', (code, reason) => {
        // Очищаем таймаут
        clearTimeout(ws.timeout);
        
        // Вычисляем продолжительность соединения
        const connectionDuration = Math.round((new Date() - ws.connectionInfo.connectedAt) / 1000);
        
        console.log('=================================');
        console.log(`WebSocket client disconnected: userId=${userId}, type=${userType}`);
        console.log(`- Close code: ${code}`);
        console.log(`- Reason: ${reason || 'No reason provided'}`);
        console.log(`- Connection duration: ${connectionDuration}s`);
        console.log(`- Client IP: ${ws.connectionInfo.ip}`);
        console.log('=================================');
        
        this.removeClient(userType, userId);
      });
      
      // Обработка ошибок
      ws.on('error', (error) => {
        console.error(`WebSocket error for ${userType}:${userId}:`, error);
      });
      
    } catch (error) {
      console.error('Error handling WebSocket connection:', error);
    }
  }

  /**
   * Добавление клиента в карту отслеживания
   * Клиентті бақылау картасына қосу
   * 
   * @param {string} userType - Тип пользователя (requester/staff)
   * @param {string} userId - ID пользователя
   * @param {WebSocket} ws - WebSocket соединение
   */
  addClient(userType, userId, ws) {
    if (!this.clients.has(userType)) {
      this.clients.set(userType, new Map());
    }
    this.clients.get(userType).set(userId, ws);
    
    console.log(`Client added to tracking: ${userType}:${userId}`);
    this.logConnectedClients();
  }

  /**
   * Удаление клиента из карты отслеживания
   * Клиентті бақылау картасынан жою
   * 
   * @param {string} userType - Тип пользователя
   * @param {string} userId - ID пользователя
   */
  removeClient(userType, userId) {
    if (this.clients.has(userType)) {
      this.clients.get(userType).delete(userId);
      
      // Очищаем, если пусто
      if (this.clients.get(userType).size === 0) {
        this.clients.delete(userType);
      }
      
      console.log(`Client removed from tracking: ${userType}:${userId}`);
      this.logConnectedClients();
    }
  }

  /**
   * Вывод в лог подключенных клиентов (для отладки)
   * Қосылған клиенттерді журналға шығару (түзету үшін)
   */
  logConnectedClients() {
    console.log('Currently connected clients:');
    this.clients.forEach((clients, userType) => {
      console.log(`- ${userType}: ${Array.from(clients.keys()).join(', ')}`);
    });
  }

  /**
   * Отправка данных клиенту WebSocket
   * WebSocket клиентіне деректерді жіберу
   * 
   * @param {WebSocket} ws - WebSocket соединение
   * @param {Object} data - Данные для отправки
   * @returns {boolean} - Статус успеха
   */
  sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
        return true;
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        return false;
      }
    }
    return false;
  }

  /**
   * Отправка сообщения конкретному клиенту
   * Нақты клиентке хабарлама жіберу
   * 
   * @param {string} userType - Тип пользователя
   * @param {string} userId - ID пользователя
   * @param {Object} data - Данные для отправки
   * @returns {boolean} - Статус успеха
   */
  sendToSpecificClient(userType, userId, data) {
    if (this.clients.has(userType)) {
      const clientsMap = this.clients.get(userType);
      if (clientsMap.has(userId)) {
        const ws = clientsMap.get(userId);
        return this.sendToClient(ws, data);
      }
    }
    return false;
  }

  /**
   * Отправка сообщения всем клиентам определенного типа
   * Белгілі бір түрдегі барлық клиенттерге хабарлама жіберу
   * 
   * @param {string} userType - Тип пользователя
   * @param {Object} data - Данные для отправки
   */
  broadcastToType(userType, data) {
    if (!this.clients.has(userType)) return;
    
    this.clients.get(userType).forEach((ws) => {
      this.sendToClient(ws, data);
    });
  }

  /**
   * Отправка сообщения всем клиентам
   * Барлық клиенттерге хабарлама жіберу
   * 
   * @param {Object} data - Данные для отправки
   */
  broadcastToAll(data) {
    this.clients.forEach((typeClients) => {
      typeClients.forEach((ws) => {
        this.sendToClient(ws, data);
      });
    });
  }

  /**
   * Обработка сообщения чата
   * Чат хабарламасын өңдеу
   * 
   * @param {Object} data - Данные сообщения
   * @param {WebSocket} ws - WebSocket отправителя
   */
  handleChatMessage(data, ws) {
    const { ticket_id, content, sender_id, sender_type, sender_name, attachments = [] } = data;
    
    if (!ticket_id) {
      console.error('Missing ticket_id in chat message');
      return;
    }
    
    // Формируем объект сообщения
    const message = {
      id: `temp-${Date.now()}`, // Реальный ID назначит база данных
      ticket_id: parseInt(ticket_id),
      content: content || '',
      created_at: new Date().toISOString(),
      sender: {
        id: sender_id,
        type: sender_type,
        name: sender_name || (sender_type === 'requester' ? 'Клиент' : 'Администратор')
      },
      attachments: attachments.map(id => ({ id })),
      status: 'sent'
    };
    
    // В реальной реализации здесь сохранение в БД через контроллер
    
    // Отправляем сообщение соответствующим получателям
    if (sender_type === 'requester') {
      // Если от клиента, отправляем всем сотрудникам
      this.broadcastToType('staff', {
        type: 'new_message',
        message
      });
    } else {
      // Если от сотрудника, отправляем конкретному клиенту
      // Здесь нужно знать ID клиента для данной заявки
      // В демонстрационной версии отправляем всем клиентам
      this.broadcastToType('requester', {
        type: 'new_message',
        message
      });
    }
    
    // Отправляем подтверждение отправителю
    this.sendToClient(ws, {
      type: 'message_sent',
      message_id: message.id,
      ticket_id: parseInt(ticket_id),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Обработка обновления статуса сообщения
   * Хабарлама күйінің жаңартылуын өңдеу
   * 
   * @param {Object} data - Данные статуса
   */
  handleMessageStatus(data) {
    const { message_id, status } = data;
    
    if (!message_id || !status) {
      console.error('Insufficient data for message status update');
      return;
    }
    
    // В реальной реализации здесь обновление статуса в БД
    
    console.log(`Message status update: ${message_id} -> ${status}`);
  }

  /**
   * Обработка индикатора набора текста
   * Мәтін теру индикаторын өңдеу
   * 
   * @param {Object} data - Данные индикатора
   */
  handleTypingIndicator(data) {
    const { ticket_id, sender_id, sender_type, isTyping } = data;
    
    if (!ticket_id || !sender_id || !sender_type) {
      console.error('Insufficient data for typing indicator');
      return;
    }
    
    // Пересылаем индикатор соответствующей стороне
    if (sender_type === 'requester') {
      // От клиента к сотрудникам
      this.broadcastToType('staff', {
        type: 'typing_indicator',
        ticket_id: parseInt(ticket_id),
        user_id: sender_id,
        user_type: sender_type,
        isTyping
      });
    } else {
      // От сотрудника к клиенту
      this.broadcastToType('requester', {
        type: 'typing_indicator',
        ticket_id: parseInt(ticket_id),
        user_id: sender_id,
        user_type: sender_type,
        isTyping
      });
    }
  }

  /**
   * Обработка heartbeat сообщения от клиента
   * Клиенттен келген heartbeat хабарламасын өңдеу
   * 
   * @param {Object} data - Данные heartbeat
   * @param {WebSocket} ws - WebSocket клиента
   */
  handleHeartbeat(data, ws) {
    // Обновляем данные о последней активности клиента
    if (ws.userInfo) {
      ws.lastActivity = new Date();
    }
    
    // Отправляем подтверждение получения heartbeat
    this.sendToClient(ws, {
      type: 'heartbeat_ack',
      timestamp: new Date().toISOString(),
      server_time: new Date().toISOString()
    });
  }
}

// Создаем экземпляр сервиса для экспорта
const webSocketManager = new WebSocketManager();

module.exports = webSocketManager;