// src/routes/employeeRoutes.js
const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { authenticateJWT, isAdmin } = require('../middleware/auth');

// Маршруты для управления сотрудниками
// Создание сотрудника - публичный доступ для создания через форму заявки
router.post('/', employeeController.createEmployee);

// Получение списка сотрудников - только для авторизованных админов
router.get('/', authenticateJWT, isAdmin, employeeController.getEmployees);

// Получение статистики по сотрудникам - только для авторизованных админов
router.get('/stats/summary', authenticateJWT, isAdmin, employeeController.getEmployeeStats);

// Получение сотрудника по ID - только для авторизованных админов
router.get('/:id', authenticateJWT, isAdmin, employeeController.getEmployeeById);

// Обновление сотрудника - только для авторизованных админов
router.put('/:id', authenticateJWT, isAdmin, employeeController.updateEmployee);

// Удаление сотрудника - только для авторизованных админов
router.delete('/:id', authenticateJWT, isAdmin, employeeController.deleteEmployee);

module.exports = router;
