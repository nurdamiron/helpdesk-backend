const pool = require('../config/database');

/**
 * Миграция для обновления типа enum роли пользователя
 * Меняем 'user','support','manager','admin' на 'user','staff','moderator','admin'
 */
async function migrateUserRoles() {
  const connection = await pool.getConnection();
  try {
    console.log('Начинаем миграцию ролей пользователей...');
    await connection.beginTransaction();

    // Проверяем текущую структуру таблицы
    const [columns] = await connection.query(`SHOW COLUMNS FROM users WHERE Field = 'role'`);
    
    if (columns.length > 0) {
      const currentType = columns[0].Type;
      console.log(`Текущий тип роли: ${currentType}`);

      // Если тип не содержит новые роли, обновляем его
      if (!currentType.includes('moderator') || !currentType.includes('staff')) {
        console.log('Обновляем тип enum для поля role...');
        
        // Создаем резервную колонку role_new
        await connection.query(`
          ALTER TABLE users 
          ADD COLUMN role_new ENUM('user', 'staff', 'moderator', 'admin') 
          DEFAULT 'user'
        `);
        
        // Конвертируем старые роли в новые
        await connection.query(`
          UPDATE users 
          SET role_new = CASE 
            WHEN role = 'admin' THEN 'admin'
            WHEN role = 'manager' THEN 'moderator'
            WHEN role = 'support' THEN 'staff'
            ELSE 'user'
          END
        `);
        
        // Удаляем старое поле role и переименовываем role_new в role
        await connection.query(`ALTER TABLE users DROP COLUMN role`);
        await connection.query(`ALTER TABLE users CHANGE role_new role ENUM('user', 'staff', 'moderator', 'admin') DEFAULT 'user'`);
        
        console.log('Обновление типа enum выполнено успешно');
      }
    } else {
      // Если поле role отсутствует, но есть is_admin, выполняем миграцию с is_admin на role
      const [adminColumns] = await connection.query(`SHOW COLUMNS FROM users WHERE Field = 'is_admin'`);
      
      if (adminColumns.length > 0) {
        console.log('Обнаружено поле is_admin, мигрируем на role...');
        
        // Добавляем поле role
        await connection.query(`
          ALTER TABLE users 
          ADD COLUMN role ENUM('user', 'staff', 'moderator', 'admin') 
          DEFAULT 'user'
        `);
        
        // Конвертируем is_admin в role
        await connection.query(`
          UPDATE users 
          SET role = CASE 
            WHEN is_admin = 1 THEN 'admin'
            ELSE 'user'
          END
        `);
        
        // Удаляем старое поле is_admin
        await connection.query(`ALTER TABLE users DROP COLUMN is_admin`);
        
        console.log('Миграция с is_admin на role выполнена успешно');
      } else {
        // Если нет ни role, ни is_admin, создаем поле role
        console.log('Создаем новое поле role...');
        await connection.query(`
          ALTER TABLE users 
          ADD COLUMN role ENUM('user', 'staff', 'moderator', 'admin') 
          DEFAULT 'user'
        `);
        console.log('Поле role создано успешно');
      }
    }

    await connection.commit();
    console.log('Миграция ролей пользователей завершена успешно');
  } catch (error) {
    await connection.rollback();
    console.error('Ошибка миграции ролей пользователей:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Чтобы выполнить миграцию, нужно раскомментировать следующую строку и запустить файл через node
// migrateUserRoles().catch(console.error);

module.exports = migrateUserRoles; 