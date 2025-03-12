// src/controllers/userController.js
const pool = require('../config/database');

// Убираем bcrypt вообще
// const bcrypt = require('bcryptjs'); // <--- Удаляем

exports.createUser = async (req, res) => {
  try {
    const { email, password, first_name, last_name, is_admin } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const [exist] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
    if (exist.length) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    // Пишем пароль "как есть"
    const [ins] = await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, is_admin)
       VALUES (?, ?, ?, ?, ?)`,
      [email, password, first_name || null, last_name || null, is_admin ? 1 : 0]
    );

    return res.status(201).json({ message: 'Пользователь создан', userId: ins.insertId });
  } catch (error) {
    console.error('Error createUser:', error);
    res.status(500).json({ error: 'Ошибка при создании пользователя' });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, email, first_name, last_name, is_admin, created_at FROM users ORDER BY id DESC'
    );
    return res.json(rows);
  } catch (error) {
    console.error('Error getUsers:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT id, email, first_name, last_name, is_admin, created_at FROM users WHERE id=?',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    return res.json(rows[0]);
  } catch (error) {
    console.error('Error getUserById:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, password, is_admin } = req.body;

    const [ex] = await pool.query('SELECT id FROM users WHERE id=?', [id]);
    if (!ex.length) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Если передан password, пишем его "как есть"
    if (password) {
      await pool.query(
        'UPDATE users SET password=? WHERE id=?',
        [password, id]
      );
    }

    // Обновляем остальные поля
    await pool.query(
      `UPDATE users SET
        first_name=COALESCE(?, first_name),
        last_name=COALESCE(?, last_name),
        is_admin=COALESCE(?, is_admin),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?`,
      [
        first_name, 
        last_name, 
        is_admin !== undefined ? (is_admin ? 1 : 0) : null,
        id
      ]
    );

    return res.json({ message: 'Пользователь обновлён' });
  } catch (error) {
    console.error('Error updateUser:', error);
    res.status(500).json({ error: 'Ошибка при обновлении' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const [del] = await pool.query('DELETE FROM users WHERE id=?', [id]);
    if (!del.affectedRows) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    return res.json({ message: 'Пользователь удалён' });
  } catch (error) {
    console.error('Error deleteUser:', error);
    res.status(500).json({ error: 'Ошибка при удалении' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Укажите email и пароль' });
    }

    // Ищем пользователя
    const [rows] = await pool.query('SELECT * FROM users WHERE email=?', [email]);
    if (!rows.length) {
      return res.status(401).json({ error: 'Неверные учётные данные' });
    }
    const user = rows[0];

    // Сравниваем пароль "в открытую"
    if (user.password !== password) {
      return res.status(401).json({ error: 'Неверные учётные данные' });
    }

    // Всё ок – возвращаем инфу
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        is_admin: user.is_admin
      }
    });
  } catch (error) {
    console.error('Ошибка login:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
