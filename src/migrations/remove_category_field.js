// Migration to remove category field from tickets table
const pool = require('../config/database');

async function up() {
  try {
    // Check if category column exists
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tickets' 
      AND COLUMN_NAME = 'category'
    `);

    if (columns.length > 0) {
      // Remove category column
      await pool.query(`
        ALTER TABLE tickets DROP COLUMN category
      `);
      console.log('✅ Successfully removed category column from tickets table');
    } else {
      console.log('ℹ️ Category column does not exist in tickets table');
    }

  } catch (error) {
    console.error('❌ Error removing category field:', error);
    throw error;
  }
}

async function down() {
  try {
    // Re-add category column if needed
    await pool.query(`
      ALTER TABLE tickets 
      ADD COLUMN category VARCHAR(50) DEFAULT 'general'
    `);
    console.log('✅ Successfully re-added category column to tickets table');
  } catch (error) {
    console.error('❌ Error re-adding category field:', error);
    throw error;
  }
}

module.exports = { up, down };