// src/controllers/message/updateMessageStatus.js
const pool = require('../../config/database');
const { sendStatusUpdate } = require('../../services/wsNotificationService');

/**
 * Обновление статуса сообщения (доставлено/прочитано)
 * Хабарламаның күйін жаңарту (жеткізілді/оқылды)
 * 
 * @param {Object} req - HTTP запрос
 * @param {Object} res - HTTP ответ
 */
module.exports = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { status } = req.body;
    
    if (!['delivered', 'read'].includes(status)) {
      return res.status(400).json({
        status: 'error',
        error: 'Недопустимый статус сообщения (Жарамсыз хабарлама күйі)'
      });
    }
    
    // Проверяем существование сообщения
    // Хабарламаның бар-жоғын тексереміз
    const [messages] = await pool.query(
      'SELECT * FROM ticket_messages WHERE id = ?', 
      [messageId]
    );
    
    if (messages.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Сообщение не найдено (Хабарлама табылмады)'
      });
    }
    
    const message = messages[0];
    
    // Обновляем статус и соответствующую временную метку
    // Күйді және тиісті уақыт белгісін жаңартамыз
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
    // Жаңартылған хабарламаны аламыз
    const [updatedMessages] = await pool.query(
      'SELECT * FROM ticket_messages WHERE id = ?',
      [messageId]
    );
    
    // Отправляем уведомление через WebSocket
    // WebSocket арқылы хабарландыру жіберу
    await sendStatusUpdate(message, status);
    
    return res.json({
      status: 'success',
      message: updatedMessages[0]
    });
  } catch (error) {
    console.error('Ошибка обновления статуса сообщения:', error);
    console.error('Хабарлама күйін жаңарту қатесі:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Внутренняя ошибка сервера'
    });
  }
};