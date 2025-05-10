// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateJWT } = require('../middleware/auth');

// Публичные маршруты
router.post('/login', authController.login);
router.post('/register', authController.register);

// Маршруты требующие аутентификации
router.get('/me', authenticateJWT, authController.getMe);
router.post('/logout', authenticateJWT, authController.logout);

// Проверим, что у нас нет ссылок на несуществующие методы
router.get('/users', authenticateJWT, authController.getUsers); 

module.exports = router;