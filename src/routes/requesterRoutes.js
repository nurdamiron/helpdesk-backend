// src/routes/requesterRoutes.js
const express = require('express');
const router = express.Router();
const requesterController = require('../controllers/requesterController');

// Create or update a requester
router.post('/', requesterController.createRequester);

// Get all requesters with optional filtering
router.get('/', requesterController.getRequesters);

// Get requester by ID
router.get('/:id', requesterController.getRequesterById);

module.exports = router;