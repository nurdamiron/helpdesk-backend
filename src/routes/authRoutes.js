// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Admin login
router.post('/login', authController.login);
// Get all users (only admin)
router.get('/users', authController.getUsers);
// Check admin
router.get('/check', authController.checkAdmin);

module.exports = router;
