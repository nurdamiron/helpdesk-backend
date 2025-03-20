// src/controllers/messageController.js
const pool = require('../config/database');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Настраиваем transporter для отправки почты
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Обработчик для получения сообщений заявки
exports.getTicketMessages = async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    console.log(`Запрос на получение сообщений для заявки #${ticketId}`);
    
    // Проверяем существование заявки
    const [tickets] = await pool.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    if (tickets.length === 0) {
      console.log(`Заявка #${ticketId} не найдена`);
      return res.status(404).json({ 
        status: 'error', 
        error: 'Заявка не найдена' 
      });
    }
    
    // Получаем сообщения
    const [messages] = await pool.query(`
      SELECT 
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
      WHERE tm.ticket_id = ?
      ORDER BY tm.created_at ASC
    `, [ticketId]);
    
    console.log(`Найдено ${messages.length} сообщений для заявки #${ticketId}`);
    
    // Получаем вложения для сообщений
    const [attachments] = await pool.query(`
      SELECT * FROM ticket_attachments 
      WHERE ticket_id = ? AND message_id IS NOT NULL
    `, [ticketId]);
    
    console.log(`Найдено ${attachments.length} вложений для заявки #${ticketId}`);
    
    // Добавляем вложения к сообщениям
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
    
    return res.json({
      status: 'success',
      messages: messagesWithAttachments
    });
    
  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Внутренняя ошибка сервера'
    });
  }
};

