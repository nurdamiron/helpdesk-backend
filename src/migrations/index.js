const updateUserRoles = require('./update_user_roles');
const updateTicketsTable = require('./update_tickets_table');
const updateUserRolesThreeRole = require('./update_user_roles_three_role');
const updateTicketMessagesSenderType = require('./update_ticket_messages_sender_type');
const addTicketMetadataFields = require('./add_ticket_metadata_fields');
const addUserActiveStatus = require('./add_user_active_status');
const updateTicketEnumsForHelpdesk = require('./update_ticket_enums_for_helpdesk');
const addTelegramPendingStatus = require('./add_telegram_pending_status');
const addTelegramFieldsToUsers = require('./add_telegram_fields_to_users');

/**
 * Запускает все миграции базы данных
 */
async function runMigrations() {
  try {
    console.log('Запуск миграций...');
    
    // Обновление ролей пользователей
    await updateUserRoles();
    
    // Обновление структуры таблицы tickets
    await updateTicketsTable();
    
    // Обновление ролей до трехуровневой модели (admin, moderator, user)
    await updateUserRolesThreeRole();
    
    // Обновление типа отправителя сообщений
    await updateTicketMessagesSenderType();
    
    // Добавление полей metadata и requester_metadata в таблицу tickets
    await addTicketMetadataFields();
    
    // Добавление поля is_active в таблицу users
    await addUserActiveStatus.up();
    
    // Обновление enum значений для поддержки системы helpdesk
    await updateTicketEnumsForHelpdesk();
    
    // Добавление статуса telegram_pending
    await addTelegramPendingStatus();
    
    // Добавление полей для Telegram интеграции
    await addTelegramFieldsToUsers.up();
    
    console.log('Все миграции выполнены успешно');
    process.exit(0);
  } catch (error) {
    console.error('Ошибка при выполнении миграций:', error);
    process.exit(1);
  }
}

// Запускаем миграции, если этот файл выполняется напрямую
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations }; 