// src/migrations/add_user_active_status.js
const pool = require('../config/database');

/**
 * Adds the is_active column to the users table or renames 'active' to 'is_active' if it exists
 */
exports.up = async () => {
  try {
    console.log('Running migration: add_user_active_status - up');
    
    // Check if any of the columns exist
    const [checkColumns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users' 
      AND COLUMN_NAME IN ('is_active', 'active')
    `);
    
    const hasIsActive = checkColumns.some(col => col.COLUMN_NAME === 'is_active');
    const hasActive = checkColumns.some(col => col.COLUMN_NAME === 'active');
    
    if (hasIsActive) {
      console.log('Column is_active already exists in users table. Skipping...');
      return true;
    } else if (hasActive) {
      // Rename 'active' to 'is_active'
      console.log('Found column "active" - renaming to "is_active"');
      await pool.query(`
        ALTER TABLE users
        CHANGE COLUMN active is_active TINYINT(1) DEFAULT 1
      `);
      console.log('Migration successful: Renamed active column to is_active');
      return true;
    } else {
      // Add the is_active column, defaulting to 1 (active)
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1
      `);
      console.log('Migration successful: Added is_active column to users table');
      return true;
    }
  } catch (error) {
    console.error('Migration failed: add_user_active_status - up', error);
    throw error;
  }
};

/**
 * Removes the is_active column from the users table
 */
exports.down = async () => {
  try {
    console.log('Running migration: add_user_active_status - down');
    
    // Check if the column exists before attempting to drop it
    const [checkColumn] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'is_active'
    `);
    
    if (checkColumn.length > 0) {
      await pool.query(`
        ALTER TABLE users
        DROP COLUMN is_active
      `);
      console.log('Migration successful: Removed is_active column from users table');
    } else {
      console.log('Column is_active does not exist in users table. Skipping...');
    }
    
    return true;
  } catch (error) {
    console.error('Migration failed: add_user_active_status - down', error);
    throw error;
  }
};