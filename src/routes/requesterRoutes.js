// src/routes/requesterRoutes.js
const express = require('express');
const router = express.Router();
const requesterController = require('../controllers/requesterController');

// Создать/обновить requesters
router.post('/', requesterController.createRequester);
router.get('/', requesterController.getRequesters);
router.get('/:id', requesterController.getRequesterById);

module.exports = router;
