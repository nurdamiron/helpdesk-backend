#!/usr/bin/env node

/**
 * Скрипт для создания тестового пользователя
 */

require('dotenv').config();
const pool = require('./src/config/database');

async function createTestUser() {
  try {
    console.log('🔧 Создание тестового пользователя...');
    
    // Проверяем, есть ли уже тестовый пользователь
    const [existingUsers] = await pool.query(
      'SELECT id, email FROM users WHERE email = ?',
      ['test@localhost']
    );

    if (existingUsers.length > 0) {
      console.log('✅ Тестовый пользователь уже существует:', existingUsers[0]);
      console.log('📧 Email: test@localhost');
      console.log('🔐 Password: password');
      return;
    }

    // Создаем тестового пользователя
    const [result] = await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, role, is_active, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      ['test@localhost', 'password', 'Тест', 'Пользователь', 'user', 1]
    );

    console.log('✅ Тестовый пользователь создан успешно!');
    console.log('📧 Email: test@localhost');
    console.log('🔐 Password: password');
    console.log('🆔 ID:', result.insertId);
    console.log('👤 Role: user');
    
    console.log('\n💡 Теперь вы можете войти в систему с этими данными');
    console.log('💡 http://localhost:5173/login');

  } catch (error) {
    console.error('❌ Ошибка при создании тестового пользователя:', error.message);
    
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.log('💡 Таблица users не существует. Запустите миграции:');
      console.log('   npm run migrate');
    }
  } finally {
    process.exit(0);
  }
}

createTestUser();