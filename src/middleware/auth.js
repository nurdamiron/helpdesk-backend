// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const auth = async (req, res, next) => {
    console.log('Auth middleware triggered');
    
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                status: 'error',
                error: 'Authentication required' 
            });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Получаем пользователя с данными о сотруднике и компании
            const [users] = await pool.execute(`
                SELECT 
                    u.id,
                    u.email,
                    u.registration_type,
                    e.id as employee_id,
                    e.role as employee_role,
                    e.status as employee_status,
                FROM users u
                LEFT JOIN employees e ON u.email = e.email
                WHERE u.id = ?
            `, [decoded.userId]);

            if (!users.length) {
                throw new Error('User not found');
            }

            const user = users[0];

            // Проверяем статус сотрудника
            if (user.employee_status === 'blocked') {
                return res.status(403).json({
                    status: 'error',
                    error: 'Account is blocked'
                });
            }

            // Добавляем данные пользователя в request
            req.user = {
                userId: decoded.userId,
                email: user.email,
                registration_type: user.registration_type,
                employee: {
                    id: user.employee_id,
                    role: user.employee_role,
                    status: user.employee_status
                },
                company: {
                    id: user.company_id,
                    name: user.company_name,
                    status: user.company_status
                }
            };

            next();
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    status: 'error',
                    error: 'Token expired',
                    code: 'TOKEN_EXPIRED'
                });
            }
            throw err;
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ 
            status: 'error',
            error: 'Invalid authentication token' 
        });
    }
};

module.exports = auth;