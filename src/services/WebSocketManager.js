// src/services/WebSocketManager.js
const WebSocket = require('ws');
const pool = require('../config/database');

/**
 * Класс для управления WebSocket соединениями на сервере
 * Серверде WebSocket байланыстарын басқаруға арналған класс
 */
class WebSocketManager {
  constructor() {
    this.wss = null;
    // Хранение клиентских соединений с привязкой к типу пользователя и ID
    // Пайдаланушы түрі және ID байланысты клиенттік қосылымдарды сақтау
    this.clients = new Map();
  }

  /**
   * Инициализация WebSocket сервера
   * WebSocket серверін инициализациялау
   * 
   * @param {http.Server} server - HTTP сервер для прикрепления WebSocket
   * @param {number} port - Порт сервера для формирования URL
   */
  init(server, port) {
    // Создаем WebSocket сервер
    // WebSocket серверін құрамыз
    this.wss = new WebSocket.Server({
      server,
      path: '/ws',
    });
    
    console.log('WebSocket server initialized on path: /ws');
    
    // Обработка подключения клиентов
    // Клиенттердің қосылуын өңдеу
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req, port));
    
    return this;
  }

  /**
   * Обработка нового подключения
   * Жаңа қосылымды өңдеу
   * 
   * @param {WebSocket} ws - WebSocket соединение
   * @param {http.IncomingMessage} req - HTTP запрос
   * @param {number} port - Порт сервера
   */
  handleConnection(ws, req, port) {
    try {
      // Получаем параметры из URL
      // URL параметрлерін аламыз
      const url = new URL(req.url, `http://localhost:${port}`);
      const userId = url.searchParams.get('userId');
      const userType = url.searchParams.get('userType') || 'requester';
      
      console.log(`WebSocket client connected: userId=${userId}, type=${userType}`);
      
      if (!userId) {
        ws.close(4000, 'User ID is required');
        console.log('Connection closed: missing user ID');
        return;
      }
      
      // Сохраняем соединение
      // Қосылымды сақтаймыз
      this.addClient(userType, userId, ws);
      
      // Отправляем подтверждение соединения
      // Қосылым растауын жіберу
      this.sendToClient(ws, {
        type: 'connection_established',
        userId: userId,
        userType: userType,
        timestamp: new Date().toISOString()
      });
      
      // Обработка сообщений от клиента
      // Клиенттен келген хабарламаларды өңдеу
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          console.log(`Received WebSocket message of type: ${data.type} from ${userType}:${userId}`);
          
          // Обработка различных типов сообщений
          // Әртүрлі хабарлама түрлерін өңдеу
          switch (data.type) {
            case 'message_status':
              await this.handleMessageStatus(data);
              break;
            case 'chat_message':
              await this.handleChatMessage(data);
              break;
            case 'typing':
              this.handleTypingIndicator(data);
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
          console.error('Error processing WebSocket message:', error);
        }
      });
      
      // Обработка закрытия соединения
      // Қосылымды жабуды өңдеу
      ws.on('close', (code, reason) => {
        console.log(`WebSocket client disconnected: userId=${userId}, type=${userType}, code=${code}, reason=${reason}`);
        this.removeClient(userType, userId);
      });
      
      // Обработка ошибок соединения
      // Қосылым қателерін өңдеу
      ws.on('error', (error) => {
        console.error(`WebSocket error for ${userType}:${userId}:`, error);
      });
    } catch (error) {
      console.error('Error handling WebSocket connection:', error);
    }
  }

  /**
   * Добавление клиента в список соединений
   * Клиентті қосылымдар тізіміне қосу
   * 
   * @param {string} userType - Тип пользователя
   * @param {string|number} userId - ID пользователя
   * @param {WebSocket} ws - WebSocket соединение
   */
  addClient(userType, userId, ws) {
    if (!this.clients.has(userType)) {
      this.clients.set(userType, new Map());
    }
    this.clients.get(userType).set(userId, ws);
  }

  /**
   * Удаление клиента из списка соединений
   * Клиентті қосылымдар тізімінен жою
   * 
   * @param {string} userType - Тип пользователя
   * @param {string|number} userId - ID пользователя
   */
  removeClient(userType, userId) {
    if (this.clients.has(userType)) {
      this.clients.get(userType).delete(userId);
      // Если это последний клиент данного типа, удаляем тип
      // Егер бұл осы түрдегі соңғы клиент болса, түрді жоямыз
      if (this.clients.get(userType).size === 0) {
        this.clients.delete(userType);
      }
    }
  }

  /**
   * Отправка данных через WebSocket соединение
   * WebSocket байланысы арқылы деректерді жіберу
   * 
   * @param {WebSocket} ws - WebSocket соединение
   * @param {Object} data - Данные для отправки
   * @returns {boolean} - Успешность отправки
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
   * @param {string|number} userId - ID пользователя
   * @param {Object} data - Данные для отправки
   * @returns {boolean} - Успешность отправки
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
   * Широковещательная отправка сообщения всем клиентам определенного типа
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
   * Широковещательная отправка сообщения всем клиентам
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
   * Обработка обновления статуса сообщения
   * Хабарлама күйін жаңартуды өңдеу
   * 
   * @param {Object} data - Данные статуса сообщения
   */
  async handleMessageStatus(data) {
    try {
      const { message_id, status } = data;
      
      if (!message_id || !status) {
        console.error('Insufficient data for message status update');
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
        
        // Оповещаем отправителя сообщения о смене статуса
        // Хабарлама жіберушісіне күйдің өзгергені туралы хабарлаймыз
        this.sendToSpecificClient(message.sender_type, message.sender_id, {
          type: 'status_update',
          message_id: parseInt(message_id),
          ticket_id: parseInt(message.ticket_id),
          status: status,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error handling message status update:', error);
    }
  }

  /**
   * Обработка нового сообщения чата
   * Жаңа чат хабарламасын өңдеу
   * 
   * @param {Object} data - Данные сообщения
   */
  async handleChatMessage(data) {
    try {
      const { ticket_id, content, sender_id, sender_type, attachments = [] } = data;
      
      if (!ticket_id || !sender_id || !sender_type) {
        console.error('Insufficient data for chat message');
        return;
      }
      
      // Создаем сообщение в базе данных
      // Дерекқорда хабарлама жасаймыз
      const [result] = await pool.query(
        `INSERT INTO ticket_messages (
          ticket_id, sender_type, sender_id, content, content_type, status
        ) VALUES (?, ?, ?, ?, ?, 'sent')`,
        [ticket_id, sender_type, sender_id, content || '', 'text']
      );
      
      const message_id = result.insertId;
      
      // Если есть вложения, связываем их с сообщением
      // Егер тіркемелер болса, оларды хабарламамен байланыстырамыз
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
      
      // Получаем данные созданного сообщения
      // Жасалған хабарлама деректерін аламыз
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
      
      if (messages.length === 0) {
        console.error('Created message not found');
        return;
      }
      
      const message = messages[0];
      
      // Получаем вложения сообщения
      // Хабарламаның тіркемелерін аламыз
      const [attachmentsData] = await pool.query(
        'SELECT * FROM ticket_attachments WHERE message_id = ?',
        [message_id]
      );
      
      // Определяем получателя сообщения
      // Хабарлама алушыны анықтаймыз
      if (sender_type === 'requester') {
        // От клиента - отправляем всем сотрудникам
        // Клиенттен - барлық қызметкерлерге жіберу
        this.broadcastToType('staff', {
          type: 'new_message',
          message: {
            id: message.id,
            ticket_id: parseInt(ticket_id),
            content: message.content,
            created_at: message.created_at,
            sender: {
              id: message.sender_id,
              name: message.sender_name,
              email: message.sender_email,
              type: message.sender_type
            },
            attachments: attachmentsData,
            status: 'sent'
          }
        });
      } else {
        // От сотрудника - отправляем клиенту
        // Қызметкерден - клиентке жіберу
        const [tickets] = await pool.query(
          'SELECT requester_id FROM tickets WHERE id = ?',
          [ticket_id]
        );
        
        if (tickets.length > 0 && tickets[0].requester_id) {
          this.sendToSpecificClient('requester', tickets[0].requester_id, {
            type: 'new_message',
            message: {
              id: message.id,
              ticket_id: parseInt(ticket_id),
              content: message.content,
              created_at: message.created_at,
              sender: {
                id: message.sender_id,
                name: message.sender_name,
                email: message.sender_email,
                type: message.sender_type
              },
              attachments: attachmentsData,
              status: 'sent'
            }
          });
        }
      }
      
      // Оповещаем отправителя о успешной отправке
      // Жіберушіні сәтті жіберілгені туралы хабардар етеміз
      this.sendToSpecificClient(sender_type, sender_id, {
        type: 'message_sent',
        message_id: message.id,
        ticket_id: parseInt(ticket_id),
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error handling chat message:', error);
    }
  }

  /**
   * Обработка индикатора набора текста
   * Мәтін теру индикаторын өңдеу
   * 
   * @param {Object} data - Данные индикатора
   */
  async handleTypingIndicator(data) {
    try {
      const { ticket_id, sender_id, sender_type, isTyping } = data;
      
      if (!ticket_id || !sender_id || !sender_type) {
        console.error('Insufficient data for typing indicator');
        return;
      }
      
      // Определяем кому отправить индикатор
      // Индикаторды кімге жіберу керек екенін анықтаймыз
      if (sender_type === 'requester') {
        // От клиента - отправляем всем сотрудникам
        // Клиенттен - барлық қызметкерлерге жіберу
        this.broadcastToType('staff', {
          type: 'typing_indicator',
          ticket_id: parseInt(ticket_id),
          user_id: sender_id,
          user_type: sender_type,
          isTyping: isTyping
        });
      } else {
        // От сотрудника - отправляем клиенту
        // Қызметкерден - клиентке жіберу
        const [tickets] = await pool.query(
          'SELECT requester_id FROM tickets WHERE id = ?',
          [ticket_id]
        );
        
        if (tickets.length > 0 && tickets[0].requester_id) {
          this.sendToSpecificClient('requester', tickets[0].requester_id, {
            type: 'typing_indicator',
            ticket_id: parseInt(ticket_id),
            user_id: sender_id,
            user_type: sender_type,
            isTyping: isTyping
          });
        }
      }
    } catch (error) {
      console.error('Error handling typing indicator:', error);
    }
  }
}

// Создаем экземпляр для импорта в других модулях
// Басқа модульдерге импорттау үшін данасын жасаймыз
const webSocketManager = new WebSocketManager();

module.exports = webSocketManager;