/**
 * Скрипт для запуска миграции для обновления enum значений в системе helpdesk
 */
const updateTicketEnumsForHelpdesk = require('./src/migrations/update_ticket_enums_for_helpdesk');

async function runHelpdeskMigration() {
  try {
    console.log('Запуск миграции для обновления enum значений в системе helpdesk...');
    
    await updateTicketEnumsForHelpdesk();
    
    console.log('Миграция успешно завершена');
    process.exit(0);
  } catch (error) {
    console.error('Ошибка при выполнении миграции:', error);
    process.exit(1);
  }
}

runHelpdeskMigration();