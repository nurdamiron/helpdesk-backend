// src/routes/messageRoutes.js
const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth'); // Убедитесь, что middleware для авторизации существует

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

// Маршруты для работы с сообщениями
// Получение сообщений заявки
router.get('/tickets/:ticketId/messages', messageController.getTicketMessages);

// Добавление сообщения - используйте auth в продакшене
router.post('/tickets/:ticketId/messages', devAuth, messageController.addMessage);

// Отметка сообщений как прочитанных
router.put('/tickets/:ticketId/messages/read', devAuth, messageController.markMessagesAsRead);

// Загрузка вложения
router.post('/tickets/:ticketId/attachments', devAuth, upload.single('file'), messageController.uploadAttachment);

module.exports = router;