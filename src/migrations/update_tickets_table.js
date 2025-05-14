const pool = require('../config/database');

/**
 * Миграция для обновления таблицы tickets с добавлением поля user_id
 */
async function updateTicketsTable() {
  const connection = await pool.getConnection();
  try {
    console.log('Начинаем миграцию обновления таблицы tickets...');
    await connection.beginTransaction();

    // Проверяем существует ли колонка user_id
    const [columns] = await connection.query('SHOW COLUMNS FROM tickets LIKE ?', ['user_id']);
    
    if (columns.length === 0) {
      console.log('Добавляем колонку user_id в таблицу tickets');
      await connection.query(`
        ALTER TABLE tickets
        ADD COLUMN user_id INT NULL,
        ADD CONSTRAINT fk_tickets_user_id
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL
      `);
      
      console.log('Колонка user_id успешно добавлена');
    } else {
      console.log('Колонка user_id уже существует в таблице tickets');
    }
    
    // Проверяем существует ли колонка assigned_to
    const [assignedColumns] = await connection.query('SHOW COLUMNS FROM tickets LIKE ?', ['assigned_to']);
    
    if (assignedColumns.length === 0) {
      console.log('Добавляем колонку assigned_to в таблицу tickets');
      await connection.query(`
        ALTER TABLE tickets
        ADD COLUMN assigned_to INT NULL,
        ADD CONSTRAINT fk_tickets_assigned_to
        FOREIGN KEY (assigned_to) REFERENCES users(id)
        ON DELETE SET NULL
      `);
      
      console.log('Колонка assigned_to успешно добавлена');
    } else {
      console.log('Колонка assigned_to уже существует в таблице tickets');
    }

    await connection.commit();
    console.log('Миграция обновления таблицы tickets успешно завершена');
    
  } catch (error) {
    await connection.rollback();
    console.error('Ошибка при обновлении таблицы tickets:', error);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = updateTicketsTable; 