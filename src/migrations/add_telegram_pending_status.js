const pool = require('../config/database');

/**
 * Миграция для добавления статуса telegram_pending в таблицу tickets
 */
async function addTelegramPendingStatus() {
  const connection = await pool.getConnection();
  try {
    console.log('Начинаем миграцию для добавления статуса telegram_pending...');
    await connection.beginTransaction();

    // Обновляем enum для поля status, добавляя telegram_pending
    console.log('Обновляем enum для поля status, добавляя telegram_pending');
    await connection.query(`
      ALTER TABLE tickets 
      MODIFY COLUMN status ENUM(
        'new', 'in_review', 'in_progress', 'pending', 'resolved', 'closed',
        'whatsapp_pending', 'telegram_pending'
      ) DEFAULT 'new'
    `);

    await connection.commit();
    console.log('Миграция для добавления статуса telegram_pending успешно завершена');
    
  } catch (error) {
    await connection.rollback();
    console.error('Ошибка при добавлении статуса telegram_pending:', error);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = addTelegramPendingStatus;