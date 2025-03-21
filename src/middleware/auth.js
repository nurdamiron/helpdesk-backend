// src/middleware/auth.js
const pool = require('../config/database');

const auth = async (req, res, next) => {
    console.log('Auth middleware triggered');
    
    try {
        // Используем заголовки для аутентификации
        const userId = req.headers['x-user-id'];
        const userEmail = req.headers['x-user-email'];
        
        if (!userId || !userEmail) {
            return res.status(401).json({ 
                status: 'error',
                error: 'Необходима аутентификация' 
            });
        }

        // Получаем пользователя из базы данных
        const [users] = await pool.execute(`
            SELECT 
                id,
                email,
                first_name,
                last_name,
                role
            FROM users
            WHERE id = ? AND email = ?
        `, [userId, userEmail]);

        if (!users.length) {
            return res.status(401).json({ 
                status: 'error',
                error: 'Пользователь не найден' 
            });
        }

        const user = users[0];

        // Добавляем данные пользователя в request
        req.user = {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role || 'user'
        };

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ 
            status: 'error',
            error: 'Внутренняя ошибка сервера' 
        });
    }
};

module.exports = auth;