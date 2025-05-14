// src/services/messageService.js
const pool = require('../config/database');

/**
 * Получает сообщения заявки с информацией об отправителях
 * Жіберуші туралы ақпараты бар өтінім хабарламаларын алады
 * 
 * @param {number|string} ticketId - ID заявки
 * @returns {Promise<Array>} - Массив сообщений
 */
exports.getTicketMessagesWithSenders = async (ticketId) => {
  const [messages] = await pool.query(`
    SELECT 
      tm.*,
      CASE 
        WHEN tm.sender_type='user' THEN CONCAT(u.first_name, ' ', u.last_name)
        WHEN tm.sender_type='moderator' THEN CONCAT(u.first_name, ' ', u.last_name)
        WHEN tm.sender_type='admin' THEN CONCAT(u.first_name, ' ', u.last_name)
        WHEN tm.sender_type='system' THEN 'System'
        ELSE 'Unknown'
      END as sender_name,
      CASE
        WHEN tm.sender_type IN ('user', 'moderator', 'admin') THEN u.email
        ELSE NULL
      END as sender_email
    FROM ticket_messages tm
    LEFT JOIN users u ON (tm.sender_type IN ('user', 'moderator', 'admin') AND tm.sender_id = u.id)
    WHERE tm.ticket_id = ?
    ORDER BY tm.created_at ASC
  `, [ticketId]);
  
  return messages;
};

/**
 * Получает вложения для заявки
 * Өтінім үшін тіркемелерді алады
 * 
 * @param {number|string} ticketId - ID заявки
 * @returns {Promise<Array>} - Массив вложений
 */
exports.getMessageAttachments = async (ticketId) => {
  const [attachments] = await pool.query(`
    SELECT * FROM ticket_attachments 
    WHERE ticket_id = ? AND message_id IS NOT NULL
  `, [ticketId]);
  
  return attachments;
};

/**
 * Создает новое сообщение и связывает его с вложениями
 * Жаңа хабарлама жасайды және оны тіркемелермен байланыстырады
 * 
 * @param {number|string} ticketId - ID заявки
 * @param {string} senderType - Тип отправителя (user, moderator, admin, system)
 * @param {number|string} senderId - ID отправителя
 * @param {string} content - Содержимое сообщения
 * @param {Array} attachmentIds - Список ID вложений для привязки
 * @returns {Promise<Object>} - Созданное сообщение с вложениями
 */
