// src/controllers/chatController.js
const pool = require('../services/pool');
const wsNotificationService = require('../services/wsNotificationService');

/**
 * Получает историю чата для заявки
 * @param {Object} req - HTTP запрос
 * @param {Object} res - HTTP ответ
 */
exports.getChatHistory = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const numericTicketId = parseInt(ticketId, 10);
    
    // Проверяем существование заявки
    const [tickets] = await pool.query('SELECT * FROM tickets WHERE id = ?', [numericTicketId]);
    
    // Получаем сообщения из заявки
    const [messages] = await pool.query(
      'SELECT * FROM messages WHERE ticket_id = ? ORDER BY created_at ASC',
      [numericTicketId]
    );
    
    return res.json({
      status: 'success',
      ticket_id: numericTicketId,
      messages: messages
    });
  } catch (error) {
    console.error('Error getChatHistory:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Ошибка сервера при получении истории чата'
    });
  }
};

/**
 * Отправляет новое сообщение в чат заявки
 * @param {Object} req - HTTP запрос
 * @param {Object} res - HTTP ответ
 */
exports.sendMessage = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const numericTicketId = parseInt(ticketId, 10);
    const { content, attachments = [] } = req.body;
    
    // Проверяем содержание сообщения
    if (!content || content.trim() === '') {
      return res.status(400).json({
        status: 'error',
        error: 'Необходимо указать содержание сообщения'
      });
    }
    
    // Проверяем существование заявки
    const [tickets] = await pool.query('SELECT * FROM tickets WHERE id = ?', [numericTicketId]);
    if (tickets.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Заявка не найдена'
      });
    }
    
    const ticket = tickets[0];
    
    // Определяем тип отправителя и его ID
    const senderType = req.user && req.user.role === 'staff' ? 'staff' : 'requester';
    const senderId = req.user ? req.user.id : 1; // Используем ID пользователя из запроса или дефолтное значение
    
    // Добавляем сообщение в базу данных
    const [result] = await pool.query(
      `INSERT INTO messages (ticket_id, content, sender_type, sender_id, status, created_at) 
       VALUES (?, ?, ?, ?, 'sent', NOW())`,
      [numericTicketId, content, senderType, senderId]
    );
    
    const messageId = result.insertId;
    
    // Обрабатываем вложения, если они есть
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        await pool.query(
          `INSERT INTO message_attachments (message_id, file_path, file_name, file_type, file_size) 
           VALUES (?, ?, ?, ?, ?)`,
          [messageId, attachment.path, attachment.name, attachment.type, attachment.size]
        );
      }
    }
    
    // Получаем полные данные сообщения
    const [messages] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
    const message = messages[0];
    
    // Подготовим объект вложений, если таблица существует
    let messageAttachments = [];
    try {
      const [attachments] = await pool.query(
        'SELECT * FROM message_attachments WHERE message_id = ?',
        [messageId]
      );
      messageAttachments = attachments;
    } catch (error) {
      // Если таблица не существует, просто продолжаем
      console.log('Note: message_attachments table might not exist');
    }
    
    // Формируем полное сообщение с вложениями
    const fullMessage = {
      ...message,
      attachments: messageAttachments
    };
    
    // Отправляем уведомление через WebSocket
    await wsNotificationService.handleWebSocketNotification(
      fullMessage,
      ticket,
      senderType,
      senderId
    );
    
    // Обновляем статус заявки, если нужно
    if (ticket.status === 'closed') {
      await pool.query(
        'UPDATE tickets SET status = ?, updated_at = NOW() WHERE id = ?',
        ['reopened', numericTicketId]
      );
    }
    
    return res.status(201).json({
      status: 'success',
      message: fullMessage
    });
  } catch (error) {
    console.error('Error sendMessage:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Ошибка сервера при отправке сообщения'
    });
  }
};

/**
 * Обновляет статус сообщения (доставлено, прочитано и т.д.)
 * @param {Object} req - HTTP запрос
 * @param {Object} res - HTTP ответ
 */
