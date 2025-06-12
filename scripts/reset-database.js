#!/usr/bin/env node

/**
 * Скрипт для сброса базы данных Helpdesk
 * Script for resetting Helpdesk database
 */

require('dotenv').config();
const pool = require('../src/config/database');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function resetDatabase() {
  console.log('🗑️  СБРОС БАЗЫ ДАННЫХ HELPDESK / HELPDESK DATABASE RESET');
  console.log('================================================');
  console.log('ВНИМАНИЕ! Это действие удалит ВСЕ данные из базы данных!');
  console.log('WARNING! This action will DELETE ALL data from the database!');
  console.log('================================================');
  
  const confirm1 = await askQuestion('Вы уверены, что хотите продолжить? (yes/no): ');
  if (confirm1.toLowerCase() !== 'yes') {
    console.log('❌ Операция отменена / Operation cancelled');
    rl.close();
    process.exit(0);
  }

  const confirm2 = await askQuestion('Введите "DELETE ALL DATA" для подтверждения: ');
  if (confirm2 !== 'DELETE ALL DATA') {
    console.log('❌ Неправильное подтверждение. Операция отменена.');
    rl.close();
    process.exit(0);
  }

  try {
    console.log('\n🔄 Начинаем сброс базы данных...');

    // Отключаем проверки внешних ключей
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    console.log('✅ Отключены проверки внешних ключей');

    // Очищаем все таблицы с данными (но сохраняем структуру)
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
        console.log(`⚠️  Не удалось очистить таблицу ${table}: ${error.message}`);
      }
    }

    // Включаем обратно проверки внешних ключей
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✅ Включены проверки внешних ключей');

    console.log('\n🎉 База данных успешно очищена!');
    console.log('Database successfully cleared!');

  } catch (error) {
    console.error('❌ Ошибка при сбросе базы данных:', error);
  }

  rl.close();
  process.exit(0);
}

async function addAdminUser() {
  console.log('\n👤 СОЗДАНИЕ АДМИНИСТРАТОРА / CREATING ADMINISTRATOR');
  console.log('=================================================');
  
  const email = await askQuestion('Email администратора: ');
  const password = await askQuestion('Пароль администратора: ');
  const firstName = await askQuestion('Имя (First Name): ');
  const lastName = await askQuestion('Фамилия (Last Name): ');

  try {
    const [result] = await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'admin', 1, NOW(), NOW())`,
      [email, password, firstName, lastName]
    );

    console.log(`✅ Администратор создан с ID: ${result.insertId}`);
    console.log(`📧 Email: ${email}`);
    console.log(`👤 Имя: ${firstName} ${lastName}`);
    console.log(`🔑 Роль: admin`);

  } catch (error) {
    console.error('❌ Ошибка при создании администратора:', error.message);
  }
}

async function main() {
  console.log('Helpdesk Database Management Tool');
  console.log('================================');
  console.log('1. Сбросить базу данных (очистить все данные)');
  console.log('2. Создать администратора');
  console.log('3. Сбросить БД и создать администратора');
  console.log('4. Выход');
  
  const choice = await askQuestion('\nВыберите действие (1-4): ');
  
  switch (choice) {
    case '1':
      await resetDatabase();
      break;
    case '2':
      await addAdminUser();
      break;
    case '3':
      await resetDatabase();
      await addAdminUser();
      break;
    case '4':
      console.log('👋 До свидания!');
      rl.close();
      process.exit(0);
      break;
    default:
      console.log('❌ Неверный выбор');
      rl.close();
      process.exit(1);
  }
}

// Запускаем основную функцию
main().catch(error => {
  console.error('❌ Критическая ошибка:', error);
  rl.close();
  process.exit(1);
});