// routes/customerRoutes.js
const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');

// CRUD для клиентов
router.get('/', customerController.getAllCustomers); // Получить всех клиентов (с поиском/пагинацией)
router.get('/:id', customerController.getCustomerById); // Получить клиента по ID
router.post('/', customerController.createCustomer); // Создать клиента
router.put('/:id', customerController.updateCustomer); // Обновить клиента
router.delete('/:id', customerController.deleteCustomer); // Удалить клиента

module.exports = router;
