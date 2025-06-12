#!/usr/bin/env node

/**
 * Быстрый сброс БД с созданием администратора
 * Quick database reset with admin creation
 */

require('dotenv').config();
const pool = require('../src/config/database');

async function quickReset() {
  console.log('🗑️  БЫСТРЫЙ СБРОС БД / QUICK DATABASE RESET');
  console.log('==========================================');

  try {
    // Отключаем проверки внешних ключей
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');

    // Очищаем все таблицы
    const tablesToClear = [
      'ticket_messages',
      'ticket_history', 
      'ticket_attachments',
      'ticket_notes',
      'task_comments',
      'employee_tasks',
      'tickets',
      'requesters',
      'users',
      'departments'
    ];

    for (const table of tablesToClear) {
      try {
        await pool.query(`DELETE FROM ${table}`);
        await pool.query(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
        console.log(`✅ Очищена таблица: ${table}`);
      } catch (error) {
        console.log(`⚠️  Таблица ${table} не найдена или ошибка: ${error.message}`);
      }
    }

    // Включаем обратно проверки внешних ключей
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');

    // Создаем администратора по умолчанию
    const [result] = await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'admin', 1, NOW(), NOW())`,
      ['admin@helpdesk.kz', 'admin123', 'Система', 'Администратор']
    );

    console.log('\n🎉 База данных успешно очищена и настроена!');
    console.log('Database successfully cleared and configured!');
    console.log('\n👤 Создан администратор:');
    console.log(`📧 Email: admin@helpdesk.kz`);
    console.log(`🔑 Пароль: admin123`);
    console.log(`👤 Имя: Система Администратор`);
    console.log(`🔑 Роль: admin`);
    console.log(`🆔 ID: ${result.insertId}`);

  } catch (error) {
    console.error('❌ Ошибка при сбросе базы данных:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Запускаем сброс
quickReset();