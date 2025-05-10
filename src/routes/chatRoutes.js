// src/routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticateJWT } = require('../middleware/auth');

// Получение списка чатов/заявок
router.get('/', authenticateJWT, chatController.getChatData);

// Получение истории чата для конкретной заявки
router.get('/tickets/:ticketId/messages', authenticateJWT, chatController.getChatHistory);

// Отправка сообщения в чат заявки
router.post('/tickets/:ticketId/messages', authenticateJWT, chatController.sendMessage);

// Обновление статуса сообщения
router.put('/messages/:messageId/status', authenticateJWT, chatController.updateMessageStatus);

// Отправка индикатора набора текста
router.post('/tickets/:ticketId/typing', authenticateJWT, chatController.sendTypingIndicator);

// Обновление статуса заявки
router.patch('/tickets/:id/status', authenticateJWT, chatController.updateTicketStatus);

// Удаление сообщения
router.delete('/messages/:id', authenticateJWT, chatController.deleteMessage);

module.exports = router;
