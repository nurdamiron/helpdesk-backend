const pool = require('../config/database');

// Получение данных для чата (контакты, беседы, конкретная беседа)
exports.getChatData = async (req, res) => {
  const { endpoint, conversationId } = req.query;

  try {
    if (endpoint === 'contacts') {
      // Пример запроса для получения контактов из таблицы employees
      const [rows] = await pool.query('SELECT id, fio AS name FROM employees');
      return res.json({ contacts: rows });
    }

    if (endpoint === 'conversations') {
      // Получаем список бесед
      const [rows] = await pool.query('SELECT * FROM conversations ORDER BY updated_at DESC');
      return res.json({ conversations: rows });
    }

    if (endpoint === 'conversation' && conversationId) {
      // Получаем конкретную беседу
      const [conv] = await pool.query('SELECT * FROM conversations WHERE id = ?', [conversationId]);
      if (!conv.length) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      const conversation = conv[0];

      // Получаем сообщения беседы
      const [msgs] = await pool.query(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
        [conversationId]
      );

      // Получаем участников беседы
      const [participants] = await pool.query(
        'SELECT * FROM conversation_participants WHERE conversation_id = ?',
        [conversationId]
      );

      return res.json({
        conversation: {
          ...conversation,
          messages: msgs,
          participants: participants.map((p) => ({
            id: p.user_id,
            role: p.role,
            // При необходимости можно добавить name, avatarUrl и др.
          })),
        },
      });
    }

    return res.status(400).json({ error: 'Invalid endpoint' });
  } catch (error) {
    console.error('Error in getChatData:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Обновление статуса тикета (только для тикетов)
exports.updateTicketStatus = async (req, res) => {
    try {
      const { id } = req.params; // id тикета (conversation)
      const { status } = req.body; // новый статус, например: 'in_progress', 'resolved', 'closed'
      
      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }
      
      // Проверяем, что беседа является тикетом
      const [convRows] = await pool.query(
        'SELECT id, type FROM conversations WHERE id = ?',
        [id]
      );
      
      if (!convRows.length) {
        return res.status(404).json({ error: 'Ticket not found' });
      }
      
      const conversation = convRows[0];
      if (conversation.type !== 'ticket') {
        return res.status(400).json({ error: 'Conversation is not a ticket' });
      }
      
      // Обновляем статус тикета
      const [result] = await pool.query(
        'UPDATE conversations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, id]
      );
      
      if (result.affectedRows === 0) {
        return res.status(500).json({ error: 'Failed to update ticket status' });
      }
      
      // При желании можно отправить уведомление через WebSocket здесь
      
      return res.json({ message: 'Ticket status updated successfully', status });
    } catch (error) {
      console.error('Error in updateTicketStatus:', error);
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
      
      // Обработка метаданных (если есть)
      let metadata = null;
      if (conversationData.metadata) {
        metadata = JSON.stringify(conversationData.metadata);
      }
      
      // Обработка данных заявителя (если это тикет)
      let requesterId = null;
      if (type === 'ticket' && conversationData.metadata?.requester) {
        const requesterData = conversationData.metadata.requester;
        
        // Проверяем, существует ли заявитель с таким email
        const [existingRequesters] = await connection.query(
          'SELECT id FROM requesters WHERE email = ?',
          [requesterData.email]
        );
        
        if (existingRequesters.length > 0) {
          // Используем существующего заявителя
          requesterId = existingRequesters[0].id;
          
          // Обновляем данные заявителя
          await connection.query(
            `UPDATE requesters 
             SET full_name = ?, 
                 phone = ?, 
                 student_id = ?, 
                 faculty = ?, 
                 preferred_contact = ?, 
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
              requesterData.full_name,
              requesterData.phone || null,
              requesterData.student_id || null,
              requesterData.faculty || null,
              requesterData.preferred_contact || 'email',
              requesterId
            ]
          );
        } else {
          // Создаем нового заявителя
          const [insertResult] = await connection.query(
            `INSERT INTO requesters 
             (email, full_name, phone, student_id, faculty, preferred_contact)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              requesterData.email,
              requesterData.full_name,
              requesterData.phone || null,
              requesterData.student_id || null,
              requesterData.faculty || null,
              requesterData.preferred_contact || 'email'
            ]
          );
          
          requesterId = insertResult.insertId;
        }
      }
      
      // Вставляем запись в conversations
      const [convResult] = await connection.query(
        `INSERT INTO conversations 
         (subject, type, status, category, priority, requester_id, metadata) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [subject, type, status, category, priority, requesterId, metadata]
      );
      
      const conversationId = convResult.insertId;
      
      // Вставляем участников беседы
      if (conversationData.participants?.length) {
        for (const user of conversationData.participants) {
          await connection.query(
            `INSERT INTO conversation_participants (conversation_id, user_id, role) 
             VALUES (?, ?, ?)`,
            [conversationId, user.id, user.role || 'user']
          );
        }
      }
      
      // Если есть requesterId, добавляем заявителя как участника (если еще не добавлен)
      if (requesterId) {
        // Проверяем, добавлен ли уже заявитель как участник
        const [existingParticipant] = await connection.query(
          `SELECT id FROM conversation_participants 
           WHERE conversation_id = ? AND user_id = ? AND role = 'requester'`,
          [conversationId, requesterId]
        );
        
        if (existingParticipant.length === 0) {
          await connection.query(
            `INSERT INTO conversation_participants (conversation_id, user_id, role)
             VALUES (?, ?, 'requester')`,
            [conversationId, requesterId]
          );
        }
      }
      // Если передано первое сообщение, вставляем его
      if (conversationData.messages?.length) {
        for (const msg of conversationData.messages) {
          // Если это сообщение от заявителя и у нас есть requesterId, используем его
          const senderId = (requesterId && msg.sender_id === 999) ? requesterId : msg.sender_id;
          
          await connection.query(
            `INSERT INTO messages (conversation_id, sender_id, body, content_type) 
             VALUES (?, ?, ?, ?)`,
            [conversationId, senderId, msg.body, msg.content_type || 'text']
          );
        }
      }
      
      // Фиксируем транзакцию
      await connection.commit();
      
      // Получаем информацию о заявителе (если есть)
      let requesterInfo = null;
      if (requesterId) {
        const [requesterRows] = await connection.query(
          'SELECT * FROM requesters WHERE id = ?',
          [requesterId]
        );
        
        if (requesterRows.length > 0) {
          requesterInfo = requesterRows[0];
        }
      }
      
      return res.json({
        conversation: {
          id: conversationId,
          subject,
          type,
          status,
          category,
          priority,
          requester_id: requesterId,
          requester: requesterInfo
        },
      });
    } catch (error) {
      // В случае ошибки откатываем транзакцию
      await connection.rollback();
      console.error('Error in createConversation:', error);
      return res.status(500).json({ error: 'Server error' });
    } finally {
      // Освобождаем соединение в любом случае
      connection.release();
    }
  };


// Удаление беседы (и связанных с ней сообщений, участников)
exports.deleteConversation = async (req, res) => {
    try {
      const { id } = req.params; // id беседы
      // Удаление беседы; каскадное удаление в таблицах messages и conversation_participants
      const [result] = await pool.query('DELETE FROM conversations WHERE id = ?', [id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Conversation not found or deletion failed' });
      }
      return res.json({ message: 'Conversation deleted successfully' });
    } catch (error) {
      console.error('Error in deleteConversation:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  };
  
  // Удаление конкретного сообщения
  exports.deleteMessage = async (req, res) => {
    try {
      const { id } = req.params; // id сообщения
      const [result] = await pool.query('DELETE FROM messages WHERE id = ?', [id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Message not found' });
      }
      return res.json({ message: 'Message deleted successfully' });
    } catch (error) {
      console.error('Error in deleteMessage:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  };
  

// Отправка сообщения в беседу
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId, messageData } = req.body;
    // Проверяем, существует ли беседа
    const [rows] = await pool.query('SELECT id FROM conversations WHERE id = ?', [conversationId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Вставляем новое сообщение
    const [msgResult] = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, body, content_type) VALUES (?, ?, ?, ?)`,
      [conversationId, messageData.sender_id, messageData.body, messageData.content_type || 'text']
    );
    const newMessageId = msgResult.insertId;

    // Обновляем время обновления беседы
    await pool.query(
      `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [conversationId]
    );

    return res.json({
      message: {
        id: newMessageId,
        conversation_id: conversationId,
        sender_id: messageData.sender_id,
        body: messageData.body,
        content_type: messageData.content_type || 'text',
      },
    });
  } catch (error) {
    console.error('Error in sendMessage:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
