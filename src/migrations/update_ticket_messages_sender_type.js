// src/migrations/update_ticket_messages_sender_type.js
const pool = require('../services/pool');

/**
 * Миграция для обновления типа отправителя сообщений в ticket_messages
 * от 'requester','staff','system' до 'user','moderator','admin','system'
 */
const update_ticket_messages_sender_type = async () => {
  try {
    console.log('Начинаем миграцию типа отправителя сообщений...');
    
    // 1. Проверяем, существует ли таблица ticket_messages
    const [tables] = await pool.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'ticket_messages'
    `);
    
    if (tables.length === 0) {
      console.log('Таблица ticket_messages не найдена. Создаем новую таблицу...');
      
      // Создаем таблицу ticket_messages с правильным ENUM для sender_type
      await pool.query(`
        CREATE TABLE ticket_messages (
          id int NOT NULL AUTO_INCREMENT,
          ticket_id int NOT NULL,
          sender_type enum('user','moderator','admin','system') NOT NULL,
          sender_id int DEFAULT NULL,
          content text NOT NULL,
          content_type enum('text','html') DEFAULT 'text',
          is_internal tinyint(1) DEFAULT '0',
          read_at timestamp NULL DEFAULT NULL,
          created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          status enum('sent','delivered','read') NOT NULL DEFAULT 'sent',
          delivered_at timestamp NULL DEFAULT NULL,
          PRIMARY KEY (id),
          KEY ticket_id (ticket_id),
          KEY idx_ticket_messages_read_at (read_at),
          KEY idx_ticket_messages_status (status),
          CONSTRAINT ticket_messages_ibfk_1 FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      
      console.log('Таблица ticket_messages успешно создана с правильной структурой типа отправителя.');
      return;
    }
    
    // 2. Проверяем текущую структуру ENUM для поля sender_type
    const [columns] = await pool.query(`
      SHOW COLUMNS FROM ticket_messages WHERE Field = 'sender_type'
    `);
    
    if (columns.length === 0) {
      console.log('Поле sender_type не найдено в таблице ticket_messages.');
      return;
    }
    
    const currentType = columns[0].Type;
    console.log(`Текущий тип поля sender_type: ${currentType}`);
    
    // 3. Если ENUM уже правильный, пропускаем изменение
    if (currentType === "enum('user','moderator','admin','system')") {
      console.log('Поле sender_type уже имеет правильную структуру enum.');
    } else {
      // 4. Меняем структуру ENUM и мигрируем существующие данные
      console.log('Обновляем структуру поля sender_type...');
      
      // Временно изменяем тип поля на VARCHAR
      await pool.query(`
        ALTER TABLE ticket_messages 
        MODIFY COLUMN sender_type VARCHAR(20)
      `);
      
      // Обновляем существующие типы отправителей для соответствия новой модели
      await pool.query(`
        UPDATE ticket_messages 
        SET sender_type = CASE 
          WHEN sender_type = 'requester' THEN 'user'
          WHEN sender_type = 'staff' THEN 'moderator'
          WHEN sender_type = 'system' THEN 'system'
          ELSE 'user'
        END
      `);
      
      // Изменяем тип поля обратно на ENUM с новыми значениями
      await pool.query(`
        ALTER TABLE ticket_messages 
        MODIFY COLUMN sender_type ENUM('user','moderator','admin','system') NOT NULL
      `);
      
      console.log('Структура поля sender_type успешно обновлена.');
    }
    
    console.log('Миграция типа отправителя сообщений завершена успешно.');
  } catch (error) {
    console.error('Ошибка при выполнении миграции типа отправителя сообщений:', error);
    throw error;
  }
};

module.exports = update_ticket_messages_sender_type;