const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');

// Вспомогательные функции
const generateTokens = (userId, email) => {
    console.log(`Генерация токенов для пользователя ID:${userId}, Email:${email}`);
    const accessToken = jwt.sign(
        { userId, email },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
    );

    const refreshToken = jwt.sign(
        { userId },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
    );

    console.log('Токены успешно сгенерированы');
    return { accessToken, refreshToken };
};


const hashPassword = async (password) => {
    console.log('Начало хеширования пароля');
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Пароль успешно захеширован');
    return hashedPassword;
};

const generateRandomToken = () => {
    console.log('Генерация случайного токена');
    const token = crypto.randomBytes(32).toString('hex');
    console.log('Токен успешно сгенерирован');
    return token;
};

const authController = {
    // Регистрация пользователя
    register: async (req, res) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            
            const { 
                email, 
                password, 
                first_name, 
                last_name,
                registration_type,
                company_data
            } = req.body;

            // Валидация
            if (!email || !password || !registration_type) {
                return res.status(400).json({ 
                    error: 'Отсутствуют обязательные поля' 
                });
            }

            // Проверка существования email
            const [existingUser] = await connection.query(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );

            if (existingUser.length) {
                return res.status(400).json({ 
                    error: 'Email уже зарегистрирован' 
                });
            }

            const verificationToken = generateRandomToken();
            const hashedPassword = await hashPassword(password);

            if (registration_type === 'company_owner') {
                if (!company_data?.name || !company_data?.bin_iin) {
                    return res.status(400).json({
                        error: 'Необходимо указать данные компании'
                    });
                }

                // Проверка БИН/ИИН
                const [existingCompany] = await connection.query(
                    'SELECT id FROM companies WHERE bin_iin = ? OR code = ?',
                    [company_data.bin_iin, company_data.code || company_data.bin_iin.substring(0, 6)]
                );

                if (existingCompany.length) {
                    return res.status(400).json({
                        error: 'Компания с таким БИН/ИИН или кодом уже существует'
                    });
                }

                // Создаем компанию
                const [companyResult] = await connection.query(
                    'INSERT INTO companies (name, bin_iin, code, status) VALUES (?, ?, ?, "active")',
                    [
                        company_data.name,
                        company_data.bin_iin,
                        company_data.code || company_data.bin_iin.substring(0, 6)
                    ]
                );

                // Создаем пользователя
                const [userResult] = await connection.query(
                    `INSERT INTO users (
                        email, password, first_name, last_name,
                        verification_token, is_verified, registration_type
                    ) VALUES (?, ?, ?, ?, ?, false, ?)`,
                    [email, hashedPassword, first_name, last_name, verificationToken, registration_type]
                );

                // Создаем запись сотрудника
                await connection.query(
                    `INSERT INTO employees (
                        fio, email, role, status, isVerified, company_id
                    ) VALUES (?, ?, "admin", "active", 0, ?)`,
                    [`${first_name} ${last_name}`, email, companyResult.insertId]
                );

            } else if (registration_type === 'employee') {
                if (!company_data?.company_bin_iin) {
                    return res.status(400).json({
                        error: 'Необходимо указать БИН/ИИН компании'
                    });
                }

                // Проверяем существование компании
                const [company] = await connection.query(
                    'SELECT id FROM companies WHERE bin_iin = ?',
                    [company_data.company_bin_iin]
                );

                if (!company.length) {
                    return res.status(400).json({
                        error: 'Компания не найдена'
                    });
                }

                // Создаем пользователя
                const [userResult] = await connection.query(
                    `INSERT INTO users (
                        email, password, first_name, last_name,
                        verification_token, is_verified, registration_type
                    ) VALUES (?, ?, ?, ?, ?, false, ?)`,
                    [email, hashedPassword, first_name, last_name, verificationToken, registration_type]
                );

                // Создаем запись сотрудника
                await connection.query(
                    `INSERT INTO employees (
                        fio, email, role, status, isVerified, company_id
                    ) VALUES (?, ?, "employee", "pending", 0, ?)`,
                    [`${first_name} ${last_name}`, email, company[0].id]
                );
            }

            await connection.commit();

            // Отправляем email для верификации
            await sendVerificationEmail(email, verificationToken);

            res.status(201).json({
                message: 'Регистрация успешно завершена. Проверьте свою почту для подтверждения аккаунта.'
            });

        } catch (error) {
            await connection.rollback();
            console.error('Ошибка регистрации:', error);
            res.status(500).json({ 
                error: 'Ошибка регистрации' 
            });
        } finally {
            connection.release();
        }
    },

    // Вход в систему
    login: async (req, res) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ 
                    error: 'Требуются email и пароль' 
                });
            }

            // Получаем данные пользователя с информацией о сотруднике и компании
            const [users] = await pool.query(`
                SELECT 
                    u.*,
                    e.id as employee_id,
                    e.role as employee_role,
                    e.status as employee_status,
                    e.company_id,
                    c.name as company_name,
                    c.status as company_status
                FROM users u
                LEFT JOIN employees e ON u.email = e.email
                LEFT JOIN companies c ON e.company_id = c.id
                WHERE u.email = ?
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
            if (user.employee_status === 'pending') {
                return res.status(401).json({ 
                    error: 'Ожидание одобрения администратора' 
                });
            }

            // Генерация токенов
            const { accessToken, refreshToken } = generateTokens(user.id, user.email);

            // Сохранение refresh token
            await pool.query(
                'UPDATE users SET refresh_token = ? WHERE id = ?',
                [refreshToken, user.id]
            );

            res.json({
                access: accessToken,
                refresh: refreshToken,
                user: {
                    id: user.id,
                    email: user.email,
                    first_name: user.first_name,
                    last_name: user.last_name,
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
                }
            });
        } catch (error) {
            console.error('Ошибка входа:', error);
            res.status(500).json({ 
                error: 'Ошибка входа' 
            });
        }
    },

    verifyEmail: async (req, res) => {
        console.log('Начало процесса верификации email');
        const connection = await pool.getConnection();
        
        try {
            const { token } = req.params;
            console.log('Получен токен для верификации:', token);
    
            if (!token || token.length !== 64) { // проверяем длину токена, так как generateRandomToken создает 32 байта (64 символа в hex)
                console.log('Некорректный формат токена');
                return res.status(400).json({ 
                    success: false,
                    error: 'Некорректный формат токена верификации' 
                });
            }
    
            await connection.beginTransaction();
    
            // Ищем пользователя вместе с данными сотрудника
            const [users] = await connection.query(`
                SELECT 
                    u.id as user_id,
                    u.email,
                    u.is_verified,
                    u.registration_type,
                    e.id as employee_id,
                    e.company_id
                FROM users u
                LEFT JOIN employees e ON u.email = e.email
                WHERE u.verification_token = ?
            `, [token]);
            
            if (!users.length) {
                console.log('Пользователь с таким токеном не найден');
                return res.status(400).json({ 
                    success: false,
                    error: 'Неверный токен верификации' 
                });
            }
    
            const user = users[0];
            
            // Если email уже подтвержден
            if (user.is_verified) {
                return res.status(400).json({
                    success: false,
                    error: 'Email уже подтвержден'
                });
            }
    
            // Обновляем статус верификации в таблице users
            await connection.query(
                `UPDATE users 
                 SET is_verified = 1, 
                     verification_token = NULL,
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [user.user_id]
            );
    
            // Если это сотрудник компании, обновляем его статус
            if (user.employee_id) {
                await connection.query(
                    'UPDATE employees SET isVerified = 1 WHERE id = ?',
                    [user.employee_id]
                );
    
                // Если это владелец компании, активируем его сразу
                if (user.registration_type === 'company_owner') {
                    await connection.query(
                        'UPDATE employees SET status = "active" WHERE id = ?',
                        [user.employee_id]
                    );
                }
            }
    
            await connection.commit();
    
            // Формируем сообщение в зависимости от типа пользователя
            let message = 'Email успешно подтвержден! ';
            if (user.registration_type === 'company_owner') {
                message += 'Теперь вы можете войти в систему.';
            } else {
                message += 'Пожалуйста, дождитесь подтверждения от администратора компании.';
            }
    
            console.log('Email успешно подтвержден');
            return res.status(200).json({
                success: true,
                message: message
            });
    
        } catch (error) {
            await connection.rollback();
            console.error('Ошибка верификации email:', error);
            return res.status(500).json({
                success: false,
                error: 'Не удалось подтвердить email. Пожалуйста, попробуйте позже.',
                details: error.message
            });
        } finally {
            connection.release();
        }
    },

    
    // Обновление токена
    refreshToken: async (req, res) => {
        console.log('Начало процесса обновления токена');
        try {
            const { refresh } = req.body;
            console.log('Получен refresh token');

            if (!refresh) {
                console.log('Refresh token отсутствует в запросе');
                return res.status(400).json({ 
                    error: 'Refresh token is required' 
                });
            }

            // Верификация refresh токена
            console.log('Верификация refresh token');
            const decoded = jwt.verify(refresh, process.env.JWT_REFRESH_SECRET);
            console.log('Токен успешно декодирован:', { userId: decoded.userId });

            if (decoded.exp * 1000 < Date.now()) {
                console.log('Refresh token истек');
                return res.status(401).json({ error: 'Refresh token expired' });
            }

            // Проверка токена в базе
            console.log('Проверка токена в базе данных');
            const [users] = await pool.query(
                'SELECT * FROM users WHERE id = ? AND refresh_token = ?',
                [decoded.userId, refresh]
            );
            
            if (!users.length) {
                console.log('Недействительный токен или сессия истекла');
                return res.status(401).json({ error: 'Invalid token or user session expired' });
            }

            const user = users[0];
            console.log(`Пользователь найден: ID ${user.id}`);

            // Генерация новых токенов
            console.log('Генерация новых токенов');
            const { accessToken, refreshToken } = generateTokens(user.id, user.email);

            // Обновление refresh токена
            console.log('Обновление refresh token в базе данных');
            await pool.query(
                'UPDATE users SET refresh_token = ? WHERE id = ?',
                [refreshToken, user.id]
            );

            console.log('Токены успешно обновлены');
            res.json({
                access: accessToken,
                refresh: refreshToken
            });
        } catch (error) {
            console.error('Ошибка обновления токена:', error);
            res.status(401).json({ 
                error: 'Invalid refresh token' 
            });
        }
    },

    // Выход из системы
    logout: async (req, res) => {
        console.log('Начало процесса выхода из системы');
        try {
            console.log(`Выход пользователя с ID: ${req.user.userId}`);
            await pool.query(
                'UPDATE users SET refresh_token = NULL WHERE id = ?',
                [req.user.userId]
            );
            
            console.log('Выход успешно выполнен');
            res.json({ 
                message: 'Logged out successfully' 
            });
        } catch (error) {
            console.error('Ошибка выхода из системы:', error);
            res.status(500).json({ 
                error: 'Logout failed. Please try again.' 
            });
        }
    },


    // Запрос на сброс пароля
    forgotPassword: async (req, res) => {
        console.log('Начало процесса запроса сброса пароля');
        try {
            const { email } = req.body;
            console.log(`Запрос на сброс пароля для email: ${email}`);

            if (!email) {
                console.log('Email отсутствует в запросе');
                return res.status(400).json({ 
                    error: 'Email is required' 
                });
            }

            // Проверка существования пользователя
            console.log('Поиск пользователя в базе данных');
            const [users] = await pool.query(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );

            if (!users.length) {
                console.log('Пользователь не найден');
                return res.status(404).json({ 
                    error: 'User not found' 
                });
            }

            console.log('Генерация токена для сброса пароля');
            const resetToken = generateRandomToken();
            const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 час
            console.log('Токен для сброса пароля создан, срок действия:', resetTokenExpiry);

            console.log('Сохранение токена для сброса пароля в базе данных');
            await pool.query(
                'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?',
                [resetToken, resetTokenExpiry, email]
            );

            // Отправка email для сброса пароля
            console.log('Отправка email для сброса пароля');
            await sendPasswordResetEmail(email, resetToken);
            console.log('Email для сброса пароля успешно отправлен');

            res.json({ 
                message: 'Password reset instructions sent to email' 
            });
        } catch (error) {
            console.error('Ошибка запроса сброса пароля:', error);
            res.status(500).json({ 
                error: 'Failed to process password reset request' 
            });
        }
    },

    // Сброс пароля
    resetPassword: async (req, res) => {
        console.log('Начало процесса сброса пароля');
        try {
            const { token, newPassword } = req.body;
            console.log('Получен запрос на сброс пароля с токеном');

            if (!token || !newPassword) {
                console.log('Отсутствует токен или новый пароль');
                return res.status(400).json({ 
                    error: 'Token and new password are required' 
                });
            }

            // Проверка токена
            console.log('Проверка токена сброса пароля');
            const [users] = await pool.query(
                'SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()',
                [token]
            );

            if (!users.length) {
                console.log('Недействительный или просроченный токен сброса пароля');
                return res.status(400).json({ 
                    error: 'Invalid or expired reset token' 
                });
            }

            console.log(`Найден пользователь с ID: ${users[0].id}`);
            
            // Обновление пароля
            console.log('Хеширование нового пароля');
            const hashedPassword = await hashPassword(newPassword);
            
            console.log('Обновление пароля в базе данных');
            await pool.query(
                'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
                [hashedPassword, users[0].id]
            );

            console.log('Пароль успешно обновлен');
            res.json({ 
                message: 'Password reset successful' 
            });
        } catch (error) {
            console.error('Ошибка сброса пароля:', error);
            res.status(500).json({ 
                error: 'Failed to reset password' 
            });
        }
    },

    // Получение данных пользователя
    getMe: async (req, res) => {
        console.log('Начало получения данных пользователя');
        try {
            console.log(`Запрос данных для пользователя ID: ${req.user.userId}`);
            const [users] = await pool.query(
                'SELECT id, email, first_name, last_name, is_verified FROM users WHERE id = ?',
                [req.user.userId]
            );

            if (!users.length) {
                console.log('Пользователь не найден');
                return res.status(404).json({ 
                    error: 'User not found' 
                });
            }

            console.log('Данные пользователя успешно получены');
            res.json(users[0]);
        } catch (error) {
            console.error('Ошибка получения данных пользователя:', error);
            res.status(500).json({ 
                error: 'Failed to retrieve user data' 
            });
        }
    }
};

module.exports = authController;