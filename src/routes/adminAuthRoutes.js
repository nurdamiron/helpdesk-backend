// src/routes/adminAuthRoutes.js
const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');

// Маршрут для входа администраторов
router.post('/login', adminAuthController.login);

// Маршрут для получения списка пользователей
router.get('/users', adminAuthController.getUsers);

// Маршрут для проверки статуса администратора
router.get('/check', adminAuthController.checkAdmin);

module.exports = router;