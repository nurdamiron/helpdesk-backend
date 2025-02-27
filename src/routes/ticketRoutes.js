const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');

// Создание нового тикета
router.post('/', ticketController.createTicket);

// Получение списка тикетов
router.get('/', ticketController.getTickets);

// Получение деталей тикета по ID
router.get('/:id', ticketController.getTicketById);

// Обновление тикета (PUT)
router.put('/:id', ticketController.updateTicket);

// Удаление тикета
router.delete('/:id', ticketController.deleteTicket);

module.exports = router;
