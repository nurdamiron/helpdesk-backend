// src/routes/adminAuthRoutes.js
const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');

// Debug middleware to log requests
const debugMiddleware = (req, res, next) => {
  console.log('===== Admin Auth Request =====');
  console.log('URL:', req.originalUrl);
  console.log('Method:', req.method);
  console.log('Body:', req.body);
  console.log('Headers:', {
    authorization: req.headers.authorization,
    'x-admin-id': req.headers['x-admin-id'],
    'x-admin-email': req.headers['x-admin-email'],
    'content-type': req.headers['content-type']
  });
  console.log('=============================');
  next();
};

// Apply debug middleware to all routes
router.use(debugMiddleware);

// Admin login route
router.post('/login', adminAuthController.login);

// Get users list (protected for admins)
router.get('/users', adminAuthController.getUsers);

// Check admin status
router.get('/check', adminAuthController.checkAdmin);

module.exports = router;