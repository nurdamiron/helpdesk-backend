const pool = require('../config/database');

// Создание нового тикета
exports.createTicket = async (req, res) => {
  try {
    const { subject, description, created_by, assigned_to, company_id, priority } = req.body;
    const status = 'new';

    const [result] = await pool.query(
      `INSERT INTO tickets (subject, description, status, priority, created_by, assigned_to, company_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [subject, description, status, priority || 'medium', created_by, assigned_to || null, company_id || null]
    );
    const ticketId = result.insertId;

    return res.status(201).json({
      ticket: {
        id: ticketId,
        subject,
        description,
        status,
        priority: priority || 'medium',
        created_by,
        assigned_to: assigned_to || null,
        company_id: company_id || null,
      }
    });
  } catch (error) {
    console.error('Error in createTicket:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Получение списка тикетов
exports.getTickets = async (req, res) => {
  try {
    // Можно добавить фильтрацию по компании, статусу, автору и т.д.
    const [rows] = await pool.query(
      'SELECT * FROM tickets ORDER BY created_at DESC'
    );
    return res.json({ tickets: rows });
  } catch (error) {
    console.error('Error in getTickets:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Получение деталей конкретного тикета
exports.getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT * FROM tickets WHERE id = ?',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    return res.json({ ticket: rows[0] });
  } catch (error) {
    console.error('Error in getTicketById:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Обновление тикета (например, изменение темы, описания, статуса, приоритета, назначенного сотрудника)
exports.updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, description, status, priority, assigned_to, company_id } = req.body;

    const [result] = await pool.query(
      `UPDATE tickets 
       SET subject = ?, description = ?, status = ?, priority = ?, assigned_to = ?, company_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [subject, description, status, priority, assigned_to || null, company_id || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Ticket not found or update failed' });
    }
    return res.json({ message: 'Ticket updated successfully' });
  } catch (error) {
    console.error('Error in updateTicket:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Удаление тикета (и связанных с ним записей, если настроены каскадные удаления)
exports.deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      'DELETE FROM tickets WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Ticket not found or deletion failed' });
    }
    return res.json({ message: 'Ticket deleted successfully' });
  } catch (error) {
    console.error('Error in deleteTicket:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
