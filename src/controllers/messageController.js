// src/controllers/messageController.js
const pool = require('../config/database');
const { sendMessageNotification } = require('../services/emailService');
const { 
  getTicketMessagesWithSenders,
  getMessageAttachments,
  createMessageWithAttachments,
  updateTicketStatus,
  markMessagesAsRead
} = require('../services/messageService');
const { handleWebSocketNotification } = require('../services/wsNotificationService');

/**
 * Получение сообщений заявки
 * Өтінім хабарламаларын алу
 * 
 * @param {Object} req - HTTP запрос
 * @param {Object} res - HTTP ответ
 */
exports.getTicketMessages = async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    console.log(`Запрос на получение сообщений для заявки #${ticketId}`);
    console.log(`#${ticketId} өтінімі үшін хабарламаларды алу сұрауы`);
    
    // Проверяем существование заявки
    // Өтінімнің бар-жоғын тексереміз
    const [tickets] = await pool.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    if (tickets.length === 0) {
      console.log(`Заявка #${ticketId} не найдена`);
      console.log(`#${ticketId} өтінімі табылмады`);
      return res.status(404).json({ 
        status: 'error', 
        error: 'Заявка не найдена' 
      });
    }
    
    // Получаем сообщения с информацией об отправителе
    // Жіберуші туралы ақпаратпен хабарламаларды аламыз
    const messages = await getTicketMessagesWithSenders(ticketId);
    
    console.log(`Найдено ${messages.length} сообщений для заявки #${ticketId}`);
    console.log(`#${ticketId} өтінімі үшін ${messages.length} хабарлама табылды`);
    
    // Получаем вложения для сообщений
    // Хабарламалар үшін тіркемелерді аламыз
    const attachments = await getMessageAttachments(ticketId);
    
    console.log(`Найдено ${attachments.length} вложений для заявки #${ticketId}`);
    console.log(`#${ticketId} өтінімі үшін ${attachments.length} тіркеме табылды`);
    
    // Добавляем вложения к сообщениям
    // Хабарламаларға тіркемелерді қосамыз
    const messagesWithAttachments = messages.map(message => {
      const messageAttachments = attachments.filter(
        attachment => attachment.message_id === message.id
      );
      
      return {
        ...message,
        sender: {
          id: message.sender_id,
          name: message.sender_name,
          email: message.sender_email,
          type: message.sender_type
        },
        attachments: messageAttachments
      };
    });
    
    // Отмечаем все входящие сообщения как прочитанные (если запрос от клиента)
    // Барлық кіріс хабарламаларды оқылды деп белгілейміз (егер сұраныс клиенттен болса)
    if (req.user && req.user.role === 'client') {
      await markMessagesAsRead(ticketId, req.user.id, 'requester');
    }
    
    return res.json({
      status: 'success',
      messages: messagesWithAttachments
    });
    
  } catch (error) {
    console.error('Ошибка получения сообщений:', error);
    console.error('Хабарламаларды алу қатесі:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Внутренняя ошибка сервера'
    });
  }
};

/**
 * Добавление сообщения к заявке
 * Өтінімге хабарлама қосу
 * 
 * @param {Object} req - HTTP запрос
 * @param {Object} res - HTTP ответ
 */