// Обработчик для добавления сообщения к заявке
exports.addMessage = async (req, res) => {
  try {
    const { ticketId } = req.params;
    let { body, attachments = [], notify_email = false } = req.body;
    
    console.log(`Запрос на добавление сообщения к заявке #${ticketId}:`, {
      body: body ? (body.length > 100 ? body.substring(0, 100) + '...' : body) : null,
      attachments,
      notify_email
    });
    
    // Нормализуем body
    if (body === undefined || body === null) {
      body = '';
    }
    
    // Определяем отправителя (staff - сотрудник, requester - клиент)
    // По умолчанию считаем, что это сотрудник
    const sender_type = req.user?.role === 'client' ? 'requester' : 'staff';
    const sender_id = req.user?.id || 1; // Используем ID из req.user или 1 по умолчанию
    
    console.log(`Отправитель: тип=${sender_type}, id=${sender_id}`);
    
    // Проверяем, есть ли хоть что-то в сообщении (текст или вложения)
    if (!body.trim() && (!attachments || attachments.length === 0)) {
      console.log(`Ошибка: пустое сообщение без вложений`);
      return res.status(400).json({ 
        status: 'error', 
        error: 'Сообщение должно содержать текст или вложения' 
      });
    }
    
    // Проверяем существование заявки и получаем данные о клиенте
    const [tickets] = await pool.query(`
      SELECT t.*, r.email as requester_email, r.full_name as requester_name
      FROM tickets t
      LEFT JOIN requesters r ON t.requester_id = r.id
      WHERE t.id = ?
    `, [ticketId]);
    
    if (tickets.length === 0) {
      console.log(`Заявка #${ticketId} не найдена`);
      return res.status(404).json({ 
        status: 'error', 
        error: 'Заявка не найдена' 
      });
    }
    
    const ticket = tickets[0];
    console.log(`Заявка #${ticketId} найдена, клиент: ${ticket.requester_email || 'email не указан'}`);
    
    // Создаем сообщение
    const [result] = await pool.query(`
      INSERT INTO ticket_messages (
        ticket_id, 
        sender_type, 
        sender_id, 
        content, 
        content_type,
        status
      ) VALUES (?, ?, ?, ?, ?, 'sent')
    `, [ticketId, sender_type, sender_id, body, 'text']);
    
    const messageId = result.insertId;
    console.log(`Создано сообщение с ID ${messageId}`);
    
    // Отправляем уведомление через WebSocket
try {
  // Импортируем модуль сервера
  const server = require('../../server');
  
  if (server && typeof server.broadcastUpdate === 'function') {
    // Определяем получателя
    const recipientType = sender_type === 'requester' ? 'staff' : 'requester';
    const recipientId = recipientType === 'requester' ? ticket.requester_id : '1'; // ID первого сотрудника
    
    server.broadcastUpdate({
      type: 'new_message',
      message: {
        id: message.id,
        ticket_id: parseInt(ticketId),
        content: message.content,
        content_type: message.content_type,
        created_at: message.created_at,
        sender: {
          id: message.sender.id,
          name: message.sender.name,
          type: message.sender.type
        },
        status: 'sent'
      }
    }, recipientType, recipientId);
  }
} catch (wsError) {
  console.error('Ошибка отправки WebSocket уведомления:', wsError);
  // Не блокируем основной процесс при ошибке WebSocket
}

    // Если есть вложения, связываем их с сообщением
    if (attachments && attachments.length > 0) {
      console.log(`Связываем ${attachments.length} вложений с сообщением ${messageId}`);
      
      for (const attachmentId of attachments) {
        await pool.query(`
          UPDATE ticket_attachments 
          SET message_id = ? 
          WHERE id = ? AND ticket_id = ?
        `, [messageId, attachmentId, ticketId]);
      }
    }
    
    // Обновляем статус заявки и дату обновления
    // Если заявка была решена или закрыта, переводим ее в статус "в работе"
    await pool.query(`
      UPDATE tickets 
      SET 
        updated_at = CURRENT_TIMESTAMP,
        status = CASE 
                  WHEN status = 'resolved' THEN 'in_progress'
                  WHEN status = 'closed' THEN 'in_progress'
                  ELSE status 
                END
      WHERE id = ?
    `, [ticketId]);
    
    console.log(`Обновлен статус заявки #${ticketId}`);
    
    // Получаем информацию о созданном сообщении
    const [newMessage] = await pool.query(`
      SELECT 
        m.*,
        CASE 
          WHEN m.sender_type='requester' THEN r.full_name
          WHEN m.sender_type='staff' THEN u.first_name
          ELSE 'Unknown'
        END as sender_name,
        CASE
          WHEN m.sender_type='requester' THEN r.email
          WHEN m.sender_type='staff' THEN u.email
          ELSE NULL
        END as sender_email
      FROM ticket_messages m
      LEFT JOIN requesters r ON (m.sender_type='requester' AND m.sender_id = r.id)
      LEFT JOIN users u ON (m.sender_type='staff' AND m.sender_id = u.id)
      WHERE m.id = ?
    `, [messageId]);
    
    // Получаем вложения для сообщения
    const [messageAttachments] = await pool.query(`
      SELECT * FROM ticket_attachments 
      WHERE message_id = ?
    `, [messageId]);
    
    console.log(`Получены ${messageAttachments.length} вложений для сообщения ${messageId}`);
    
    const message = {
      ...newMessage[0],
      sender: {
        id: newMessage[0].sender_id,
        name: newMessage[0].sender_name,
        email: newMessage[0].sender_email,
        type: newMessage[0].sender_type
      },
      attachments: messageAttachments
    };
    
    // Отправляем уведомление на email клиента, если это требуется
    // и если у клиента указан email
    if (notify_email && ticket.requester_email) {
      console.log(`Отправка email-уведомления на адрес ${ticket.requester_email}`);
      try {
        await sendMessageNotification(
          ticket, 
          message, 
          messageAttachments
        );
        console.log(`Email успешно отправлен на ${ticket.requester_email}`);
      } catch (emailError) {
        console.error('Ошибка отправки email-уведомления:', emailError);
        // Не возвращаем ошибку, чтобы не блокировать добавление сообщения
      }
    } else if (notify_email) {
      console.log(`Email не отправлен: email клиента не указан`);
    }
    
    // Возвращаем созданное сообщение в ответе
    return res.status(201).json({
      status: 'success',
      message
    });
    
  } catch (error) {
    console.error('Error adding message:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Внутренняя ошибка сервера'
    });
  }
};

