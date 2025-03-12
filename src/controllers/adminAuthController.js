// src/controllers/adminAuthController.js
const pool = require('../config/database');

/**
 * Контроллер для логики входа администратора
 * (можно объединить с userController, если хотите).
 */
const adminAuthController = {
  // Пример простого входа администратора
  login: async (req, res) => {
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

  // Пример получения всех пользователей (доступен только «админу»)
  getUsers: async (req, res) => {
    try {
      // Предположим, что при админ-входе на клиентской стороне вы храните userId, isAdmin
      // и отправляете их, например, в заголовках (или просто не отправляете ничего —
      // тогда можно вообще убрать эту проверку).
      const adminId = req.headers['x-admin-id'];
      const isAdmin = req.headers['x-is-admin']; // '1' или '0'

      if (isAdmin !== '1') {
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

  // Пример проверки «admin»
  checkAdmin: async (req, res) => {
    try {
      const adminId = req.headers['x-admin-id'];
      const isAdmin = req.headers['x-is-admin'];

      if (!adminId || isAdmin !== '1') {
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

module.exports = adminAuthController;
