// src/controllers/message/markMessagesAsRead.js
const { markMessagesAsRead } = require('../../services/messageService');

/**
 * Отметить сообщения как прочитанные
 * Хабарламаларды оқылды деп белгілеу
 * 
 * @param {Object} req - HTTP запрос
 * @param {Object} res - HTTP ответ
 */
module.exports = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user?.id || 1;
    const userType = req.user?.role === 'client' ? 'requester' : 'staff';
    
    console.log(`Запрос на отметку сообщений как прочитанные для заявки #${ticketId}`);
    console.log(`#${ticketId} өтінімі үшін хабарламаларды оқылды деп белгілеу сұрауы`);
    
    await markMessagesAsRead(ticketId, userId, userType);
    
    console.log(`Сообщения заявки #${ticketId} отмечены как прочитанные`);
    console.log(`#${ticketId} өтінімінің хабарламалары оқылды деп белгіленді`);
    
    return res.json({
      status: 'success',
      message: 'Сообщения отмечены как прочитанные'
    });
    
  } catch (error) {
    console.error('Ошибка отметки сообщений как прочитанных:', error);
    console.error('Хабарламаларды оқылды деп белгілеу қатесі:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Внутренняя ошибка сервера'
    });
  }
};