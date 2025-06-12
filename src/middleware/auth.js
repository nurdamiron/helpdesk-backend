// src/middleware/auth.js
const pool = require('../config/database');
const jwt = require('jsonwebtoken');

// Секретный ключ для JWT (должен совпадать с ключом в authController)
const JWT_SECRET = process.env.JWT_SECRET || 'helpdesk-secret-key';

// Проверка на режим разработки
const isDevelopment = process.env.NODE_ENV === 'development' || true; // По умолчанию считаем, что мы в режиме разработки

// Демо пользователи для разработки - роли соответствуют ролям в базе данных
const mockUsers = [
    { id: 1, email: 'admin@localhost', first_name: 'Админ', last_name: 'Системы', role: 'admin' },
    { id: 2, email: 'moderator@localhost', first_name: 'Модератор', last_name: 'Системы', role: 'moderator' },
    { id: 3, email: 'user@localhost', first_name: 'Обычный', last_name: 'Пользователь', role: 'user' }
];

// Middleware для проверки JWT аутентификации
const authenticateJWT = async (req, res, next) => {
    console.log('Auth middleware triggered');
    console.log('Headers received:', req.headers);
    
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
        console.log('Auth header:', authHeader);
        console.log('Token extracted:', token);

        // Если токен отсутствует
        if (!token) {
            if (isDevelopment) {
                // В development режиме используем пользователя user по умолчанию
                req.user = { ...mockUsers[2] };
                console.log('No token, using default mock user (regular user)');
                return next();
            } else {
                return res.status(401).json({ error: 'Токен не предоставлен' });
            }
        }

        // Обработка mock токенов только в development режиме
        if (isDevelopment && token.startsWith('mock-jwt-token-')) {
            const userType = token.includes('-admin') ? 'admin' : 
                            token.includes('-moderator') ? 'moderator' : 
                            token.includes('-user') ? 'user' : 'user';
            
            const mockUser = mockUsers.find(u => u.role === userType) || mockUsers[0];
            req.user = { ...mockUser };
            console.log('Using mock user:', req.user);
            return next();
        }

        // Декодируем JWT токен
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            console.log('JWT token verified, decoded:', decoded);
            
            // Ищем пользователя в базе данных
            const [users] = await pool.query(
                'SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = ?',
                [decoded.id]
            );

            if (users.length === 0) {
                if (isDevelopment) {
                    // В development режиме используем mock пользователя, если реальный не найден
                    const mockUser = mockUsers.find(u => u.role === decoded.role) || mockUsers[2];
                    req.user = { ...mockUser, id: decoded.id };
                    console.log('User not found in DB, using mock user:', req.user);
                    return next();
                } else {
                    return res.status(401).json({ error: 'Пользователь не найден' });
                }
            }

            const user = users[0];
            
            // Проверяем активность пользователя
            if (user.is_active === 0) {
                return res.status(401).json({ error: 'Аккаунт деактивирован' });
            }

            req.user = user;
            console.log('Using real user from database:', req.user);
            return next();

        } catch (err) {
            console.error('Token verification failed:', err.message);
            
            if (isDevelopment) {
                // В development режиме используем пользователя по умолчанию при ошибке токена
                req.user = { ...mockUsers[2] };
                console.log('Invalid token in dev mode, using default user');
                return next();
            } else {
                return res.status(403).json({ error: 'Недействительный токен' });
            }
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ 
            error: 'Внутренняя ошибка сервера' 
        });
    }
};

// Middleware для проверки роли администратора
const isAdmin = (req, res, next) => {
    // В базе данных роль admin соответствует администратору
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
            status: 'error',
            error: 'Доступ запрещен. Требуются права администратора.'
        });
    }
    next();
};

// Middleware для проверки роли модератора или администратора
const isModeratorOrAdmin = (req, res, next) => {
    // Проверяем роль, учитывая все допустимые роли из базы данных, которые имеют достаточные права
    // admin - администратор
    // moderator - модератор
    if (!req.user || (
        req.user.role !== 'admin' && 
        req.user.role !== 'moderator'
    )) {
        return res.status(403).json({
            status: 'error',
            error: 'Доступ запрещен. Требуются права модератора или администратора.'
        });
    }
    next();
};

// Middleware для проверки конкретной роли
const hasRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                status: 'error',
                error: 'Доступ запрещен. Недостаточно прав.'
            });
        }
        next();
    };
};

module.exports = {
    authenticateJWT,
    isAdmin,
    isModeratorOrAdmin,
    hasRole
};