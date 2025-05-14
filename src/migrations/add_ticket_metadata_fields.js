const pool = require('../config/database');

/**
 * Миграция для добавления полей metadata и requester_metadata в таблицу tickets
 */
async function addTicketMetadataFields() {
  const connection = await pool.getConnection();
  try {
    console.log('Начинаем миграцию для добавления полей metadata и requester_metadata в таблицу tickets...');
    await connection.beginTransaction();

    // Проверяем существует ли колонка metadata
    const [metadataColumns] = await connection.query('SHOW COLUMNS FROM tickets LIKE ?', ['metadata']);
    
    if (metadataColumns.length === 0) {
      console.log('Добавляем колонку metadata в таблицу tickets');
      await connection.query(`
        ALTER TABLE tickets
        ADD COLUMN metadata JSON NULL
      `);
      
      console.log('Колонка metadata успешно добавлена');
    } else {
      console.log('Колонка metadata уже существует в таблице tickets');
    }
    
    // Проверяем существует ли колонка requester_metadata
    const [requesterMetadataColumns] = await connection.query('SHOW COLUMNS FROM tickets LIKE ?', ['requester_metadata']);
    
    if (requesterMetadataColumns.length === 0) {
      console.log('Добавляем колонку requester_metadata в таблицу tickets');
      await connection.query(`
        ALTER TABLE tickets
        ADD COLUMN requester_metadata JSON NULL
      `);
      
      console.log('Колонка requester_metadata успешно добавлена');
    } else {
      console.log('Колонка requester_metadata уже существует в таблице tickets');
    }

    await connection.commit();
    console.log('Миграция для добавления полей metadata и requester_metadata в таблицу tickets успешно завершена');
    
  } catch (error) {
    await connection.rollback();
    console.error('Ошибка при добавлении полей metadata и requester_metadata в таблицу tickets:', error);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = addTicketMetadataFields;