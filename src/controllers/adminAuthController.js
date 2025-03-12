// src/controllers/adminAuthController.js
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

const adminAuthController = {
  // Вход для администраторов
  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ 
          error: 'Требуются email и пароль' 
        });
      }

      // Получаем данные администратора
      const [users] = await pool.query(`
        SELECT 
          u.*,
          e.id as employee_id,
          e.role as employee_role,
          e.status as employee_status,
          e.company_id,
          c.name as company_name
        FROM users u
        LEFT JOIN employees e ON u.email = e.email
        LEFT JOIN companies c ON e.company_id = c.id
        WHERE u.email = ? AND (e.role = 'admin' OR e.role = 'support')
      `, [email]);

      if (!users.length) {
        return res.status(401).json({ 
          error: 'Неверные учетные данные' 
        });
      }

      const user = users[0];

      // Проверка пароля
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ 
          error: 'Неверные учетные данные' 
        });
      }

      // Проверка верификации email
      if (!user.is_verified) {
        return res.status(401).json({ 
          error: 'Сначала подтвердите свою почту' 
        });
      }

      // Проверка статуса сотрудника
      if (user.employee_status !== 'active') {
        return res.status(401).json({ 
          error: 'Ваша учетная запись не активна' 
        });
      }

      // Возвращаем данные пользователя без JWT
      res.json({
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          employee: {
            id: user.employee_id,
            role: user.employee_role,
            status: user.employee_status
          },
          company: {
            id: user.company_id,
            name: user.company_name
          }
        }
      });
    } catch (error) {
      console.error('Ошибка входа администратора:', error);
      res.status(500).json({ 
        error: 'Ошибка входа' 
      });
    }
  },

  // Получение всех пользователей системы для админ-панели
  getUsers: async (req, res) => {
    try {
      // Выбираем всех активных сотрудников для админ-панели
      const [users] = await pool.query(`
        SELECT 
          e.id,
          e.fio as name,
          e.email,
          e.role,
          e.status,
          e.phoneNumber as phone,
          e.department,
          c.name as company_name,
          c.id as company_id
        FROM employees e
        LEFT JOIN companies c ON e.company_id = c.id
        WHERE e.status = 'active'
        ORDER BY e.id DESC
      `);

      res.json(users);
    } catch (error) {
      console.error('Ошибка получения пользователей:', error);
      res.status(500).json({ 
        error: 'Ошибка получения пользователей' 
      });
    }
  },

  // Проверка текущего администратора
  checkAdmin: async (req, res) => {
    try {
      // Здесь можно проверить сессию или куки, но пока просто вернем успех
      res.json({ success: true });
    } catch (error) {
      console.error('Ошибка проверки администратора:', error);
      res.status(500).json({ 
        error: 'Ошибка проверки администратора' 
      });
    }
  }
};

module.exports = adminAuthController;