// src/controllers/requesterController.js
const pool = require('../config/database');

/**
 * Упрощённый контроллер для работы с requesters (клиенты).
 */
exports.createRequester = async (req, res) => {
  try {
    const { email, full_name, phone, preferred_contact } = req.body;
    if (!email || !full_name) {
      return res.status(400).json({ error: 'Email и полное имя обязательны' });
    }

    const [existing] = await pool.query('SELECT * FROM requesters WHERE email=?', [email]);
    if (existing.length) {
      // Обновим
      await pool.query(
        `UPDATE requesters
         SET full_name=?, phone=?, preferred_contact=?, updated_at=CURRENT_TIMESTAMP
         WHERE email=?`,
        [full_name, phone || null, preferred_contact || 'email', email]
      );
      return res.json({
        message: 'Requester обновлён',
        requester: existing[0]
      });
    }

    // Создаём
    const [ins] = await pool.query(
      `INSERT INTO requesters (email, full_name, phone, preferred_contact)
       VALUES (?, ?, ?, ?)`,
      [email, full_name, phone || null, preferred_contact || 'email']
    );
    const [rows] = await pool.query('SELECT * FROM requesters WHERE id=?', [ins.insertId]);
    return res.status(201).json({
      message: 'Requester создан',
      requester: rows[0]
    });
  } catch (error) {
    console.error('Error createRequester:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

exports.getRequesters = async (req, res) => {
  try {
    let query = 'SELECT * FROM requesters';
    const params = [];
    if (req.query.email) {
      query += ' WHERE email LIKE ?';
      params.push(`%${req.query.email}%`);
    }
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(query, params);
    return res.json({ requesters: rows });
  } catch (error) {
    console.error('Error getRequesters:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

exports.getRequesterById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM requesters WHERE id=?', [id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Requester не найден' });
    }
    return res.json({ requester: rows[0] });
  } catch (error) {
    console.error('Error getRequesterById:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
