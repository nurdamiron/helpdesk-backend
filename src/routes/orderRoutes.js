// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// Список заказов
router.get('/', orderController.getAllOrders);

// Один заказ
router.get('/:id', orderController.getOrderById);

// Создать заказ
router.post('/', orderController.createOrder);

// Обновить заказ
router.put('/:id', orderController.updateOrder);

// Удалить заказ
router.delete('/:id', orderController.deleteOrder);

module.exports = router;
