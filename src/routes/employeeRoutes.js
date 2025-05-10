// src/routes/employeeRoutes.js
const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { authenticateJWT, isAdmin } = require('../middleware/auth');

// Маршруты для управления сотрудниками
// Создание сотрудника - публичный доступ для создания через форму заявки
router.post('/', employeeController.createEmployee);

// Получение списка сотрудников - только для авторизованных админов
router.get('/', employeeController.getEmployees);

// Получение статистики по сотрудникам - только для авторизованных админов
router.get('/stats/summary', employeeController.getEmployeeStats);

// Получение сотрудника по ID - только для авторизованных админов
router.get('/:id', employeeController.getEmployeeById);

// Обновление сотрудника - только для авторизованных админов
router.put('/:id', employeeController.updateEmployee);

// Удаление сотрудника - только для авторизованных админов
router.delete('/:id', employeeController.deleteEmployee);

module.exports = router;
