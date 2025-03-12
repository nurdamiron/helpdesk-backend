// src/routes/ticketRoutes.js
const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const multer = require('multer');
const path = require('path');

// Настройка хранилища для файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'ticket-' + uniqueSuffix + ext);
  }
});

// Фильтр допустимых типов файлов
const fileFilter = (req, file, cb) => {
  // Разрешенные типы файлов
  const allowedTypes = [
    'image/jpeg', 
    'image/png', 
    'image/gif', 
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Неподдерживаемый тип файла'), false);
  }
};

// Инициализация загрузки
const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  }
});

// Публичные маршруты (без аутентификации)
// Создание новой заявки
router.post('/', ticketController.createTicket);

// Маршруты для всех пользователей (с или без аутентификации)
// Получение списка заявок с фильтрацией и пагинацией
router.get('/', ticketController.getTickets);

// Получение заявки по ID
router.get('/:id', ticketController.getTicketById);

// Обновление заявки
router.put('/:id', ticketController.updateTicket);

// Удаление заявки
router.delete('/:id', ticketController.deleteTicket);

// Добавление сообщения к заявке
router.post('/:id/messages', ticketController.addMessage);

// Загрузка вложения к заявке
router.post('/:id/attachments', upload.single('file'), ticketController.uploadAttachment);

module.exports = router;