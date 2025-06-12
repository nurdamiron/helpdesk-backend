#!/usr/bin/env node

/**
 * Создание основных пользователей системы
 * Creating main system users
 */

require('dotenv').config();
const pool = require('../src/config/database');

async function createUsers() {
  console.log('👥 СОЗДАНИЕ ПОЛЬЗОВАТЕЛЕЙ СИСТЕМЫ / CREATING SYSTEM USERS');
  console.log('=======================================================');

  try {
    // Проверяем, есть ли уже админ
    const [existingAdmin] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR role = "admin"',
      ['admin@helpdesk.kz']
    );

    const users = [
      {
        email: 'admin@helpdesk.kz',
        password: 'admin123',
        first_name: 'Система',
        last_name: 'Администратор',
        role: 'admin',
        skip: existingAdmin.length > 0
      },
      {
        email: 'manager@helpdesk.kz',
        password: 'manager123',
        first_name: 'Айгерим',
        last_name: 'Менеджер',
        role: 'moderator',
        skip: false
      },
      {
        email: 'user@helpdesk.kz',
        password: 'user123',
        first_name: 'Асхат',
        last_name: 'Пользователь',
        role: 'user',
        skip: false
      }
    ];

    console.log('📝 Создание пользователей...\n');

    for (const user of users) {
      if (user.skip) {
        console.log(`⏭️  Пропускаем ${user.email} - уже существует`);
        continue;
      }

      // Проверяем, существует ли пользователь
      const [existing] = await pool.query(
        'SELECT id FROM users WHERE email = ?',
        [user.email]
      );

      if (existing.length > 0) {
        console.log(`⚠️  Пользователь ${user.email} уже существует`);
        continue;
      }

      // Создаем пользователя
      const [result] = await pool.query(
        `INSERT INTO users (email, password, first_name, last_name, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [user.email, user.password, user.first_name, user.last_name, user.role]
      );

      console.log(`✅ Создан пользователь:`);
      console.log(`   🆔 ID: ${result.insertId}`);
      console.log(`   📧 Email: ${user.email}`);
      console.log(`   🔑 Пароль: ${user.password}`);
      console.log(`   👤 Имя: ${user.first_name} ${user.last_name}`);
      console.log(`   🎭 Роль: ${user.role}`);
      console.log('');
    }

    // Показываем итоговую статистику
    const [stats] = await pool.query(`
      SELECT 
        role,
        COUNT(*) as count
      FROM users 
      GROUP BY role
      ORDER BY 
        CASE role 
          WHEN 'admin' THEN 1
          WHEN 'moderator' THEN 2
          WHEN 'moderator' THEN 2
          WHEN 'user' THEN 4
          ELSE 5
        END
    `);

    console.log('📊 ИТОГОВАЯ СТАТИСТИКА ПОЛЬЗОВАТЕЛЕЙ:');
    console.log('=====================================');
    stats.forEach(stat => {
      const roleNames = {
        'admin': '👑 Администраторы',
        'moderator': '👨‍💼 Менеджеры', 
        'moderator': '👨‍🔧 Модераторы',
        'user': '👤 Пользователи'
      };
      console.log(`${roleNames[stat.role] || stat.role}: ${stat.count}`);
    });

    console.log('\n🎉 Пользователи системы созданы успешно!');
    console.log('System users created successfully!');

    console.log('\n🔐 ДАННЫЕ ДЛЯ ВХОДА / LOGIN CREDENTIALS:');
    console.log('=======================================');
    console.log('👑 АДМИН:');
    console.log('   Email: admin@helpdesk.kz');
    console.log('   Пароль: admin123');
    console.log('');
    console.log('👨‍💼 МЕНЕДЖЕР:');
    console.log('   Email: manager@helpdesk.kz');
    console.log('   Пароль: manager123');
    console.log('');
    console.log('👤 ПОЛЬЗОВАТЕЛЬ:');
    console.log('   Email: user@helpdesk.kz');
    console.log('   Пароль: user123');

  } catch (error) {
    console.error('❌ Ошибка при создании пользователей:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Запускаем создание пользователей
createUsers();