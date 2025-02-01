// routes/invoiceRoutes.js
const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');

// Список счетов
router.get('/', invoiceController.getAllInvoices);
// Один счёт
router.get('/:id', invoiceController.getInvoiceById);
// Создать счёт
router.post('/', invoiceController.createInvoice);
// Обновить счёт
router.put('/:id', invoiceController.updateInvoice);
// Удалить счёт
router.delete('/:id', invoiceController.deleteInvoice);

module.exports = router;
