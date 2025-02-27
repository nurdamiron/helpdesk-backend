const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// Получение данных (контакты, список бесед, конкретная беседа)
router.get('/', chatController.getChatData);

// Создание новой беседы/тикета
router.post('/', chatController.createConversation);

// Отправка сообщения в беседу
router.put('/', chatController.sendMessage);

// Обновление статуса тикета
router.patch('/ticket/:id', chatController.updateTicketStatus);

// Удаление беседы (conversation)
router.delete('/conversation/:id', chatController.deleteConversation);

// Удаление сообщения
router.delete('/message/:id', chatController.deleteMessage);

module.exports = router;
