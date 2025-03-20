// src/controllers/message/getUnreadMessages.js
const pool = require('../../config/database');

/**
 * Получение непрочитанных сообщений для пользователя
 * Пайдаланушы үшін оқылмаған хабарламаларды алу
 * 
 * @param {Object} req - HTTP запрос
 * @param {Object} res - HTTP ответ
 */
module.exports = async (req, res) => {
  try {
    const { userId, userType = 'staff' } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        error: 'ID пользователя обязателен (Пайдаланушы ID міндетті)'
      });
    }
    
    // Для сотрудников - получаем непрочитанные сообщения от клиентов
    // Для клиентов - получаем непрочитанные сообщения от сотрудников
    // Қызметкерлер үшін - клиенттерден келген оқылмаған хабарламаларды аламыз
    // Клиенттер үшін - қызметкерлерден келген оқылмаған хабарламаларды аламыз
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
    // Хабарламаларды өтінімдер бойынша топтастырамыз
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
    console.error('Ошибка получения непрочитанных сообщений:', error);
    console.error('Оқылмаған хабарламаларды алу қатесі:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Внутренняя ошибка сервера'
    });
  }
};