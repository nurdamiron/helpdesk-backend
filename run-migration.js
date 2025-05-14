// script to run add_user_active_status.js migration
const addUserActiveStatus = require('./src/migrations/add_user_active_status');

async function runMigration() {
  try {
    console.log('Running add_user_active_status migration...');
    await addUserActiveStatus.up();
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();