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
    // Проверяем, существуют ли колонки position и is_active в таблице
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users' AND COLUMN_NAME IN ('position', 'is_active')
    `);
    
    const hasPosition = columns.some(col => col.COLUMN_NAME === 'position');
    const hasIsActive = columns.some(col => col.COLUMN_NAME === 'is_active');
    
    // Формируем запрос с учетом наличия или отсутствия колонок
    let selectFields = [
      'id', 'email', 'first_name', 'last_name', 'role', 'created_at'
    ];
    
    if (hasPosition) {
      selectFields.push('position');
    }
    
    if (hasIsActive) {
      selectFields.push('is_active');
    }
    
    const selectQuery = `SELECT ${selectFields.join(', ')} FROM users ORDER BY id DESC`;
    
    const [rows] = await pool.query(selectQuery);
    return res.json(rows);
  } catch (error) {
    console.error('Error getUsers:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Проверяем, существуют ли колонки position, is_active, phone и phone_work в таблице
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users' AND COLUMN_NAME IN ('position', 'is_active', 'phone', 'phone_work')
    `);
    
    const hasPosition = columns.some(col => col.COLUMN_NAME === 'position');
    const hasIsActive = columns.some(col => col.COLUMN_NAME === 'is_active');
    const hasPhone = columns.some(col => col.COLUMN_NAME === 'phone');
    const hasPhoneWork = columns.some(col => col.COLUMN_NAME === 'phone_work');
    
    // Формируем запрос с учетом наличия или отсутствия колонок
    let selectFields = [
      'id', 'email', 'first_name', 'last_name', 'role', 'language', 'timezone', 'created_at'
    ];
    
    if (hasPosition) {
      selectFields.push('position');
    }
    
    if (hasPhone) {
      selectFields.push('phone');
    } else if (hasPhoneWork) {
      selectFields.push('phone_work as phone');
    }
    
    if (hasIsActive) {
      selectFields.push('is_active');
    }
    
    const selectQuery = `SELECT ${selectFields.join(', ')} FROM users WHERE id=?`;
    
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

    // Проверяем, существуют ли колонки position, is_active, phone и phone_work в таблице
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users' AND COLUMN_NAME IN ('position', 'is_active', 'phone', 'phone_work')
    `);
    
    const hasPosition = columns.some(col => col.COLUMN_NAME === 'position');
    const hasIsActive = columns.some(col => col.COLUMN_NAME === 'is_active');
    const hasPhone = columns.some(col => col.COLUMN_NAME === 'phone');
    const hasPhoneWork = columns.some(col => col.COLUMN_NAME === 'phone_work');
    
    // Формируем базовый запрос для обновления
    let updateFields = [
      'first_name=COALESCE(?, first_name)',
      'last_name=COALESCE(?, last_name)',
      'email=COALESCE(?, email)',
      'role=COALESCE(?, role)',
      'updated_at=CURRENT_TIMESTAMP'
    ];
    
    // Параметры для базового запроса
    let params = [
      first_name, 
      last_name,
      email,
      userRole
    ];
    
    // Добавляем position, если такая колонка существует
    if (hasPosition) {
      updateFields.push('position=COALESCE(?, position)');
      params.push(position);
    }
    
    // Добавляем phone или phone_work, если существует
    if (hasPhone && phone !== undefined) {
      updateFields.push('phone=COALESCE(?, phone)');
      params.push(phone);
    } else if (hasPhoneWork && phone !== undefined) {
      updateFields.push('phone_work=COALESCE(?, phone_work)');
      params.push(phone);
    }
    
    // Добавляем is_active, если такая колонка существует
    if (hasIsActive) {
      updateFields.push('is_active=COALESCE(?, is_active)');
      params.push(activeStatus);
    }
    
    // Добавляем id в параметры
    params.push(id);
    
    // Формируем окончательный запрос
    const query = `
      UPDATE users SET
      ${updateFields.join(', ')}
      WHERE id=?
    `;
    
    await pool.query(query, params);

    // Получаем обновленные данные пользователя
    // Формируем запрос с учетом наличия или отсутствия колонок
    let selectFields = [
      'id', 'email', 'first_name', 'last_name', 'role'
    ];
    
    if (hasPosition) {
      selectFields.push('position');
    }
    
    if (hasPhone) {
      selectFields.push('phone');
    } else if (hasPhoneWork) {
      selectFields.push('phone_work as phone');
    }
    
    if (hasIsActive) {
      selectFields.push('is_active');
    }
    
    const selectQuery = `SELECT ${selectFields.join(', ')} FROM users WHERE id=?`;
    
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
