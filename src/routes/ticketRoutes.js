// src/routes/ticketRoutes.js
const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const messageController = require('../controllers/messageController');
const multer = require('multer');
const path = require('path');
const { authenticateJWT, isAdmin, isModeratorOrAdmin, hasRole } = require('../middleware/auth');

// Настройка для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniq = Date.now() + '-' + Math.round(Math.random()*1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'ticket-' + uniq + ext);
  }
});

const fileFilter = (req, file, cb) => {
  // Можно расширить список
  const allowed = [
    'image/jpeg','image/png','image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Тип файла не поддерживается'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10*1024*1024 } // 10MB
});

// Middleware заглушка для разработки (должен быть заменен на authenticateJWT в продакшене)
const devAuth = (req, res, next) => {
  // TODO: В продакшене замените на authenticateJWT
  // Временная заглушка для разработки
  req.user = {
    id: 1,
    email: 'dev@localhost',
    role: 'moderator'
  };
  next();
};

// Маршруты для работы с заявками
router.post('/', authenticateJWT, ticketController.createTicket); // Все могут создавать заявки
router.get('/', authenticateJWT, ticketController.getTickets); // Все могут получать заявки (фильтрация в контроллере)
router.get('/analytics', authenticateJWT, isModeratorOrAdmin, ticketController.getTicketsAnalytics); // Только модераторы и администраторы
router.get('/:id', authenticateJWT, ticketController.getTicketById); // Все могут просматривать заявку
router.put('/:id', authenticateJWT, isModeratorOrAdmin, ticketController.updateTicket); // Только модераторы и администраторы
router.delete('/:id', authenticateJWT, isAdmin, ticketController.deleteTicket); // Только администраторы
router.patch('/:id/status', authenticateJWT, isModeratorOrAdmin, ticketController.updateTicketStatus); // Только модераторы и администраторы

// Добавляем маршруты для работы с сообщениями заявок
router.get('/:ticketId/messages', authenticateJWT, messageController.getTicketMessages); // Все могут просматривать сообщения
router.post('/:ticketId/messages', authenticateJWT, messageController.addMessage); // Все могут отправлять сообщения
router.put('/:ticketId/messages/read', authenticateJWT, messageController.markMessagesAsRead); // Все могут отмечать сообщения прочитанными
router.post('/:ticketId/attachments', authenticateJWT, upload.single('file'), messageController.uploadAttachment); // Все могут загружать вложения

// Обновление статуса сообщения в контексте заявки (только модераторы и администраторы)
router.put('/:ticketId/messages/:messageId/status', authenticateJWT, isModeratorOrAdmin, messageController.updateMessageStatus);

module.exports = router;