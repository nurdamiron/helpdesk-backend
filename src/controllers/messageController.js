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
    let { content, attachments = [], notify_email = false } = req.body;
    
    // В зависимости от входящего API, параметр может быть content или body
    // API кірісіне байланысты параметр content немесе body болуы мүмкін
    if (!content && req.body.body) {
      content = req.body.body;
    }
    
    console.log(`Запрос на добавление сообщения к заявке #${ticketId}`);
    console.log(`#${ticketId} өтініміне хабарлама қосу сұрауы`);
    
    // Нормализуем content
    // Content параметрін қалыпқа келтіреміз
    if (content === undefined || content === null) {
      content = '';
    }
    
    // Определяем отправителя (staff - сотрудник, requester - клиент)
    // Жіберушіні анықтаймыз (staff - қызметкер, requester - клиент)
    const sender_type = req.user?.role === 'client' ? 'requester' : 'staff';
    const sender_id = req.user?.id || 1; // Используем ID из req.user или 1 по умолчанию
    
    console.log(`Отправитель: тип=${sender_type}, id=${sender_id}`);
    console.log(`Жіберуші: түрі=${sender_type}, id=${sender_id}`);
    
    // Проверяем, есть ли хоть что-то в сообщении (текст или вложения)
    // Хабарламада бірдеңе бар-жоғын тексереміз (мәтін немесе тіркемелер)
    if (!content.trim() && (!attachments || attachments.length === 0)) {
      console.log(`Ошибка: пустое сообщение без вложений`);
      console.log(`Қате: мәтінсіз және тіркемесіз бос хабарлама`);
      return res.status(400).json({ 
        status: 'error', 
        error: 'Сообщение должно содержать текст или вложения' 
      });
    }
    
    // Проверяем существование заявки и получаем данные о клиенте
    // Өтінімнің бар-жоғын тексеріп, клиент туралы мәліметтерді аламыз
    const [tickets] = await pool.query(`
      SELECT t.*, r.email as requester_email, r.full_name as requester_name
      FROM tickets t
      LEFT JOIN requesters r ON t.requester_id = r.id
      WHERE t.id = ?
    `, [ticketId]);
    
    if (tickets.length === 0) {
      console.log(`Заявка #${ticketId} не найдена`);
      console.log(`#${ticketId} өтінімі табылмады`);
      return res.status(404).json({ 
        status: 'error', 
        error: 'Заявка не найдена' 
      });
    }
    
    const ticket = tickets[0];
    console.log(`Заявка #${ticketId} найдена, клиент: ${ticket.requester_email || 'email не указан'}`);
    console.log(`#${ticketId} өтінімі табылды, клиент: ${ticket.requester_email || 'email көрсетілмеген'}`);
    
    // Создаем сообщение с вложениями
    const message = await createMessageWithAttachments(
      ticketId, 
      sender_type, 
      sender_id, 
      content, 
      attachments
    );
    
    // Обновляем статус заявки
    await updateTicketStatus(ticketId);
    
    // Отправляем уведомление через WebSocket
    await handleWebSocketNotification(message, ticket, sender_type, sender_id);
    
    // Отправляем уведомление на email клиента, если это требуется
    // и если у клиента указан email
    // Клиентке email-хабарландыру жіберу, егер бұл қажет болса 
    // және клиенттің email-і көрсетілген болса
    if (notify_email && ticket.requester_email) {
      console.log(`Отправка email-уведомления на адрес ${ticket.requester_email}`);
      console.log(`${ticket.requester_email} адресіне email-хабарландыру жіберу`);
      try {
        await sendMessageNotification(
          ticket, 
          message, 
          message.attachments
        );
        console.log(`Email успешно отправлен на ${ticket.requester_email}`);
        console.log(`Email ${ticket.requester_email} адресіне сәтті жіберілді`);
      } catch (emailError) {
        console.error('Ошибка отправки email-уведомления:', emailError);
        console.error('Email-хабарландыруын жіберу қатесі:', emailError);
        // Не возвращаем ошибку, чтобы не блокировать добавление сообщения
      }
    } else if (notify_email) {
      console.log(`Email не отправлен: email клиента не указан`);
      console.log(`Email жіберілмеді: клиенттің email-і көрсетілмеген`);
    }
    
    // Возвращаем созданное сообщение в ответе
    // Жауапта жасалған хабарламаны қайтарамыз
    return res.status(201).json({
      status: 'success',
      message
    });
    
  } catch (error) {
    console.error('Ошибка добавления сообщения:', error);
    console.error('Хабарлама қосу қатесі:', error);
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