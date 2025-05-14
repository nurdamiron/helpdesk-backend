// src/controllers/userController.js
const pool = require('../config/database');

// Убираем bcrypt вообще
// const bcrypt = require('bcryptjs'); // <--- Удаляем

exports.createUser = async (req, res) => {
  try {
    const { email, password, first_name, last_name, role, is_active } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const [exist] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
    if (exist.length) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    // Проверяем допустимость роли
    const validRoles = ['admin', 'moderator', 'staff', 'user'];
    const userRole = role && validRoles.includes(role) ? role : 'user';
    
    // По умолчанию пользователь активен
    const activeStatus = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    // Пишем пароль "как есть"
    const [ins] = await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [email, password, first_name || null, last_name || null, userRole, activeStatus]
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
      'SELECT id, email, first_name, last_name, role, is_active, created_at FROM users ORDER BY id DESC'
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
      'SELECT id, email, first_name, last_name, role, phone, language, timezone, is_active, created_at FROM users WHERE id=?',
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
    const { first_name, last_name, email, phone, role, is_active } = req.body;

    const [ex] = await pool.query('SELECT id FROM users WHERE id=?', [id]);
    if (!ex.length) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Проверка email на уникальность если он изменился
    if (email) {
      const [existEmail] = await pool.query('SELECT id FROM users WHERE email=? AND id!=?', [email, id]);
      if (existEmail.length) {
        return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
      }
    }

    // Проверяем допустимость роли
    const validRoles = ['admin', 'moderator', 'staff', 'user'];
    const userRole = role && validRoles.includes(role) ? role : null;
    
    // Преобразуем статус активности в булево значение
    const activeStatus = is_active !== undefined ? (is_active ? 1 : 0) : null;

    // Обновляем поля (убираем position, так как это поле отсутствует в БД)
    await pool.query(
      `UPDATE users SET
        first_name=COALESCE(?, first_name),
        last_name=COALESCE(?, last_name),
        email=COALESCE(?, email),
        phone=COALESCE(?, phone),
        role=COALESCE(?, role),
        is_active=COALESCE(?, is_active),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?`,
      [
        first_name, 
        last_name,
        email,
        phone,
        userRole,
        activeStatus,
        id
      ]
    );

    // Получаем обновленные данные пользователя
    const [updatedUser] = await pool.query(
      'SELECT id, email, first_name, last_name, role, phone, is_active FROM users WHERE id=?',
      [id]
    );

    return res.json({ 
      message: 'Пользователь обновлён',
      user: updatedUser[0]
    });
  } catch (error) {
    console.error('Error updateUser:', error);
    res.status(500).json({ error: 'Ошибка при обновлении' });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Текущий и новый пароли обязательны' });
    }

    // Проверяем существование пользователя и правильность текущего пароля
    const [user] = await pool.query('SELECT password FROM users WHERE id=?', [id]);
    
    if (!user.length) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (user[0].password !== currentPassword) {
      return res.status(401).json({ error: 'Неверный текущий пароль' });
    }

    // Обновляем пароль
    await pool.query(
      'UPDATE users SET password=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [newPassword, id]
    );

    return res.json({ message: 'Пароль успешно обновлен' });
  } catch (error) {
    console.error('Error updatePassword:', error);
    res.status(500).json({ error: 'Ошибка при обновлении пароля' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const { language, timezone, notifications, preferences } = req.body;

    const [user] = await pool.query('SELECT id FROM users WHERE id=?', [id]);
    
    if (!user.length) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Обновляем настройки пользователя
    await pool.query(
      `UPDATE users SET
        language=COALESCE(?, language),
        timezone=COALESCE(?, timezone),
        settings=JSON_SET(
          COALESCE(settings, '{}'),
          '$.notifications', ?,
          '$.preferences', ?
        ),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?`,
      [
        language,
        timezone,
        JSON.stringify(notifications || {}),
        JSON.stringify(preferences || {}),
        id
      ]
    );

    return res.json({ 
      message: 'Настройки пользователя обновлены',
      settings: {
        language,
        timezone,
        notifications,
        preferences
      }
    });
  } catch (error) {
    console.error('Error updateSettings:', error);
    res.status(500).json({ error: 'Ошибка при обновлении настроек' });
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
    const [rows] = await pool.query(
      'SELECT id, email, password, first_name, last_name, role, phone, language, timezone, settings, is_active FROM users WHERE email=?',
      [email]
    );
    
    if (!rows.length) {
      return res.status(401).json({ error: 'Неверные учётные данные' });
    }
    
    const user = rows[0];

    // Сравниваем пароль "в открытую"
    if (user.password !== password) {
      return res.status(401).json({ error: 'Неверные учётные данные' });
    }
    
    // Проверяем, что пользователь активен
    if (user.is_active === 0) {
      return res.status(403).json({ error: 'Учетная запись неактивна. Обратитесь к администратору.' });
    }

    // Парсим JSON настройки, если есть
    let settings = {};
    if (user.settings) {
      try {
        settings = JSON.parse(user.settings);
      } catch (e) {
        console.error('Error parsing user settings:', e);
      }
    }

    // Всё ок – возвращаем инфу
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        role: user.role || 'user',
        phone: user.phone || '',
        language: user.language || 'kk',
        timezone: user.timezone || 'asia-almaty',
        is_active: user.is_active === 1,
        notifications: settings.notifications || {},
        preferences: settings.preferences || {}
      }
    });
  } catch (error) {
    console.error('Ошибка login:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