exports.addMessage = async (req, res) => {
  try {
    const { ticketId } = req.params;
    let { content, sender_type, sender_id, attachments = [], notify_email = false } = req.body;
    
    // In case the API is being called with different parameter names
    if (!content && req.body.body) {
      content = req.body.body;
    }
    
    console.log(`Request to add message to ticket #${ticketId}`, {
      sender_type, 
      sender_id, 
      content_length: content?.length || 0,
      attachments_count: attachments?.length || 0
    });
    
    // Normalize content
    if (content === undefined || content === null) {
      content = '';
    }
    
    // Determine sender type based on user role
    // If not explicitly provided, use information from the authentication
    if (!sender_type) {
      if (req.user) {
        switch(req.user.role) {
          case 'admin':
            sender_type = 'admin';
            break;
          case 'moderator':
            sender_type = 'moderator';
            break;
          case 'user':
          default:
            sender_type = 'user';
            break;
        }
      } else {
        sender_type = 'user'; // Default if no auth info
      }
    }
    
    // Use auth user ID or default if not available
    const user_id = req.user?.id || sender_id || 1;
    
    console.log(`Sender determined as: type=${sender_type}, id=${user_id}`);
    
    // Check for minimum content (text or attachments)
    if (!content.trim() && (!attachments || attachments.length === 0)) {
      console.log(`Error: empty message without attachments`);
      return res.status(400).json({ 
        status: 'error', 
        error: 'Сообщение должно содержать текст или вложения' 
      });
    }
    
    // Verify ticket exists and get requester info
    const [tickets] = await pool.query(`
      SELECT t.*, r.email as requester_email, r.full_name as requester_name
      FROM tickets t
      LEFT JOIN requesters r ON t.requester_id = r.id
      WHERE t.id = ?
    `, [ticketId]);
    
    if (tickets.length === 0) {
      console.log(`Ticket #${ticketId} not found`);
      return res.status(404).json({ 
        status: 'error', 
        error: 'Заявка не найдена' 
      });
    }
    
    const ticket = tickets[0];
    console.log(`Ticket #${ticketId} found, requester: ${ticket.requester_email || 'email not set'}`);
    
    // Create message with proper sender identification
    const [result] = await pool.query(
      `INSERT INTO ticket_messages
       (ticket_id, sender_type, sender_id, content, content_type)
       VALUES (?, ?, ?, ?, 'text')`,
      [ticketId, sender_type, user_id, content]
    );
    
    const messageId = result.insertId;
    console.log(`Message created with ID ${messageId}`);
    
    // Link attachments if provided
    if (attachments && attachments.length > 0) {
      for (const attachmentId of attachments) {
        try {
          await pool.query(
            'UPDATE ticket_attachments SET message_id = ? WHERE id = ? AND ticket_id = ?',
            [messageId, attachmentId, ticketId]
          );
        } catch (attachErr) {
          console.error(`Error linking attachment ${attachmentId}:`, attachErr);
        }
      }
    }
    
    // Update ticket status if needed (reopen closed tickets, etc.)
    await updateTicketStatus(ticketId);
    
    // Get created message with sender info
    const [messages] = await pool.query(`
      SELECT 
        m.*,
        CASE 
          WHEN m.sender_type='user' THEN CONCAT(u.first_name, ' ', u.last_name)
          WHEN m.sender_type='moderator' THEN CONCAT(u.first_name, ' ', u.last_name)
          WHEN m.sender_type='admin' THEN CONCAT(u.first_name, ' ', u.last_name)
          WHEN m.sender_type='system' THEN 'System'
          ELSE 'Unknown'
        END as sender_name,
        CASE
          WHEN m.sender_type IN ('user', 'moderator', 'admin') THEN u.email
          ELSE NULL
        END as sender_email
      FROM ticket_messages m
      LEFT JOIN users u ON (m.sender_type IN ('user', 'moderator', 'admin') AND m.sender_id = u.id)
      WHERE m.id = ?
    `, [messageId]);
    
    if (messages.length === 0) {
      return res.status(500).json({
        status: 'error',
        error: 'Failed to retrieve created message'
      });
    }
    
    const message = messages[0];
    
    // Format the response message with proper structure
    const responseMessage = {
      id: message.id,
      ticket_id: parseInt(ticketId),
      content: message.content,
      created_at: message.created_at,
      sender: {
        id: message.sender_id,
        type: message.sender_type,
        name: message.sender_name || (message.sender_type === 'user' ? 'Пользователь' : 
                                  message.sender_type === 'moderator' ? 'Модератор' : 
                                  message.sender_type === 'admin' ? 'Администратор' : 'Система'),
        email: message.sender_email
      },
      status: 'sent'
    };
    
    // Send WebSocket notification if available
    if (global.wsServer) {
      try {
        // Map internal role to WebSocket expected sender type
        let wsUserType = sender_type;
        if (sender_type === 'admin' || sender_type === 'moderator') {
          wsUserType = 'staff';
        } else if (sender_type === 'user') {
          wsUserType = 'requester';
        }
        
        // Notify the appropriate recipient
        if (sender_type === 'user') {
          // If message is from user, notify moderators and admins
          global.wsServer.broadcastToType(['moderator', 'admin'], {
            type: 'new_message',
            message: responseMessage
          });
        } else if (sender_type === 'moderator' || sender_type === 'admin') {
          // If message is from moderator or admin, notify the user
          if (ticket.requester_id) {
            global.wsServer.sendToSpecificClient('requester', ticket.requester_id, {
              type: 'new_message',
              message: responseMessage
            });
          }
        }
        
        console.log(`WebSocket notification sent, sender type: ${wsUserType}`);
      } catch (wsError) {
        console.error('Error sending WebSocket notification:', wsError);
      }
    }
    
    // Send email notification if requested and recipient available
    // Map role types to email notification types if needed
    let emailSenderType = sender_type;
    if (sender_type === 'admin' || sender_type === 'moderator') {
      emailSenderType = 'staff';
    } else if (sender_type === 'user') {
      emailSenderType = 'requester';
    }
    
    if (notify_email && ((emailSenderType === 'staff' && ticket.requester_email) || 
                         (emailSenderType === 'requester' && ticket.assigned_to_email))) {
      const recipientEmail = emailSenderType === 'staff' ? ticket.requester_email : ticket.assigned_to_email;
      const recipientName = emailSenderType === 'staff' ? ticket.requester_name : ticket.assigned_to_name;
      
      try {
        await sendMessageNotification(ticket, responseMessage, {
          email: recipientEmail,
          name: recipientName
        });
        console.log(`Email notification sent to ${recipientEmail}`);
      } catch (emailError) {
        console.error('Error sending email notification:', emailError);
      }
    }
    
    // Return success response with message data
    return res.status(201).json({
      status: 'success',
      message: responseMessage
    });
    
  } catch (error) {
    console.error('Error adding message:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Внутренняя ошибка сервера'
    });
  }
};

/**
 * Обновление статуса сообщения (доставлено/прочитано)
 * Хабарламаның күйін жаңарту (жеткізілді/оқылды)
 */
exports.updateMessageStatus = require('./message/updateMessageStatus');

/**
 * Получение непрочитанных сообщений для пользователя
 * Пайдаланушы үшін оқылмаған хабарламаларды алу
 */
exports.getUnreadMessages = require('./message/getUnreadMessages');

/**
 * Отметить сообщения как прочитанные
 * Хабарламаларды оқылды деп белгілеу
 */
exports.markMessagesAsRead = require('./message/markMessagesAsRead');

/**
 * Загрузить вложение
 * Тіркемені жүктеу
 */
exports.uploadAttachment = require('./message/uploadAttachment');