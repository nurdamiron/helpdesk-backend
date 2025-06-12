// src/controllers/authController.js
const pool = require('../services/pool');
const jwt = require('jsonwebtoken');

// Секретный ключ для JWT (в реальном приложении следует использовать переменные окружения)
const JWT_SECRET = process.env.JWT_SECRET || 'helpdesk-secret-key';
const JWT_EXPIRES_IN = '24h'; // Токен действителен 24 часа

const authController = {
  // Регистрация пользователя - ОТКЛЮЧЕНА
  // Только администратор может создавать новых пользователей через панель управления
  register: async (req, res) => {
    return res.status(403).json({ 
      status: 'error',
      error: req.t('auth.registrationDisabled')
    });
  },

  // Вход пользователя
  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      console.log('Login attempt for email:', email);

      if (!email || !password) {
        console.log('Login failed: Email and password are required');
        return res.status(400).json({ 
          status: 'error',
          error: req.t('auth.emailPasswordRequired')
        });
      }

      // Поиск пользователя
      console.log('Querying database for user with email:', email);
      const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      console.log('Found users:', users.length);
      
      if (users.length === 0) {
        console.log('Login failed: User not found');
        return res.status(401).json({ 
          status: 'error',
          error: req.t('auth.invalidCredentials')
        });
      }

      const user = users[0];
      console.log('User found with role:', user.role);

      // Проверка пароля напрямую
      console.log('Password comparison:');
      console.log('From DB:', JSON.stringify(user.password));
      console.log('From request:', JSON.stringify(password));
      console.log('Length DB:', user.password.length);
      console.log('Length request:', password.length);
      console.log('Char codes DB:', [...user.password].map(c => c.charCodeAt(0)));
      console.log('Char codes request:', [...password].map(c => c.charCodeAt(0)));
      console.log('Trimmed comparison:', user.password.trim() === password.trim());
      
      // Try multiple variants of password comparison
      if (user.password !== password && 
          user.password !== password.trim() &&
          user.password.trim() !== password) {
        console.log('Login failed: Password mismatch');
        return res.status(401).json({ 
          status: 'error',
          error: req.t('auth.invalidCredentials')
        });
      }
      
      // Проверяем, что пользователь активен
      if (user.is_active === 0) {
        console.log('Login failed: User account is inactive', user.id);
        return res.status(403).json({ 
          status: 'error', 
          error: req.t('auth.accessDenied')
        });
      }
      
      console.log('Login successful for user ID:', user.id);

      // Создаем JWT токен
      const token = jwt.sign(
        { 
          id: user.id,
          email: user.email,
          role: user.role || 'user'
        }, 
        JWT_SECRET, 
        { expiresIn: JWT_EXPIRES_IN }
      );

      // Успешный вход
      return res.json({
        status: 'success',
        token,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role || 'user'
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({
        status: 'error',
        error: req.t('common.serverError')
      });
    }
  },

  // Получение данных текущего пользователя
  getMe: async (req, res) => {
    try {
      // Пользователь уже установлен middleware аутентификации
      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          error: req.t('common.unauthorized')
        });
      }
      
      // В режиме разработки возвращаем данные mock пользователя
      if (process.env.NODE_ENV !== 'production') {
        return res.json({
          status: 'success',
          user: req.user
        });
      }
      
      // В продакшн режиме получаем актуальные данные из базы данных
      const [users] = await pool.query(
        'SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = ?', 
        [req.user.id]
      );
      
      if (users.length === 0) {
        return res.status(404).json({
          status: 'error',
          error: req.t('users.notFound')
        });
      }
      
      return res.json({
        status: 'success',
        user: users[0]
      });
    } catch (error) {
      console.error('Error getting user data:', error);
      return res.status(500).json({
        status: 'error',
        error: req.t('common.serverError')
      });
    }
  },

  // Выход пользователя
  logout: async (req, res) => {
    // Просто отправляем успешный ответ, т.к. мы не используем сессии на сервере
    return res.json({
      status: 'success',
      message: req.t('common.success')
    });
  },
  
  // Получение всех пользователей
  getUsers: async (req, res) => {
    try {
      const [users] = await pool.query(
        'SELECT id, email, first_name, last_name, role, created_at, is_active FROM users ORDER BY id DESC'
      );
      return res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: req.t('users.createError') });
    }
  },
  
  // Получение пользователя по ID
  getUser: async (req, res) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query(
        'SELECT id, email, first_name, last_name, role, created_at, is_active FROM users WHERE id = ?',
        [id]
      );
      
      if (rows.length === 0) {
        return res.status(404).json({ error: req.t('users.notFound') });
      }
      
      return res.json(rows[0]);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: req.t('users.createError') });
    }
  },
  
  // Обновление пользователя
  updateUser: async (req, res) => {
    try {
      const { id } = req.params;
      const { first_name, last_name, password, role, is_active } = req.body;

      const [ex] = await pool.query('SELECT id FROM users WHERE id=?', [id]);
      if (!ex.length) {
        return res.status(404).json({ error: req.t('users.notFound') });
      }

      // Если передан password, пишем его "как есть"
      if (password) {
        await pool.query(
          'UPDATE users SET password=? WHERE id=?',
          [password, id]
        );
      }

      // Проверяем допустимость роли
      const validRoles = ['admin', 'moderator', 'user'];
      const userRole = role && validRoles.includes(role) ? role : null;

      // Преобразуем статус активности в булево значение
      const activeStatus = is_active !== undefined ? (is_active ? 1 : 0) : null;

      // Обновляем остальные поля
      await pool.query(
        `UPDATE users SET
          first_name=COALESCE(?, first_name),
          last_name=COALESCE(?, last_name),
          role=COALESCE(?, role),
          is_active=COALESCE(?, is_active),
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?`,
        [
          first_name, 
          last_name, 
          userRole,
          activeStatus,
          id
        ]
      );

      // Получаем обновленные данные пользователя
      const [updatedUser] = await pool.query(
        'SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id=?',
        [id]
      );

      return res.json({ 
        message: req.t('common.success'),
        user: updatedUser[0]
      });
    } catch (error) {
      console.error('Error updateUser:', error);
      res.status(500).json({ error: req.t('users.updateError') });
    }
  },
  
  // Удаление пользователя
  deleteUser: async (req, res) => {
    try {
      const { id } = req.params;
      const [del] = await pool.query('DELETE FROM users WHERE id=?', [id]);
      if (!del.affectedRows) {
        return res.status(404).json({ error: req.t('users.notFound') });
      }
      return res.json({ message: req.t('common.success') });
    } catch (error) {
      console.error('Error deleteUser:', error);
      res.status(500).json({ error: req.t('users.deleteError') });
    }
  }
};

module.exports = authController;