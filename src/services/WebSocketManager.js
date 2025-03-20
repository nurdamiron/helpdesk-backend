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
      
      console.log(`WebSocket server initialized on port ${port}, path: /ws`);
      
      // Устанавливаем обработчики событий
      this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
      
      // Обработка ошибок сервера
      this.wss.on('error', (error) => {
        console.error('WebSocket server error:', error);
      });
    } catch (error) {
      console.error('Error initializing WebSocket server:', error);
    }
    
    return this;
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
      
      console.log(`WebSocket client connected: userId=${userId}, type=${userType}, ticketId=${ticketId || 'N/A'}`);
      
      // Сохраняем информацию о клиенте в экземпляре WebSocket для удобного доступа
      ws.userInfo = { userId, userType, ticketId };
      
      // Добавляем клиента в карту отслеживания
      this.addClient(userType, userId, ws);
      
      // Отправляем приветственное сообщение
      this.sendToClient(ws, {
        type: 'connection_established',
        userId,
        userType,
        ticketId,
        timestamp: new Date().toISOString()
      });
      
      // Устанавливаем обработчик сообщений
      ws.on('message', (message) => {
        try {
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
            default:
              console.log(`Unknown message type: ${data.type}`);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });
      
      // Обработка отключения
      ws.on('close', (code, reason) => {
        console.log(`WebSocket client disconnected: userId=${userId}, type=${userType}, code=${code}, reason=${reason || 'No reason'}`);
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
}

// Создаем экземпляр сервиса для экспорта
const webSocketManager = new WebSocketManager();

module.exports = webSocketManager;