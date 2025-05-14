// src/migrations/add_user_settings_fields.js
const pool = require('../config/database');

async function addUserSettingsFields() {
  try {
    console.log('Migrating: Adding user settings fields...');
    
    // Check if columns already exist to avoid duplicate column errors
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME IN ('position', 'phone', 'language', 'timezone', 'settings')
    `);
    
    const existingColumns = columns.map(col => col.COLUMN_NAME);
    
    // Add position column if it doesn't exist
    if (!existingColumns.includes('position')) {
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN position VARCHAR(100) NULL AFTER role
      `);
      console.log('Added position column to users table');
    }
    
    // Add phone column if it doesn't exist
    if (!existingColumns.includes('phone')) {
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN phone VARCHAR(20) NULL AFTER position
      `);
      console.log('Added phone column to users table');
    }
    
    // Add language column if it doesn't exist
    if (!existingColumns.includes('language')) {
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN language CHAR(2) DEFAULT 'kk' AFTER phone
      `);
      console.log('Added language column to users table');
    }
    
    // Add timezone column if it doesn't exist
    if (!existingColumns.includes('timezone')) {
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN timezone VARCHAR(50) DEFAULT 'asia-almaty' AFTER language
      `);
      console.log('Added timezone column to users table');
    }
    
    // Add settings column if it doesn't exist (JSON type)
    if (!existingColumns.includes('settings')) {
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN settings JSON NULL AFTER timezone
      `);
      console.log('Added settings column to users table');
    }
    
    console.log('Migration complete: User settings fields added successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  addUserSettingsFields()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = addUserSettingsFields;