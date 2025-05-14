// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// логин
router.post('/login', userController.login);
// все пользователи
router.get('/', userController.getUsers);
// создать
router.post('/', userController.createUser);
// один пользователь
router.get('/:id', userController.getUserById);
// обновить
router.put('/:id', userController.updateUser);
// обновить пароль
router.put('/:id/password', userController.updatePassword);
// обновить настройки
router.put('/:id/settings', userController.updateSettings);
// удалить
router.delete('/:id', userController.deleteUser);

module.exports = router;
