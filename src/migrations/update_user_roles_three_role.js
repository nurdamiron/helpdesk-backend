// src/migrations/update_user_roles_three_role.js
const pool = require('../services/pool');

/**
 * Миграция для обновления системы ролей пользователей до трехуровневой модели:
 * admin, moderator, user
 */
const update_user_roles = async () => {
  try {
    console.log('Начинаем миграцию ролей пользователей до трехуровневой модели...');
    
    // 1. Проверяем, существует ли таблица users
    const [tables] = await pool.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users'
    `);
    
    if (tables.length === 0) {
      console.log('Таблица users не найдена. Создаем новую таблицу...');
      
      // Создаем таблицу users с правильным ENUM для ролей
      await pool.query(`
        CREATE TABLE users (
          id int NOT NULL AUTO_INCREMENT,
          email varchar(255) NOT NULL,
          password varchar(255) NOT NULL,
          first_name varchar(100) DEFAULT NULL,
          last_name varchar(100) DEFAULT NULL,
          role enum('admin','moderator','user') DEFAULT 'user',
          active tinyint(1) DEFAULT 1,
          created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      
      console.log('Таблица users успешно создана с правильной структурой ролей.');
      return;
    }
    
    // 2. Проверяем текущую структуру ENUM для поля role
    const [columns] = await pool.query(`
      SHOW COLUMNS FROM users WHERE Field = 'role'
    `);
    
    if (columns.length === 0) {
      console.log('Поле role не найдено в таблице users.');
      return;
    }
    
    const currentType = columns[0].Type;
    console.log(`Текущий тип поля role: ${currentType}`);
    
    // 3. Если ENUM уже правильный, пропускаем изменение
    if (currentType === "enum('admin','moderator','user')") {
      console.log('Поле role уже имеет правильную структуру enum.');
    } else {
      // 4. Меняем структуру ENUM и мигрируем существующие данные
      console.log('Обновляем структуру поля role...');
      
      // Временно изменяем тип поля на VARCHAR
      await pool.query(`
        ALTER TABLE users 
        MODIFY COLUMN role VARCHAR(20) DEFAULT 'user'
      `);
      
      // Обновляем существующие роли для соответствия новой модели
      await pool.query(`
        UPDATE users 
        SET role = CASE 
          WHEN role = 'admin' THEN 'admin'
          WHEN role IN ('support', 'manager', 'staff') THEN 'moderator'
          ELSE 'user'
        END
      `);
      
      // Изменяем тип поля обратно на ENUM с новыми значениями
      await pool.query(`
        ALTER TABLE users 
        MODIFY COLUMN role ENUM('admin','moderator','user') DEFAULT 'user'
      `);
      
      console.log('Структура поля role успешно обновлена.');
    }
    
    // 5. Проверяем, есть ли записи в таблице
    const [userCount] = await pool.query('SELECT COUNT(*) as count FROM users');
    
    if (userCount[0].count === 0) {
      console.log('Таблица users пуста. Создаем администратора по умолчанию...');
      
      // Добавляем администратора по умолчанию, если таблица пуста
      await pool.query(`
        INSERT INTO users (email, password, first_name, last_name, role)
        VALUES ('admin@example.com', 'admin123', 'Admin', 'User', 'admin')
      `);
      
      console.log('Администратор по умолчанию успешно создан.');
    }
    
    console.log('Миграция ролей пользователей завершена успешно.');
  } catch (error) {
    console.error('Ошибка при выполнении миграции ролей пользователей:', error);
    throw error;
  }
};

module.exports = update_user_roles;