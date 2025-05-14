// src/services/wsNotificationService.js
const pool = require('./pool');

/**
 * Отправляет уведомление через WebSocket о новом сообщении
 * WebSocket арқылы жаңа хабарлама туралы хабарландыру жіберу
 * 
 * @param {Object} message - Данные сообщения
 * @param {Object} ticket - Данные заявки
 * @param {string} senderType - Тип отправителя (requester, staff)
 * @param {string|number} senderId - ID отправителя
 */
exports.handleWebSocketNotification = async (message, ticket, senderType, senderId) => {
    try {
      // Получаем глобальный wsServer
      // Жаһандық wsServer алу
      if (global.wsServer) {
        // Если сообщение от клиента
        // Егер хабарлама клиенттен болса
        if (senderType === 'requester') {
          // Отправляем всем сотрудникам
          // Барлық қызметкерлерге жіберу
          global.wsServer.broadcastToType('staff', {
            type: 'new_message',
            message: {
              id: message.id,
              ticket_id: parseInt(ticket.id),
              content: message.content,
              created_at: message.created_at,
              sender: message.sender,
              attachments: message.attachments,
              status: 'sent'
            }
          });
        } else {
          // Если сообщение от сотрудника, отправляем клиенту
          // Егер хабарлама қызметкерден болса, клиентке жіберу
          if (ticket.requester_id) {
            global.wsServer.sendToSpecificClient('requester', ticket.requester_id, {
              type: 'new_message',
              message: {
                id: message.id,
                ticket_id: parseInt(ticket.id),
                content: message.content,
                created_at: message.created_at,
                sender: message.sender,
                attachments: message.attachments,
                status: 'sent'
              }
            });
          }
        }
        
        // Отправляем подтверждение отправителю
        // Жіберушіге растауды жіберу
        global.wsServer.sendToSpecificClient(senderType, senderId, {
          type: 'message_sent',
          message_id: message.id,
          ticket_id: parseInt(ticket.id),
          timestamp: new Date().toISOString()
        });
        
        console.log('WebSocket уведомление отправлено');
        console.log('WebSocket хабарламасы жіберілді');
      } else {
        console.log('WebSocket сервер не доступен');
        console.log('WebSocket сервері қолжетімді емес');
      }
    } catch (wsError) {
      console.error('Ошибка отправки WebSocket уведомления:', wsError);
      console.error('WebSocket хабарландыруын жіберу қатесі:', wsError);
      // Не блокируем основной процесс при ошибке WebSocket
    }
  };
  
  /**
   * Отправляет уведомление через WebSocket об изменении статуса сообщения
   * WebSocket арқылы хабарлама күйінің өзгеруі туралы хабарландыру жіберу
   * 
   * @param {Object} message - Данные сообщения
   * @param {string} status - Новый статус (delivered, read)
   */
  exports.sendStatusUpdate = async (message, status) => {
    try {
      if (global.wsServer) {
        // Отправляем уведомление отправителю сообщения
        // Хабарлама жіберушісіне хабарландыруды жіберу
        global.wsServer.sendToSpecificClient(message.sender_type, message.sender_id, {
          type: 'status_update',
          message_id: parseInt(message.id),
          ticket_id: message.ticket_id,
          status: status,
          timestamp: new Date().toISOString()
        });
        
        console.log(`WebSocket уведомление о статусе сообщения отправлено`);
        console.log(`Хабарлама күйі туралы WebSocket хабарландыруы жіберілді`);
        return true;
      }
      return false;
    } catch (wsError) {
      console.error('Ошибка отправки WebSocket уведомления о статусе:', wsError);
      console.error('Күй туралы WebSocket хабарландыруын жіберу қатесі:', wsError);
      return false;
    }
  };
  
  /**
   * Отправляет индикатор набора текста через WebSocket
   * WebSocket арқылы мәтін теру индикаторын жіберу
   * 
   * @param {number|string} ticketId - ID заявки
   * @param {number|string} senderId - ID отправителя
   * @param {string} senderType - Тип отправителя (requester, staff)
   * @param {boolean} isTyping - Флаг набора текста
   * @returns {boolean} - Результат отправки
   */
  exports.sendTypingIndicator = async (ticketId, senderId, senderType, isTyping) => {
    try {
      if (!global.wsServer) return false;
      
      // Определяем получателя индикатора
      // Индикатор алушыны анықтаймыз
      const recipientType = senderType === 'requester' ? 'staff' : 'requester';
      
      // Если получатель - сотрудник, отправляем всем сотрудникам
      // Егер алушы қызметкер болса, барлық қызметкерлерге жіберу
      if (recipientType === 'staff') {
        global.wsServer.broadcastToType('staff', {
          type: 'typing_indicator',
          ticket_id: parseInt(ticketId),
          user_id: senderId,
          user_type: senderType,
          isTyping: isTyping
        });
        return true;
      } else {
        // Импортируем модуль pool в начале файла
const pool = require('./pool');

// Если получатель - клиент, находим его ID из заявки
        // Егер алушы клиент болса, оның идентификаторын өтінімнен табамыз
        try {
          const [tickets] = await pool.query(
            'SELECT requester_id FROM tickets WHERE id = ?', 
            [ticketId]
          );
          
          if (tickets.length > 0 && tickets[0].requester_id) {
            global.wsServer.sendToSpecificClient('requester', tickets[0].requester_id, {
              type: 'typing_indicator',
              ticket_id: parseInt(ticketId),
              user_id: senderId,
              user_type: senderType,
              isTyping: isTyping
            });
            return true;
          }
        } catch (dbError) {
          console.error('Ошибка получения requester_id:', dbError);
          console.error('Requester_id алу қатесі:', dbError);
        }
      }
      
      return false;
    } catch (wsError) {
      console.error('Ошибка отправки индикатора набора текста:', wsError);
      console.error('Мәтін теру индикаторын жіберу қатесі:', wsError);
      return false;
    }
  };