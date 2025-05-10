// config/database.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'helpdesk',  // Используем переменную окружения или дефолтное значение
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Добавим дополнительные настройки для надежности
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Функция для проверки подключения
const testConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('Database connected successfully');
        
        // Check table existence with proper error handling
        try {
            const [tables] = await connection.query('SHOW TABLES LIKE "tickets"');
            
            if (tables.length > 0) {
                console.log('Table tickets exists');
                
                const [columns] = await connection.query('SHOW COLUMNS FROM tickets');
                console.log('Table structure:', columns.map(col => col.Field));
            } else {
                console.log('Table tickets does not exist');
            }
        } catch (err) {
            console.error('Error checking tables:', err.message);
        }

        connection.release();
        return true;
    } catch (err) {
        console.error('Database connection error:', {
            message: err.message,
            code: err.code,
            stack: err.stack
        });
        return false;
    }
};

// Выполняем проверку подключения при запуске
testConnection();

// Экспортируем и пул, и функцию тестирования
module.exports = pool;
module.exports.testConnection = testConnection;