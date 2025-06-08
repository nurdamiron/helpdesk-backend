// src/middleware/auth.js
const pool = require('../services/pool');
const jwt = require('jsonwebtoken');

// Секретный ключ для JWT (должен совпадать с ключом в authController)
const JWT_SECRET = process.env.JWT_SECRET || 'helpdesk-secret-key';

// Проверка на режим разработки
const isDevelopment = process.env.NODE_ENV === 'development' || true; // По умолчанию считаем, что мы в режиме разработки

// Демо пользователи для разработки - роли соответствуют ролям в базе данных
const mockUsers = [
    { id: 1, email: 'admin@localhost', first_name: 'Админ', last_name: 'Системы', role: 'admin' },
    { id: 2, email: 'support@localhost', first_name: 'Поддержка', last_name: 'Клиентов', role: 'support' },
    { id: 3, email: 'manager@localhost', first_name: 'Менеджер', last_name: 'Отдела', role: 'manager' },
    { id: 4, email: 'user@localhost', first_name: 'Обычный', last_name: 'Пользователь', role: 'user' }
];

// Middleware для проверки JWT аутентификации
const authenticateJWT = async (req, res, next) => {
    console.log('Auth middleware triggered');
    console.log('Headers received:', req.headers);
    
    try {
        if (isDevelopment) {
            // В режиме разработки проверяем наличие токена с приставкой "mock-jwt-token-"
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
            console.log('Auth header:', authHeader);
            console.log('Token extracted:', token);
            
            if (token && token.startsWith('mock-jwt-token-')) {
                // Извлекаем информацию о пользователе из токена
                // Формат токена: 'mock-jwt-token-{role}'
                // Если роль не указана, используем admin
                const userType = token.includes('-admin') ? 'admin' : 
                                token.includes('-support') ? 'support' :
                                token.includes('-manager') ? 'manager' :
                                token.includes('-moderator') ? 'support' : // для совместимости
                                token.includes('-user') ? 'user' : 'admin';
                
                // Находим соответствующего пользователя
                const mockUser = mockUsers.find(u => u.role === userType) || mockUsers[0];
                
                // Устанавливаем пользователя в request
                req.user = { ...mockUser };
                console.log('Using mock user:', req.user);
                return next();
            }
            
            // Если токен существует, но не начинается с 'mock-jwt-token'
            if (token) {
                try {
                    // Попробуем декодировать его как обычный JWT токен
                    const decoded = jwt.verify(token, JWT_SECRET);
                    console.log('JWT token verified, decoded ID:', decoded.id);
                    
                    // Попробуем найти пользователя в mock users (для разработки)
                    // Используем ID из токена
                    const userIndex = parseInt(decoded.id, 10) - 1;
                    if (userIndex >= 0 && userIndex < mockUsers.length) {
                        req.user = { ...mockUsers[userIndex] };
                        console.log('Using mock user by ID from token:', req.user);
                    } else {
                        // Если ID не найден, используем роль из токена
                        const role = decoded.role || 'user';
                        const mockUser = mockUsers.find(u => u.role === role) || mockUsers[3]; // По умолчанию обычный user
                        req.user = { ...mockUser, id: decoded.id || mockUser.id };
                        console.log('Using mock user by role from token:', req.user);
                    }
                    return next();
                } catch (err) {
                    console.warn('Invalid token in dev mode, using default user:', err.message);
                }
            }
            
            // Если токен отсутствует или недействителен, используем пользователя user по умолчанию
            req.user = { ...mockUsers[3] }; // Используем обычного пользователя по умолчанию
            console.log('Using default mock user (regular user)');
            return next();
        }
        
        // Для продакшн режима - обычная проверка JWT токена
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
        
        if (!token) {
            return res.status(401).json({ 
                status: 'error',
                error: 'Необходим токен авторизации' 
            });
        }

        // Проверяем и декодируем JWT токен
        jwt.verify(token, JWT_SECRET, async (err, decoded) => {
            if (err) {
                return res.status(403).json({ 
                    status: 'error',
                    error: 'Недействительный или истекший токен' 
                });
            }

            console.log('JWT token verified, decoded ID:', decoded.id);
            
            // Получаем актуальные данные пользователя из базы данных
            const getUserQuery = `
                SELECT 
                    id,
                    email,
                    first_name,
                    last_name,
                    role
                FROM users
                WHERE id = ?
            `;
            console.log('Executing query to get user data:', getUserQuery, 'with ID:', decoded.id);
            
            const [users] = await pool.query(getUserQuery, [decoded.id]);
            console.log('Database query result:', users);

            if (!users.length) {
                console.error('User not found in database with ID:', decoded.id);
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
        });
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ 
            status: 'error',
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
    // manager, support - эквиваленты модератора
    if (!req.user || (
        req.user.role !== 'admin' && 
        req.user.role !== 'moderator' && 
        req.user.role !== 'staff' &&
        req.user.role !== 'manager' &&
        req.user.role !== 'support'
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