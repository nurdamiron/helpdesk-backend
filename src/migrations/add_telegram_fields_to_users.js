const pool = require('../config/database');

async function up() {
  try {
    // Проверяем существование колонок
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users' 
      AND COLUMN_NAME IN ('telegram_chat_id', 'telegram_username', 'registration_token')
    `);
    
    const existingColumns = columns.map(col => col.COLUMN_NAME);
    
    // Добавляем только те колонки, которых нет
    if (!existingColumns.includes('telegram_chat_id')) {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN telegram_chat_id VARCHAR(255) DEFAULT NULL
      `);
      console.log('✅ Добавлена колонка telegram_chat_id');
    }
    
    if (!existingColumns.includes('telegram_username')) {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN telegram_username VARCHAR(255) DEFAULT NULL
      `);
      console.log('✅ Добавлена колонка telegram_username');
    }
    
    if (!existingColumns.includes('registration_token')) {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN registration_token VARCHAR(255) DEFAULT NULL
      `);
      console.log('✅ Добавлена колонка registration_token');
    }

    // Проверяем существование индекса
    const [indexes] = await pool.query(`
      SHOW INDEX FROM users WHERE Key_name = 'idx_telegram_chat_id'
    `);
    
    if (indexes.length === 0) {
      // Добавляем индекс для быстрого поиска по telegram_chat_id
      await pool.query(`
        CREATE INDEX idx_telegram_chat_id 
        ON users (telegram_chat_id)
      `);
      console.log('✅ Добавлен индекс idx_telegram_chat_id');
    }

    console.log('✅ Миграция для Telegram интеграции завершена успешно');
  } catch (error) {
    console.error('❌ Ошибка при добавлении полей для Telegram:', error);
    throw error;
  }
}

async function down() {
  try {
    // Удаляем индекс
    await pool.query('DROP INDEX IF EXISTS idx_telegram_chat_id ON users');
    
    // Удаляем колонки
    await pool.query(`
      ALTER TABLE users 
      DROP COLUMN IF EXISTS telegram_chat_id,
      DROP COLUMN IF EXISTS telegram_username,
      DROP COLUMN IF EXISTS registration_token
    `);

    console.log('✅ Поля для Telegram интеграции успешно удалены');
  } catch (error) {
    console.error('❌ Ошибка при удалении полей для Telegram:', error);
    throw error;
  }
}

module.exports = { up, down };