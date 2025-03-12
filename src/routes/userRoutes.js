// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Вход пользователя (авторизация)
router.post('/login', userController.login);

// Получение списка пользователей
router.get('/', userController.getUsers);

// Создание нового пользователя
router.post('/', userController.createUser);

// Получение данных конкретного пользователя
router.get('/:id', userController.getUserById);

// Обновление данных пользователя
router.put('/:id', userController.updateUser);

// Удаление пользователя
router.delete('/:id', userController.deleteUser);

module.exports = router;