exports.updateMessageStatus = async (req, res) => {
  try {
    const { messageId } = req.params;
    const numericMessageId = parseInt(messageId, 10);
    const { status } = req.body;
    
    // Проверяем валидность статуса
    const validStatuses = ['sent', 'delivered', 'read'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'error',
        error: 'Некорректный статус сообщения'
      });
    }
    
    // Проверяем существование сообщения
    const [messages] = await pool.query('SELECT * FROM messages WHERE id = ?', [numericMessageId]);
    if (messages.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Сообщение не найдено'
      });
    }
    
    const message = messages[0];
    
    // Обновляем статус сообщения
    await pool.query(
      'UPDATE messages SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, numericMessageId]
    );
    
    // Отправляем уведомление об изменении статуса
    await wsNotificationService.sendStatusUpdate(message, status);
    
    return res.json({
      status: 'success',
      message: 'Статус сообщения обновлен',
      message_id: numericMessageId,
      new_status: status
    });
  } catch (error) {
    console.error('Error updateMessageStatus:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Ошибка сервера при обновлении статуса сообщения'
    });
  }
};

/**
 * Отправляет индикатор набора текста другим участникам чата
 * @param {Object} req - HTTP запрос
 * @param {Object} res - HTTP ответ
 */
exports.sendTypingIndicator = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const numericTicketId = parseInt(ticketId, 10);
    const { isTyping } = req.body;
    
    // Проверяем существование заявки
    const [tickets] = await pool.query('SELECT * FROM tickets WHERE id = ?', [numericTicketId]);
    if (tickets.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Заявка не найдена'
      });
    }
    
    // Определяем тип отправителя и его ID
    const senderType = req.user && req.user.role === 'staff' ? 'staff' : 'requester';
    const senderId = req.user ? req.user.id : 1; // Используем ID пользователя из запроса или дефолтное значение
    
    // Отправляем индикатор набора текста через WebSocket
    const sent = await wsNotificationService.sendTypingIndicator(
      numericTicketId,
      senderId,
      senderType,
      isTyping
    );
    
    return res.json({
      status: 'success',
      sent: sent,
      typing: isTyping
    });
  } catch (error) {
    console.error('Error sendTypingIndicator:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Ошибка сервера при отправке индикатора набора текста'
    });
  }
};

/**
 * Получает информацию о чате
 * @param {Object} req - HTTP запрос
 * @param {Object} res - HTTP ответ
 */
exports.getChatData = async (req, res) => {
  try {
    const { endpoint, ticketId } = req.query;
    const numericTicketId = ticketId ? parseInt(ticketId, 10) : null;
    
    if (endpoint === 'tickets') {
      const [rows] = await pool.query('SELECT * FROM tickets ORDER BY updated_at DESC');
      return res.json({ tickets: rows });
    }
    
    if (endpoint === 'ticket' && numericTicketId) {
      const [ticket] = await pool.query('SELECT * FROM tickets WHERE id = ?', [numericTicketId]);
      if (!ticket.length) {
        return res.status(404).json({ error: 'Ticket not found' });
      }
      
      const [messages] = await pool.query(
        'SELECT * FROM messages WHERE ticket_id = ? ORDER BY created_at ASC',
        [numericTicketId]
      );
      
      return res.json({
        ticket: {
          ...ticket[0],
          messages: messages
        }
      });
    }
    
    return res.status(400).json({ error: 'Invalid endpoint' });
  } catch (error) {
    console.error('Error in getChatData:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Обновляет статус заявки
 * @param {Object} req - HTTP запрос
 * @param {Object} res - HTTP ответ
 */
exports.updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id, 10);
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    // Проверяем существование заявки
    const [tickets] = await pool.query('SELECT * FROM tickets WHERE id = ?', [numericId]);
    if (!tickets.length) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const [upd] = await pool.query(
      'UPDATE tickets SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, numericId]
    );
    
    if (!upd.affectedRows) {
      return res.status(500).json({ error: 'Update failed' });
    }
    
    return res.json({ message: 'Ticket status updated', status });
  } catch (error) {
    console.error('Error updateTicketStatus:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Удаляет сообщение
 * @param {Object} req - HTTP запрос
 * @param {Object} res - HTTP ответ
 */
exports.deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id, 10);
    const [del] = await pool.query('DELETE FROM messages WHERE id = ?', [numericId]);
    if (!del.affectedRows) {
      return res.status(404).json({ error: 'Message not found' });
    }
    return res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error('Error deleteMessage:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
