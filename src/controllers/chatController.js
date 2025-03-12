// src/controllers/chatController.js
const pool = require('../config/database');

/**
 * Пример контроллера для "чатов" — если нужно.
 * Упрощённая логика без привязки к "company".
 */
exports.getChatData = async (req, res) => {
  try {
    const { endpoint, conversationId } = req.query;

    if (endpoint === 'contacts') {
      // Пример: пустой массив контактов
      return res.json({ contacts: [] });
    }

    if (endpoint === 'conversations') {
      const [rows] = await pool.query('SELECT * FROM conversations ORDER BY updated_at DESC');
      return res.json({ conversations: rows });
    }

    if (endpoint === 'conversation' && conversationId) {
      const [conv] = await pool.query('SELECT * FROM conversations WHERE id=?', [conversationId]);
      if (!conv.length) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      const conversation = conv[0];

      const [msgs] = await pool.query(
        'SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC',
        [conversationId]
      );

      return res.json({
        conversation: {
          ...conversation,
          messages: msgs
        }
      });
    }

    return res.status(400).json({ error: 'Invalid endpoint' });
  } catch (error) {
    console.error('Error in getChatData:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Пример обновления статуса conversation с type='ticket'
exports.updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Проверим, что это ticket
    const [conv] = await pool.query('SELECT id, type FROM conversations WHERE id=?', [id]);
    if (!conv.length) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    if (conv[0].type !== 'ticket') {
      return res.status(400).json({ error: 'Not a ticket conversation' });
    }

    const [upd] = await pool.query(
      'UPDATE conversations SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [status, id]
    );
    if (!upd.affectedRows) {
      return res.status(500).json({ error: 'Update failed' });
    }

    return res.json({ message: 'Ticket status updated', status });
  } catch (error) {
    console.error('Error updateTicketStatus:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Создание новой беседы/тикета
exports.createConversation = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { conversationData } = req.body;
    const subject = conversationData.subject || 'Untitled conversation';
    const type = conversationData.type || 'chat';
    const status = conversationData.status || 'new';
    const category = conversationData.category || 'other';
    const priority = conversationData.priority || 'medium';

    let metadata = null;
    if (conversationData.metadata) {
      metadata = JSON.stringify(conversationData.metadata);
    }

    // INSERT в conversations
    const [convResult] = await connection.query(
      `INSERT INTO conversations (subject, type, status, category, priority, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [subject, type, status, category, priority, metadata]
    );
    const conversationId = convResult.insertId;

    // Добавляем сообщения
    if (conversationData.messages?.length) {
      for (const msg of conversationData.messages) {
        await connection.query(
          `INSERT INTO messages (conversation_id, sender_id, body, content_type)
           VALUES (?, ?, ?, ?)`,
          [conversationId, msg.sender_id, msg.body, msg.content_type || 'text']
        );
      }
    }

    await connection.commit();

    return res.json({
      conversation: {
        id: conversationId,
        subject,
        type,
        status,
        category,
        priority
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error in createConversation:', error);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

exports.deleteConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const [del] = await pool.query('DELETE FROM conversations WHERE id=?', [id]);
    if (!del.affectedRows) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    return res.json({ message: 'Conversation deleted' });
  } catch (error) {
    console.error('Error deleteConversation:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const [del] = await pool.query('DELETE FROM messages WHERE id=?', [id]);
    if (!del.affectedRows) {
      return res.status(404).json({ error: 'Message not found' });
    }
    return res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error('Error deleteMessage:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { conversationId, messageData } = req.body;
    const [rows] = await pool.query('SELECT * FROM conversations WHERE id=?', [conversationId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const [msgIns] = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, body, content_type)
       VALUES (?, ?, ?, ?)`,
      [conversationId, messageData.sender_id, messageData.body, messageData.content_type || 'text']
    );

    // Обновим updated_at
    await pool.query('UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?', [conversationId]);

    return res.json({
      message: {
        id: msgIns.insertId,
        conversation_id: conversationId,
        sender_id: messageData.sender_id,
        body: messageData.body,
        content_type: messageData.content_type || 'text'
      }
    });
  } catch (error) {
    console.error('Error sendMessage:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