// Функция отправки уведомления на email
async function sendMessageNotification(ticket, message, attachments = []) {
  // Проверка наличия email
  if (!ticket.requester_email) {
    throw new Error('Email recipient not specified');
  }

  // Формируем URL для перехода к заявке
  const ticketUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${ticket.id}`;
  
  // Формируем HTML письма
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f8f9fa;
        }
        .header {
          background: linear-gradient(135deg, #0066cc, #004d99);
          color: white;
          padding: 30px;
          text-align: center;
          border-radius: 5px 5px 0 0;
        }
        .content {
          background: white;
          padding: 30px;
          border-radius: 0 0 5px 5px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .message {
          background-color: #f5f5f5;
          border-left: 4px solid #0066cc;
          padding: 15px;
          margin: 15px 0;
        }
        .button {
          display: inline-block;
          padding: 12px 25px;
          background: #0066cc;
          color: white;
          text-decoration: none;
          border-radius: 4px;
          font-weight: 600;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #666;
          font-size: 12px;
        }
        .attachment {
          background-color: #f8f9fa;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          padding: 10px;
          margin: 10px 0;
          display: inline-block;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Helpdesk</h1>
          <p>Система поддержки клиентов</p>
        </div>
        <div class="content">
          <h2>Новое сообщение в вашей заявке</h2>
          <p>Здравствуйте, ${ticket.requester_name || 'уважаемый клиент'}!</p>
          <p>Вы получили новое сообщение в вашей заявке <strong>#${ticket.id}: ${ticket.subject}</strong>.</p>
          
          <div class="message">
            <p><strong>Сообщение от ${message.sender.name || 'сотрудника службы поддержки'}:</strong></p>
            <p>${message.content || 'Прикреплены файлы. Смотрите раздел вложений.'}</p>
            
            ${attachments.length > 0 ? 
              `<p><strong>Вложения:</strong></p>
              <div>
                ${attachments.map(attachment => `
                  <div class="attachment">
                    <span>📎 ${attachment.file_name}</span>
                  </div>
                `).join('')}
              </div>` : 
              ''
            }
          </div>
          
          <p>Для просмотра полной истории обращения или ответа на сообщение, пожалуйста, перейдите по ссылке:</p>
          <p style="text-align: center;">
            <a href="${ticketUrl}" class="button">Перейти к заявке</a>
          </p>
          
          <p>Если у вас возникли вопросы, вы можете ответить на это письмо или связаться с нами по указанным на сайте контактам.</p>
          
          <p>С уважением,<br>Служба поддержки</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Helpdesk. Все права защищены.</p>
          <p>Это автоматическое уведомление. Пожалуйста, не отвечайте на него напрямую.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  // Настройки письма
  const mailOptions = {
    from: `"Служба поддержки" <${process.env.EMAIL_USER}>`,
    to: ticket.requester_email,
    subject: `Новое сообщение в заявке #${ticket.id}`,
    html: html
  };
  
  // Отправляем письмо
  return await transporter.sendMail(mailOptions);
}

// Обновление статуса сообщения (доставлено/прочитано)
exports.updateMessageStatus = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { status } = req.body;
    
    if (!['delivered', 'read'].includes(status)) {
      return res.status(400).json({
        status: 'error',
        error: 'Недопустимый статус сообщения'
      });
    }
    
    // Проверяем существование сообщения
    const [messages] = await pool.query(
      'SELECT * FROM ticket_messages WHERE id = ?', 
      [messageId]
    );
    
    if (messages.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Сообщение не найдено'
      });
    }
    
    const message = messages[0];
    
    // Обновляем статус и соответствующую временную метку
    if (status === 'delivered' && !message.delivered_at) {
      await pool.query(
        'UPDATE ticket_messages SET status = ?, delivered_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, messageId]
      );
    } else if (status === 'read' && !message.read_at) {
      await pool.query(
        'UPDATE ticket_messages SET status = ?, read_at = CURRENT_TIMESTAMP, delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP) WHERE id = ?',
        [status, messageId]
      );
    }
    
    // Получаем обновленное сообщение
    const [updatedMessages] = await pool.query(
      'SELECT * FROM ticket_messages WHERE id = ?',
      [messageId]
    );
    
    return res.json({
      status: 'success',
      message: updatedMessages[0]
    });
  } catch (error) {
    console.error('Error updating message status:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Внутренняя ошибка сервера'
    });
  }
};


