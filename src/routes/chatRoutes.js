// src/routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

router.get('/', chatController.getChatData);
router.post('/', chatController.createConversation);
router.put('/', chatController.sendMessage);
router.patch('/ticket/:id', chatController.updateTicketStatus);
router.delete('/conversation/:id', chatController.deleteConversation);
router.delete('/message/:id', chatController.deleteMessage);

module.exports = router;
