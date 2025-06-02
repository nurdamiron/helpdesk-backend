const pool = require('../config/database');

/**
 * Миграция для обновления enum значений в таблице tickets для поддержки системы helpdesk
 */
async function updateTicketEnumsForHelpdesk() {
  const connection = await pool.getConnection();
  try {
    console.log('Начинаем миграцию для обновления enum значений в таблице tickets...');
    await connection.beginTransaction();

    // Проверяем существующие поля в таблице tickets
    const [tableInfo] = await connection.query('DESCRIBE tickets');
    const columnNames = tableInfo.map(col => col.Field);
    console.log('Существующие поля в таблице tickets:', columnNames);
    
    // Добавляем поле type, если его нет
    if (!columnNames.includes('type')) {
      console.log('Добавляем поле type в таблицу tickets');
      await connection.query(`
        ALTER TABLE tickets 
        ADD COLUMN type ENUM(
          'complaint', 'suggestion', 'request', 'other',
          'support_request', 'incident', 'access_request', 'information_request', 'emergency'
        ) DEFAULT 'support_request' AFTER description
      `);
    } else {
      console.log('Обновляем enum для поля type');
      await connection.query(`
        ALTER TABLE tickets 
        MODIFY COLUMN type ENUM(
          'complaint', 'suggestion', 'request', 'other',
          'support_request', 'incident', 'access_request', 'information_request', 'emergency'
        ) DEFAULT 'support_request'
      `);
    }
    
    // Проверяем и обновляем поле status
    const statusColumn = tableInfo.find(col => col.Field === 'status');
    if (statusColumn) {
      console.log('Обновляем enum для поля status');
      await connection.query(`
        ALTER TABLE tickets 
        MODIFY COLUMN status ENUM(
          'new', 'in_review', 'in_progress', 'pending', 'resolved', 'closed',
          'whatsapp_pending'
        ) DEFAULT 'new'
      `);
    } else {
      console.log('Добавляем поле status в таблицу tickets');
      await connection.query(`
        ALTER TABLE tickets 
        ADD COLUMN status ENUM(
          'new', 'in_review', 'in_progress', 'pending', 'resolved', 'closed',
          'whatsapp_pending'
        ) DEFAULT 'new' AFTER type
      `);
    }

    await connection.commit();
    console.log('Миграция для обновления enum значений в таблице tickets успешно завершена');
    
  } catch (error) {
    await connection.rollback();
    console.error('Ошибка при обновлении enum значений в таблице tickets:', error);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = updateTicketEnumsForHelpdesk;