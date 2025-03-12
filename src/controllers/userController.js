// src/controllers/userController.js
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

// Создание нового пользователя
exports.createUser = async (req, res) => {
  try {
    const { 
      email, 
      password, 
      first_name, 
      last_name
    } = req.body;

    // Проверка обязательных полей
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email и пароль обязательны' 
      });
    }

    // Проверка наличия пользователя с таким email
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ 
        error: 'Пользователь с таким email уже существует' 
      });
    }

    // Хеширование пароля
    const hashedPassword = await bcrypt.hash(password, 10);

    // Создание пользователя
    const [result] = await pool.query(
      `INSERT INTO users 
       (email, password, first_name, last_name) 
       VALUES (?, ?, ?, ?)`,
      [email, hashedPassword, first_name, last_name]
    );

    res.status(201).json({
      message: 'Пользователь успешно создан',
      userId: result.insertId
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Ошибка сервера при создании пользователя' });
  }
};

// Получение списка всех пользователей
exports.getUsers = async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, email, first_name, last_name, created_at FROM users ORDER BY id DESC'
    );

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Ошибка сервера при получении списка пользователей' });
  }
};

// Получение информации о конкретном пользователе
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const [users] = await pool.query(
      'SELECT id, email, first_name, last_name, created_at FROM users WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json(users[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Ошибка сервера при получении данных пользователя' });
  }
};

// Обновление данных пользователя
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, password } = req.body;

    // Проверка наличия пользователя
    const [users] = await pool.query(
      'SELECT id FROM users WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Для обновления пароля
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE users SET password = ? WHERE id = ?',
        [hashedPassword, id]
      );
    }

    // Обновление остальных данных
    await pool.query(
      `UPDATE users SET 
       first_name = COALESCE(?, first_name),
       last_name = COALESCE(?, last_name),
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [first_name, last_name, id]
    );

    res.json({ message: 'Данные пользователя обновлены' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Ошибка сервера при обновлении данных пользователя' });
  }
};

// Удаление пользователя
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query(
      'DELETE FROM users WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({ message: 'Пользователь успешно удален' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Ошибка сервера при удалении пользователя' });
  }
};

// Авторизация пользователя
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log(`Попытка входа: ${email}`);

    if (!email || !password) {
      console.log('Email или пароль отсутствуют');
      return res.status(400).json({ 
        error: 'Необходимо указать email и пароль' 
      });
    }

    // Специальный тестовый пользователь для разработки
    if (email === 'admin@test.com' && password === 'admin123') {
      console.log('Вход с тестовыми учетными данными');
      return res.json({
        user: {
          id: 1,
          email: 'admin@test.com',
          first_name: 'Admin',
          last_name: 'User',
          name: 'Admin User'
        }
      });
    }

    // Обычный процесс аутентификации
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    
    if (users.length === 0) {
      console.log(`Пользователь с email ${email} не найден`);
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }

    const user = users[0];

    // Проверка пароля
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      console.log('Неверный пароль');
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }

    // Успешный вход
    console.log(`Вход пользователя успешен: ${email}`);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email
      }
    });
  } catch (error) {
    console.error('Ошибка входа:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};