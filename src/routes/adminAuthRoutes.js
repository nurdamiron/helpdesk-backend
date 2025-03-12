// src/routes/adminAuthRoutes.js
const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');

// Admin login
router.post('/login', adminAuthController.login);
// Get all users (only admin)
router.get('/users', adminAuthController.getUsers);
// Check admin
router.get('/check', adminAuthController.checkAdmin);

module.exports = router;