// Получение непрочитанных сообщений для пользователя
exports.getUnreadMessages = async (req, res) => {
  try {
    const { userId, userType = 'staff' } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        error: 'ID пользователя обязателен'
      });
    }
    
    // Для сотрудников - получаем непрочитанные сообщения от клиентов
    // Для клиентов - получаем непрочитанные сообщения от сотрудников
    const senderType = userType === 'staff' ? 'requester' : 'staff';
    
    const [messages] = await pool.query(`
      SELECT 
        tm.*,
        t.subject as ticket_subject,
        CASE 
          WHEN tm.sender_type='requester' THEN r.full_name
          WHEN tm.sender_type='staff' THEN u.first_name
          ELSE 'Unknown'
        END as sender_name
      FROM ticket_messages tm
      JOIN tickets t ON tm.ticket_id = t.id
      LEFT JOIN requesters r ON (tm.sender_type='requester' AND tm.sender_id = r.id)
      LEFT JOIN users u ON (tm.sender_type='staff' AND tm.sender_id = u.id)
      WHERE tm.read_at IS NULL
      AND tm.sender_type = ?
      AND ((? = 'staff') OR (? = 'requester' AND t.requester_id = ?))
      ORDER BY tm.created_at DESC
    `, [senderType, userType, userType, userId]);
    
    // Группируем сообщения по заявкам
    const ticketGroups = {};
    messages.forEach(message => {
      if (!ticketGroups[message.ticket_id]) {
        ticketGroups[message.ticket_id] = {
          ticket_id: message.ticket_id,
          subject: message.ticket_subject,
          messages: []
        };
      }
      
      ticketGroups[message.ticket_id].messages.push({
        id: message.id,
        content: message.content,
        sender_type: message.sender_type,
        sender_id: message.sender_id,
        sender_name: message.sender_name,
        created_at: message.created_at
      });
    });
    
    return res.json({
      status: 'success',
      unreadCount: messages.length,
      ticketGroups: Object.values(ticketGroups)
    });
  } catch (error) {
    console.error('Error getting unread messages:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Внутренняя ошибка сервера'
    });
  }
};


// Отметить сообщения как прочитанные
exports.markMessagesAsRead = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user?.id;
    
    console.log(`Запрос на отметку сообщений как прочитанные для заявки #${ticketId}`);
    
    // Обновляем время прочтения для всех сообщений от клиентов в этой заявке
    await pool.query(`
      UPDATE ticket_messages
      SET read_at = CURRENT_TIMESTAMP
      WHERE ticket_id = ? 
      AND sender_type = 'requester'
      AND read_at IS NULL
    `, [ticketId]);
    
    console.log(`Сообщения заявки #${ticketId} отмечены как прочитанные`);
    
    return res.json({
      status: 'success',
      message: 'Сообщения отмечены как прочитанные'
    });
    
  } catch (error) {
    console.error('Error marking messages as read:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Внутренняя ошибка сервера'
    });
  }
};

// Загрузить вложение
exports.uploadAttachment = async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    console.log(`Запрос на загрузку вложения для заявки #${ticketId}`);
    
    if (!req.file) {
      console.log('Ошибка: файл не загружен');
      return res.status(400).json({
        status: 'error',
        error: 'Файл не загружен'
      });
    }
    
    // Проверяем существование заявки
    const [tickets] = await pool.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    if (tickets.length === 0) {
      console.log(`Заявка #${ticketId} не найдена`);
      return res.status(404).json({
        status: 'error',
        error: 'Заявка не найдена'
      });
    }
    
    const { filename, path, mimetype, size } = req.file;
    const userId = req.user?.id;
    
    console.log(`Загрузка файла: ${filename}, размер: ${size}, MIME: ${mimetype}`);
    
    // Сохраняем вложение в БД
    const [result] = await pool.query(`
      INSERT INTO ticket_attachments (
        ticket_id,
        file_name,
        file_path,
        file_type,
        file_size,
        uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [ticketId, filename, path, mimetype, size, userId]);
    
    const attachmentId = result.insertId;
    console.log(`Создано вложение с ID ${attachmentId}`);
    
    // Получаем данные созданного вложения
    const [attachment] = await pool.query('SELECT * FROM ticket_attachments WHERE id = ?', [attachmentId]);
    
    if (attachment.length === 0) {
      console.log(`Ошибка: не удалось найти созданное вложение ${attachmentId}`);
      return res.status(500).json({
        status: 'error',
        error: 'Ошибка при сохранении вложения'
      });
    }
    
    console.log(`Вложение успешно создано: ${attachment[0].file_name}`);
    
    return res.status(201).json({
      status: 'success',
      attachment: attachment[0]
    });
    
  } catch (error) {
    console.error('Error uploading attachment:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Внутренняя ошибка сервера'
    });
  }
};