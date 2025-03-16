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

      // Сохраняем пароль как есть, без хеширования
      const [result] = await pool.query(
        'INSERT INTO users (email, password, first_name, last_name) VALUES (?, ?, ?, ?)',
        [email, password, first_name, last_name]
      );

      return res.status(201).json({
        status: 'success',
        user: {
          id: result.insertId,
          email,
          first_name,
          last_name
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
          last_name: user.last_name
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
      // Получаем ID пользователя из заголовков
      const userId = req.headers['x-user-id'];
      
      if (!userId) {
        return res.status(401).json({
          status: 'error',
          error: 'Необходима аутентификация'
        });
      }
      
      // Получаем данные пользователя из БД
      const [users] = await pool.query('SELECT id, email, first_name, last_name FROM users WHERE id = ?', [userId]);
      
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
    try {
      // Просто отправляем успешный ответ, т.к. мы не используем сессии на сервере
      return res.json({
        status: 'success',
        message: 'Выход выполнен успешно'
      });
    } catch (error) {
      console.error('Ошибка выхода:', error);
      return res.status(500).json({
        status: 'error',
        error: 'Внутренняя ошибка сервера'
      });
    }
  },
  
  // Получение всех пользователей
  getUsers: async (req, res) => {
    try {
      const [users] = await pool.query(
        'SELECT id, email, first_name, last_name, created_at FROM users ORDER BY id DESC'
      );
      return res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Ошибка при получении списка пользователей' });
    }
  }
};

module.exports = authController;// src/controllers/authController.js
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

      // Сохраняем пароль как есть, без хеширования (в реальном приложении следует использовать хеширование)
      const [result] = await pool.query(
        'INSERT INTO users (email, password, first_name, last_name) VALUES (?, ?, ?, ?)',
        [email, password, first_name, last_name]
      );

      return res.status(201).json({
        status: 'success',
        user: {
          id: result.insertId,
          email,
          first_name,
          last_name
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

      // Проверка пароля напрямую (без хеширования)
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
          is_admin: user.is_admin === 1
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
      // req.user должен быть установлен в middleware/auth.js
      return res.json({
        status: 'success',
        user: req.user
      });
    } catch (error) {
      console.error('Ошибка получения данных пользователя:', error);
      return res.status(500).json({
        status: 'error',
        error: 'Внутренняя ошибка сервера'
      });
    }
  },

  // Выход пользователя (при использовании сессий)
  logout: async (req, res) => {
    try {
      // Если используются сессии
      if (req.session) {
        req.session.destroy();
      }
      
      return res.json({
        status: 'success',
        message: 'Выход выполнен успешно'
      });
    } catch (error) {
      console.error('Ошибка выхода:', error);
      return res.status(500).json({
        status: 'error',
        error: 'Внутренняя ошибка сервера'
      });
    }
  },

  // ============ ADMIN FUNCTIONS ============

  // Вход администратора
  adminLogin: async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Укажите email и пароль' });
      }

      // Ищем пользователя
      const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      if (rows.length === 0) {
        return res.status(401).json({ error: 'Неверные учётные данные' });
      }

      const user = rows[0];
      
      // Проверяем, является ли пользователь администратором
      if (user.is_admin !== 1) {
        return res.status(403).json({ error: 'У вас нет прав администратора' });
      }
      
      // Сравниваем пароль "как есть"
      if (user.password !== password) {
        return res.status(401).json({ error: 'Неверные учётные данные' });
      }

      // Успешный вход
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
      console.error('Admin login error:', error);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  },

  // Получение всех пользователей (доступен только администратору)
  getUsers: async (req, res) => {
    try {
      // Проверяем права администратора через заголовки
      const adminId = req.headers['x-admin-id'];
      
      if (!adminId) {
        return res.status(403).json({ error: 'Требуются права администратора' });
      }

      console.log(`Admin ${adminId} запросил список пользователей`);

      const [users] = await pool.query(
        'SELECT id, email, first_name, last_name, is_admin, created_at FROM users ORDER BY id DESC'
      );
      return res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Ошибка при получении списка пользователей' });
    }
  },

  // Проверка прав администратора
  checkAdmin: async (req, res) => {
    try {
      const adminId = req.headers['x-admin-id'];
      const adminEmail = req.headers['x-admin-email'];

      if (!adminId || !adminEmail) {
        return res.status(403).json({ error: 'Необходимы данные администратора' });
      }

      // Проверяем существование администратора и его права
      const [rows] = await pool.query(
        'SELECT * FROM users WHERE id = ? AND email = ? AND is_admin = 1',
        [adminId, adminEmail]
      );

      if (rows.length === 0) {
        return res.status(403).json({ error: 'Пользователь не является администратором' });
      }

      return res.json({
        success: true,
        admin: {
          id: rows[0].id,
          email: rows[0].email
        }
      });
    } catch (error) {
      console.error('checkAdmin error:', error);
      res.status(500).json({ error: 'Ошибка при проверке администратора' });
    }
  }
};

module.exports = authController;// src/controllers/authController.js
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

      // Сохраняем пароль как есть, без хеширования (в реальном приложении следует использовать хеширование)
      const [result] = await pool.query(
        'INSERT INTO users (email, password, first_name, last_name) VALUES (?, ?, ?, ?)',
        [email, password, first_name, last_name]
      );

      return res.status(201).json({
        status: 'success',
        user: {
          id: result.insertId,
          email,
          first_name,
          last_name
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

      // Проверка пароля напрямую (без хеширования)
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
          is_admin: user.is_admin === 1
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
      // req.user должен быть установлен в middleware/auth.js
      return res.json({
        status: 'success',
        user: req.user
      });
    } catch (error) {
      console.error('Ошибка получения данных пользователя:', error);
      return res.status(500).json({
        status: 'error',
        error: 'Внутренняя ошибка сервера'
      });
    }
  },

  // Выход пользователя (при использовании сессий)
  logout: async (req, res) => {
    try {
      // Если используются сессии
      if (req.session) {
        req.session.destroy();
      }
      
      return res.json({
        status: 'success',
        message: 'Выход выполнен успешно'
      });
    } catch (error) {
      console.error('Ошибка выхода:', error);
      return res.status(500).json({
        status: 'error',
        error: 'Внутренняя ошибка сервера'
      });
    }
  }
};

module.exports = authController;