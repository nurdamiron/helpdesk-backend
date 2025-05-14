// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateJWT, isAdmin, isModeratorOrAdmin } = require('../middleware/auth');

// Публичные маршруты
router.post('/login', authController.login);
router.post('/register', authController.register);

// Маршруты требующие аутентификации
router.get('/me', authenticateJWT, authController.getMe);
router.post('/logout', authenticateJWT, authController.logout);

// Маршруты управления пользователями (доступны админу и модератору)
router.get('/users', authenticateJWT, isModeratorOrAdmin, authController.getUsers);
router.get('/users/:id', authenticateJWT, isModeratorOrAdmin, authController.getUser);
router.put('/users/:id', authenticateJWT, isModeratorOrAdmin, authController.updateUser);
router.delete('/users/:id', authenticateJWT, isAdmin, authController.deleteUser); // Только админ может удалять

module.exports = router;