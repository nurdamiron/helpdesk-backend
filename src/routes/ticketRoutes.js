// src/routes/ticketRoutes.js
const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const messageController = require('../controllers/messageController');
const multer = require('multer');
const path = require('path');
const { authenticateJWT } = require('../middleware/auth');

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

// Для упрощения разработки можно временно отключить проверку авторизации
const devAuth = (req, res, next) => {
  // В реальном проекте используйте auth middleware
  // В режиме разработки можем имитировать пользователя
  req.user = {
    id: 1,
    email: 'dev@example.com',
    role: 'staff'
  };
  next();
};

// Маршруты для работы с заявками
router.post('/', ticketController.createTicket);
router.get('/', ticketController.getTickets);
router.get('/:id', ticketController.getTicketById);
router.put('/:id', ticketController.updateTicket);
router.delete('/:id', ticketController.deleteTicket);
router.patch('/:id/status', ticketController.updateTicketStatus);

// Добавляем маршруты для работы с сообщениями заявок
router.get('/:ticketId/messages', messageController.getTicketMessages);
router.post('/:ticketId/messages', devAuth, messageController.addMessage);
router.put('/:ticketId/messages/read', devAuth, messageController.markMessagesAsRead);
router.post('/:ticketId/attachments', devAuth, upload.single('file'), messageController.uploadAttachment);

// Обновление статуса сообщения в контексте заявки
router.put('/:ticketId/messages/:messageId/status', devAuth, messageController.updateMessageStatus);

module.exports = router;