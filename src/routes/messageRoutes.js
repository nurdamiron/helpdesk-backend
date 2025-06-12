// src/routes/messageRoutes.js
const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const multer = require('multer');
const path = require('path');
const { authenticateJWT } = require('../middleware/auth'); // Обновленный импорт

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'attachment-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  // Разрешенные типы файлов
  const allowedMimes = [
    'image/jpeg', 'image/png', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Недопустимый тип файла'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB
  }
});

// Маршруты для работы с сообщениями
// Получение сообщений заявки - доступно всем авторизованным
router.get('/tickets/:ticketId/messages', authenticateJWT, messageController.getTicketMessages);

// Добавление сообщения - доступно всем авторизованным
router.post('/tickets/:ticketId/messages', authenticateJWT, messageController.addMessage);

// Отметка сообщений как прочитанных - доступно всем авторизованным
router.put('/tickets/:ticketId/messages/read', authenticateJWT, messageController.markMessagesAsRead);

// Загрузка вложения - доступно всем авторизованным
router.post('/tickets/:ticketId/attachments', authenticateJWT, upload.single('file'), messageController.uploadAttachment);

// Обновление статуса сообщения - доступно всем авторизованным
router.put('/:messageId/status', authenticateJWT, messageController.updateMessageStatus);

// Получение непрочитанных сообщений - доступно всем авторизованным
router.get('/unread', authenticateJWT, messageController.getUnreadMessages);



module.exports = router;