exports.createMessageWithAttachments = async (ticketId, senderType, senderId, content, attachmentIds = []) => {
  // Создаем сообщение
  // Хабарлама жасаймыз
  const [result] = await pool.query(`
    INSERT INTO ticket_messages (
      ticket_id, 
      sender_type, 
      sender_id, 
      content, 
      content_type,
      status
    ) VALUES (?, ?, ?, ?, ?, 'sent')
  `, [ticketId, senderType, senderId, content, 'text']);
  
  const messageId = result.insertId;
  console.log(`Создано сообщение с ID ${messageId}`);
  console.log(`ID ${messageId} хабарлама жасалды`);
  
  // Если есть вложения, привязываем их к сообщению
  // Егер тіркемелер болса, оларды хабарламаға байланыстырамыз
  if (attachmentIds && attachmentIds.length > 0) {
    console.log(`Связываем ${attachmentIds.length} вложений с сообщением ${messageId}`);
    console.log(`${messageId} хабарламасына ${attachmentIds.length} тіркемелерді байланыстырамыз`);
    
    for (const attachmentId of attachmentIds) {
      await pool.query(`
        UPDATE ticket_attachments 
        SET message_id = ? 
        WHERE id = ? AND ticket_id = ?
      `, [messageId, attachmentId, ticketId]);
    }
  }
  
  // Получаем созданное сообщение с информацией об отправителе
  // Жіберуші туралы ақпараты бар жасалған хабарламаны аламыз
  const [newMessage] = await pool.query(`
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
  
  // Получаем вложения для созданного сообщения
  // Жасалған хабарлама үшін тіркемелерді аламыз
  const [messageAttachments] = await pool.query(`
    SELECT * FROM ticket_attachments 
    WHERE message_id = ?
  `, [messageId]);
  
  console.log(`Получены ${messageAttachments.length} вложений для сообщения ${messageId}`);
  console.log(`${messageId} хабарламасы үшін ${messageAttachments.length} тіркеме алынды`);
  
  // Формируем результат
  // Нәтижені қалыптастырамыз
  return {
    ...newMessage[0],
    sender: {
      id: newMessage[0].sender_id,
      name: newMessage[0].sender_name,
      email: newMessage[0].sender_email,
      type: newMessage[0].sender_type
    },
    attachments: messageAttachments
  };
};

/**
 * Обновляет статус заявки после добавления сообщения
 * Хабарлама қосқаннан кейін өтінім күйін жаңартады
 * 
 * @param {number|string} ticketId - ID заявки
 */
exports.updateTicketStatus = async (ticketId) => {
  // Обновляем статус заявки и дату обновления
  // Если заявка была решена или закрыта, переводим ее в статус "в работе"
  // Өтінім күйін және жаңарту күнін жаңартамыз
  // Егер өтінім шешілген немесе жабық болса, оны "өңделуде" күйіне ауыстырамыз
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
  console.log(`#${ticketId} өтінімінің күйі жаңартылды`);
};

/**
 * Отмечает сообщения как прочитанные
 * Хабарламаларды оқылды деп белгілейді
 * 
 * @param {number|string} ticketId - ID заявки
 * @param {number|string} userId - ID пользователя
 * @param {string} userType - Тип пользователя (user, moderator, admin)
 */
exports.markMessagesAsRead = async (ticketId, userId, userType) => {
  // Определяем, какие сообщения нужно отметить
  // Қандай хабарламаларды белгілеу керектігін анықтаймыз
  let senderType;
  
  if (userType === 'user') {
    // Если пользователь обычный, отмечаем как прочитанные сообщения от модераторов и админов
    senderType = ['moderator', 'admin'];
  } else if (userType === 'moderator' || userType === 'admin') {
    // Если модератор или админ, отмечаем как прочитанные сообщения от пользователей
    senderType = ['user'];
  } else {
    // По умолчанию для совместимости со старым кодом
    senderType = userType === 'requester' ? 'staff' : 'requester';
  }
  
  // Находим сообщения, которые нужно отметить
  // Белгілеу керек хабарламаларды табамыз
  let messagesToMark;
  
  if (Array.isArray(senderType)) {
    // Если у нас массив типов отправителей
    const placeholders = senderType.map(() => '?').join(',');
    const query = `
      SELECT * FROM ticket_messages
      WHERE ticket_id = ? 
      AND sender_type IN (${placeholders})
      AND (read_at IS NULL OR status != 'read')
    `;
    
    const [result] = await pool.query(query, [ticketId, ...senderType]);
    messagesToMark = result;
  } else {
    // Если у нас один тип отправителя
    const [result] = await pool.query(`
      SELECT * FROM ticket_messages
      WHERE ticket_id = ? 
      AND sender_type = ?
      AND (read_at IS NULL OR status != 'read')
    `, [ticketId, senderType]);
    messagesToMark = result;
  }
  
  if (messagesToMark.length === 0) return;
  
  // Обновляем статус сообщений
  // Хабарламалар күйін жаңартамыз
  if (Array.isArray(senderType)) {
    // Если у нас массив типов отправителей
    const placeholders = senderType.map(() => '?').join(',');
    const query = `
      UPDATE ticket_messages
      SET status = 'read', read_at = CURRENT_TIMESTAMP, 
          delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
      WHERE ticket_id = ? 
      AND sender_type IN (${placeholders})
      AND read_at IS NULL
    `;
    
    await pool.query(query, [ticketId, ...senderType]);
  } else {
    // Если у нас один тип отправителя
    await pool.query(`
      UPDATE ticket_messages
      SET status = 'read', read_at = CURRENT_TIMESTAMP, 
          delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
      WHERE ticket_id = ? 
      AND sender_type = ?
      AND read_at IS NULL
    `, [ticketId, senderType]);
  }
  
  console.log(`Отмечено ${messagesToMark.length} сообщений как прочитанные`);
  console.log(`${messagesToMark.length} хабарлама оқылды деп белгіленді`);
  
  // Отправляем уведомления о прочтении через WebSocket
  // WebSocket арқылы оқу туралы хабарландыруларды жіберу
  try {
    if (global.wsServer) {
      for (const msg of messagesToMark) {
        global.wsServer.sendToSpecificClient(senderType, msg.sender_id, {
          type: 'status_update',
          message_id: msg.id,
          ticket_id: parseInt(ticketId),
          status: 'read',
          timestamp: new Date().toISOString()
        });
      }
    }
  } catch (wsError) {
    console.error('Ошибка отправки WebSocket уведомлений:', wsError);
    console.error('WebSocket хабарландыруын жіберу қатесі:', wsError);
  }
};