// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateJWT, isAdmin, isModeratorOrAdmin } = require('../middleware/auth');

// логин - публичный роут
router.post('/login', userController.login);

// все пользователи - только для модераторов и админов
router.get('/', authenticateJWT, isModeratorOrAdmin, userController.getUsers);

// создать пользователя - только для админов
router.post('/', authenticateJWT, isAdmin, userController.createUser);

// получить профиль текущего пользователя
router.get('/me', authenticateJWT, userController.getCurrentUser);

// один пользователь - авторизованные пользователи могут смотреть свой профиль
router.get('/:id', authenticateJWT, userController.getUserById);

// обновить - пользователи могут обновлять свой профиль
router.put('/:id', authenticateJWT, userController.updateUser);

// обновить пароль - пользователи могут менять свой пароль
router.put('/:id/password', authenticateJWT, userController.updatePassword);

// обновить настройки - пользователи могут менять свои настройки
router.put('/:id/settings', authenticateJWT, userController.updateSettings);

// генерировать токен для Telegram - только админы
router.post('/:userId/telegram-token', authenticateJWT, isAdmin, userController.generateTelegramToken);

// удалить - только админы
router.delete('/:id', authenticateJWT, isAdmin, userController.deleteUser);

module.exports = router;
