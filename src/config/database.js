// config/database.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'root',  // Используем существующую базу root
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
        
        // Проверяем существование таблицы customers 
        const [tables] = await connection.query(
            'SHOW TABLES LIKE "tickets"'
        );
        
        if (tables.length > 0) {
            console.log('Table tickets exists');
            
            // Проверяем структуру таблицы
            const [columns] = await connection.query(
                'SHOW COLUMNS FROM tickets'
            );
            console.log('Table structure:', columns.map(col => col.Field));
        } else {
            console.log('Table customers does not exist');
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

module.exports = pool;