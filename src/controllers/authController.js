// src/controllers/authController.js
const pool = require('../config/database');

const authController = {
  // Регистрация пользователя
  register: async (req, res) => {
    try {
      const { email, password, first_name, last_name } = req.body;

      if (!email || !password) {
        return res.status(400).json({ 
          status: 'error',
          error: 'Email и пароль обязательны' 
        });
      }

      // Проверяем, существует ли уже пользователь
      const [existingUsers] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      if (existingUsers.length > 0) {
        return res.status(400).json({ 
          status: 'error',
          error: 'Пользователь с таким email уже существует' 
        });
      }

      // Сохраняем пароль как есть
      const [result] = await pool.query(
        'INSERT INTO users (email, password, first_name, last_name) VALUES (?, ?, ?, ?)',
        [email, password, first_name || null, last_name || null]
      );

      return res.status(201).json({
        status: 'success',
        user: {
          id: result.insertId,
          email,
          first_name: first_name || null,
          last_name: last_name || null
        }
      });
    } catch (error) {
      console.error('Ошибка регистрации:', error);
      return res.status(500).json({
        status: 'error',
        error: 'Внутренняя ошибка сервера'
      });
    }
  },

  // Вход пользователя
  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ 
          status: 'error',
          error: 'Email и пароль обязательны' 
        });
      }

      // Поиск пользователя
      const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      if (users.length === 0) {
        return res.status(401).json({ 
          status: 'error',
          error: 'Неверные учетные данные' 
        });
      }

      const user = users[0];

      // Проверка пароля напрямую
      if (user.password !== password) {
        return res.status(401).json({ 
          status: 'error',
          error: 'Неверные учетные данные' 
        });
      }

      // Успешный вход
      return res.json({
        status: 'success',
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role || 'user'
        }
      });
    } catch (error) {
      console.error('Ошибка входа:', error);
      return res.status(500).json({
        status: 'error',
        error: 'Внутренняя ошибка сервера'
      });
    }
  },

  // Получение данных текущего пользователя
  getMe: async (req, res) => {
    try {
      const userId = req.headers['x-user-id'];
      
      if (!userId) {
        return res.status(401).json({
          status: 'error',
          error: 'Необходима аутентификация'
        });
      }
      
      const [users] = await pool.query(
        'SELECT id, email, first_name, last_name, role FROM users WHERE id = ?', 
        [userId]
      );
      
      if (users.length === 0) {
        return res.status(404).json({
          status: 'error',
          error: 'Пользователь не найден'
        });
      }
      
      return res.json({
        status: 'success',
        user: users[0]
      });
    } catch (error) {
      console.error('Ошибка получения данных пользователя:', error);
      return res.status(500).json({
        status: 'error',
        error: 'Внутренняя ошибка сервера'
      });
    }
  },

  // Выход пользователя
  logout: async (req, res) => {
    // Просто отправляем успешный ответ, т.к. мы не используем сессии на сервере
    return res.json({
      status: 'success',
      message: 'Выход выполнен успешно'
    });
  },
  
  // Получение всех пользователей
  getUsers: async (req, res) => {
    try {
      const [users] = await pool.query(
        'SELECT id, email, first_name, last_name, role, created_at FROM users ORDER BY id DESC'
      );
      return res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Ошибка при получении списка пользователей' });
    }
  },
  
  // Обновление пользователя
  updateUser: async (req, res) => {
    try {
      const { id } = req.params;
      const { first_name, last_name, password } = req.body;

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
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?`,
        [
          first_name, 
          last_name, 
          id
        ]
      );

      return res.json({ message: 'Пользователь обновлён' });
    } catch (error) {
      console.error('Error updateUser:', error);
      res.status(500).json({ error: 'Ошибка при обновлении' });
    }
  },
  
  // Удаление пользователя
  deleteUser: async (req, res) => {
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
  }
};

module.exports = authController;