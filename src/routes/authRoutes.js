// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// Публичные маршруты
router.post('/login', authController.login);
router.post('/register', authController.register);

// Маршруты требующие аутентификации
router.get('/me', auth, authController.getMe);
router.post('/logout', auth, authController.logout);

// Обратите внимание, что в authController должны быть реализованы все эти методы
// Проверим, что у нас нет ссылок на несуществующие методы
router.get('/users', auth, authController.getUsers); 

// Ошибка была в следующих строках - getUserById мог быть не определен
// Закомментируем эти строки, если соответствующие методы не реализованы
// router.get('/users/:id', auth, authController.getUserById);
// router.put('/users/:id', auth, authController.updateUser);
// router.delete('/users/:id', auth, authController.deleteUser);

module.exports = router;