// src/routes/ticketRoutes.js
const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const multer = require('multer');
const path = require('path');

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

// Роуты
router.post('/', ticketController.createTicket);
router.get('/', ticketController.getTickets);
router.get('/:id', ticketController.getTicketById);
router.put('/:id', ticketController.updateTicket);
router.delete('/:id', ticketController.deleteTicket);
router.post('/:id/messages', ticketController.addMessage);
router.post('/:id/attachments', upload.single('file'), ticketController.uploadAttachment);

module.exports = router;
