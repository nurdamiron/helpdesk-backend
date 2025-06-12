#!/usr/bin/env node

/**
 * Добавление демо-данных в БД
 * Adding demo data to database
 */

require('dotenv').config();
const pool = require('../src/config/database');

async function addDemoData() {
  console.log('📊 ДОБАВЛЕНИЕ ДЕМО-ДАННЫХ / ADDING DEMO DATA');
  console.log('============================================');

  try {
    // Добавляем отделы
    console.log('🏢 Создание отделов...');
    const departments = [
      { name: 'IT Support', description: 'Техническая поддержка' },
      { name: 'HR', description: 'Отдел кадров' },
      { name: 'Finance', description: 'Финансовый отдел' },
      { name: 'Operations', description: 'Операционный отдел' }
    ];

    for (const dept of departments) {
      await pool.query(
        'INSERT INTO departments (name, description, created_at) VALUES (?, ?, NOW())',
        [dept.name, dept.description]
      );
    }
    console.log('✅ Создано отделов: ' + departments.length);

    // Добавляем пользователей
    console.log('👥 Создание пользователей...');
    const users = [
      { email: 'moderator@helpdesk.kz', password: 'mod123', first_name: 'Aidana', last_name: 'Moderator', role: 'moderator' },
      { email: 'support1@helpdesk.kz', password: 'moderator123', first_name: 'Arman', last_name: 'Tech', role: 'moderator' },
      { email: 'support2@helpdesk.kz', password: 'moderator123', first_name: 'Nazym', last_name: 'Helper', role: 'moderator' },
      { email: 'user1@company.kz', password: 'user123', first_name: 'Аслан', last_name: 'Сәдуақасов', role: 'user' },
      { email: 'user2@company.kz', password: 'user123', first_name: 'Гүлнара', last_name: 'Досумова', role: 'user' },
      { email: 'user3@company.kz', password: 'user123', first_name: 'Берік', last_name: 'Қасымов', role: 'user' }
    ];

    for (const user of users) {
      await pool.query(
        `INSERT INTO users (email, password, first_name, last_name, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [user.email, user.password, user.first_name, user.last_name, user.role]
      );
    }
    console.log('✅ Создано пользователей: ' + users.length);

    // Добавляем тестовые заявки
    console.log('🎫 Создание тестовых заявок...');
    const [adminUser] = await pool.query('SELECT id FROM users WHERE role = "admin" LIMIT 1');
    const [staffUsers] = await pool.query('SELECT id FROM users WHERE role = "staff"');
    const [regularUsers] = await pool.query('SELECT id FROM users WHERE role = "user"');

    const tickets = [
      {
        subject: 'Не работает принтер в офисе',
        description: 'Принтер Canon не печатает документы. Горит красная лампочка. Требуется срочный ремонт.',
        type: 'support_request',
        priority: 'high',
        status: 'new',
        assigned_to: null,
        user_id: regularUsers[0]?.id
      },
      {
        subject: 'Проблемы с доступом к CRM системе',
        description: 'Не могу войти в CRM систему. Пароль не подходит, возможно нужен сброс.',
        type: 'support_request',
        priority: 'medium',
        status: 'in_progress',
        assigned_to: staffUsers[0]?.id,
        user_id: regularUsers[1]?.id
      },
      {
        subject: 'Запрос на новое оборудование',
        description: 'Требуется новый монитор для рабочего места. Текущий имеет дефекты экрана.',
        type: 'support_request',
        priority: 'low',
        status: 'pending',
        assigned_to: staffUsers[1]?.id,
        user_id: regularUsers[2]?.id
      },
      {
        subject: 'Сбой в системе учета',
        description: 'Система учета выдает ошибку при формировании отчетов. Критичная проблема.',
        type: 'incident',
        priority: 'urgent',
        status: 'resolved',
        assigned_to: staffUsers[0]?.id,
        user_id: regularUsers[0]?.id
      },
      {
        subject: 'Настройка нового сотрудника',
        description: 'Требуется создать аккаунты и настроить доступы для нового сотрудника IT отдела.',
        type: 'support_request',
        priority: 'medium',
        status: 'closed',
        assigned_to: adminUser[0]?.id,
        user_id: regularUsers[1]?.id
      }
    ];

    for (const ticket of tickets) {
      const [result] = await pool.query(
        `INSERT INTO tickets (subject, description, type, priority, status, assigned_to, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 168) HOUR), NOW())`,
        [
          ticket.subject,
          ticket.description,
          ticket.type,
          ticket.priority,
          ticket.status,
          ticket.assigned_to,
          ticket.user_id
        ]
      );

      // Добавляем историю для заявки
      await pool.query(
        `INSERT INTO ticket_history (ticket_id, action, old_value, new_value, user_id, created_at)
         VALUES (?, 'created', NULL, 'Заявка создана', ?, NOW())`,
        [result.insertId, ticket.user_id]
      );

      if (ticket.assigned_to) {
        await pool.query(
          `INSERT INTO ticket_history (ticket_id, action, old_value, new_value, user_id, created_at)
           VALUES (?, 'assigned', NULL, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
          [result.insertId, `Назначена пользователю ID ${ticket.assigned_to}`, ticket.assigned_to]
        );
      }
    }
    console.log('✅ Создано заявок: ' + tickets.length);

    // Добавляем сообщения к заявкам
    console.log('💬 Добавление сообщений к заявкам...');
    const [allTickets] = await pool.query('SELECT id FROM tickets');
    
    for (const ticket of allTickets.slice(0, 3)) {
      // Сообщение от пользователя
      await pool.query(
        `INSERT INTO ticket_messages (ticket_id, sender_type, message, created_at)
         VALUES (?, 'user', 'Добавлю дополнительную информацию по проблеме...', DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
        [ticket.id]
      );
      
      // Ответ от поддержки
      await pool.query(
        `INSERT INTO ticket_messages (ticket_id, sender_type, message, created_at)
         VALUES (?, 'moderator', 'Спасибо за уточнение. Работаем над решением проблемы.', DATE_ADD(NOW(), INTERVAL 2 HOUR))`,
        [ticket.id]
      );
    }
    console.log('✅ Добавлены сообщения к заявкам');

    console.log('\n🎉 Демо-данные успешно добавлены!');
    console.log('Demo data successfully added!');
    console.log('\n📊 Итоговая статистика:');
    console.log(`🏢 Отделов: ${departments.length}`);
    console.log(`👥 Пользователей: ${users.length + 1} (включая админа)`);
    console.log(`🎫 Заявок: ${tickets.length}`);
    console.log(`💬 Сообщений: ${allTickets.slice(0, 3).length * 2}`);

  } catch (error) {
    console.error('❌ Ошибка при добавлении демо-данных:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Запускаем добавление демо-данных
addDemoData();