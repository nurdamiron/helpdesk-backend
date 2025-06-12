// src/controllers/userController.js
const pool = require('../config/database');
const crypto = require('crypto');

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
    const validRoles = ['admin', 'moderator', 'user'];
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
    // Простой запрос с основными полями
    const selectQuery = `SELECT id, email, first_name, last_name, role, created_at, is_active FROM users ORDER BY id DESC`;
    
    const [rows] = await pool.query(selectQuery);
    return res.json(rows);
  } catch (error) {
    console.error('Error getUsers:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Простой запрос с существующими полями
    const selectQuery = `SELECT id, email, first_name, last_name, role, is_active, created_at, phone_work, department, job_title FROM users WHERE id=?`;
    
    const [rows] = await pool.query(selectQuery, [userId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    return res.json(rows[0]);
  } catch (error) {
    console.error('Error getCurrentUser:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.user.id;
    const requestingUserRole = req.user.role;

    // Проверяем права доступа: пользователь может смотреть только свой профиль,
    // админы и модераторы могут смотреть любые профили
    if (requestingUserId != id && !['admin', 'moderator'].includes(requestingUserRole)) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }
    
    // Простой запрос с существующими полями
    const selectQuery = `SELECT id, email, first_name, last_name, role, is_active, created_at, phone_work, department, job_title FROM users WHERE id=?`;
    
    const [rows] = await pool.query(selectQuery, [id]);
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
    const { first_name, last_name, email, phone, role, is_active, position } = req.body;
    const requestingUserId = req.user.id;
    const requestingUserRole = req.user.role;

    // Проверяем права доступа: пользователь может обновлять только свой профиль,
    // админы и модераторы могут обновлять любые профили
    if (requestingUserId != id && !['admin', 'moderator'].includes(requestingUserRole)) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    // Обычные пользователи не могут изменять свою роль
    if (requestingUserId == id && !['admin', 'moderator'].includes(requestingUserRole) && role && role !== req.user.role) {
      return res.status(403).json({ error: 'Нельзя изменять собственную роль' });
    }

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
    const validRoles = ['admin', 'moderator', 'user'];
    const userRole = role && validRoles.includes(role) ? role : null;
    
    // Преобразуем статус активности в булево значение
    const activeStatus = is_active !== undefined ? (is_active ? 1 : 0) : null;

    // Формируем простой запрос для обновления
    let updateFields = [];
    let params = [];
    
    if (first_name !== undefined) {
      updateFields.push('first_name = ?');
      params.push(first_name);
    }
    
    if (last_name !== undefined) {
      updateFields.push('last_name = ?');
      params.push(last_name);
    }
    
    if (email !== undefined) {
      updateFields.push('email = ?');
      params.push(email);
    }
    
    if (userRole !== null) {
      updateFields.push('role = ?');
      params.push(userRole);
    }
    
    if (activeStatus !== null) {
      updateFields.push('is_active = ?');
      params.push(activeStatus);
    }
    
    if (phone !== undefined) {
      updateFields.push('phone_work = ?');
      params.push(phone);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    
    // Формируем окончательный запрос
    const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
    
    await pool.query(query, params);

    // Получаем обновленные данные пользователя
    // Всегда используем простой запрос для получения обновленных данных
    const selectQuery = `SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id=?`;
    
    const [updatedUser] = await pool.query(selectQuery, [id]);

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
    const requestingUserId = req.user.id;
    const requestingUserRole = req.user.role;

    // Проверяем права доступа: пользователь может изменять только свой пароль,
    // админы могут изменять любые пароли (но без текущего пароля)
    if (requestingUserId != id && requestingUserRole !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    if (!newPassword) {
      return res.status(400).json({ error: 'Новый пароль обязателен' });
    }

    // Проверяем существование пользователя
    const [user] = await pool.query('SELECT password FROM users WHERE id=?', [id]);
    
    if (!user.length) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Для обычных пользователей проверяем текущий пароль
    if (requestingUserId == id) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Текущий пароль обязателен' });
      }
      if (user[0].password !== currentPassword) {
        return res.status(401).json({ error: 'Неверный текущий пароль' });
      }
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
    const requestingUserId = req.user.id;
    const requestingUserRole = req.user.role;

    // Проверяем права доступа: пользователь может изменять только свои настройки,
    // админы и модераторы могут изменять любые настройки
    if (requestingUserId != id && !['admin', 'moderator'].includes(requestingUserRole)) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const [user] = await pool.query('SELECT id FROM users WHERE id=?', [id]);
    
    if (!user.length) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Since we don't have language, timezone, or settings columns in the users table,
    // we'll just update the timestamp for now
    // In a real application, you would add these columns or use a separate settings table
    await pool.query(
      `UPDATE users SET updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [id]
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

    // Проверяем, существует ли колонка is_active
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'is_active'
    `);
    
    const hasIsActive = columns.length > 0;
    
    // Формируем запрос в зависимости от наличия колонки is_active
    let selectFields = 'id, email, password, first_name, last_name, role, phone, language, timezone, settings';
    if (hasIsActive) {
      selectFields += ', is_active';
    }
    
    // Ищем пользователя
    const [rows] = await pool.query(
      `SELECT ${selectFields} FROM users WHERE email=?`,
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
    
    // Проверяем, что пользователь активен, если такая колонка существует
    if (hasIsActive && user.is_active === 0) {
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
        is_active: hasIsActive ? user.is_active === 1 : true, // По умолчанию считаем активным, если колонки нет
        notifications: settings.notifications || {},
        preferences: settings.preferences || {}
      }
    });
  } catch (error) {
    console.error('Ошибка login:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Генерация токена для регистрации в Telegram
exports.generateTelegramToken = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Проверяем права доступа - только админы могут генерировать токены
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Недостаточно прав для выполнения операции' });
    }
    
    // Проверяем существование пользователя
    const [user] = await pool.query(
      'SELECT id, email, first_name, last_name, role FROM users WHERE id = ?',
      [userId]
    );
    
    if (!user.length) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Генерируем уникальный токен
    const token = crypto.randomBytes(16).toString('hex');
    
    // Сохраняем токен в БД
    await pool.query(
      'UPDATE users SET registration_token = ? WHERE id = ?',
      [token, userId]
    );
    
    // Возвращаем токен и ссылку для регистрации
    res.json({
      success: true,
      user: {
        id: user[0].id,
        email: user[0].email,
        name: `${user[0].first_name} ${user[0].last_name}`,
        role: user[0].role
      },
      token,
      botUrl: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME || 'HelpdeskKZBot'}?start=register_${token}`,
      instructions: {
        kk: 'Telegram-да тіркелу үшін сілтемеге өтіп, /register ' + token + ' командасын жіберіңіз',
        ru: 'Для регистрации в Telegram перейдите по ссылке и отправьте команду /register ' + token,
        en: 'To register in Telegram, follow the link and send command /register ' + token
      }
    });
  } catch (error) {
    console.error('Error generateTelegramToken:', error);
    res.status(500).json({ error: 'Ошибка при генерации токена' });
  }
};
