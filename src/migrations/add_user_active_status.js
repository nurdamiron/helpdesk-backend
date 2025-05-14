// src/migrations/add_user_active_status.js
const pool = require('../config/database');

/**
 * Adds the is_active column to the users table
 */
exports.up = async () => {
  try {
    console.log('Running migration: add_user_active_status - up');
    
    // Check if the column already exists to avoid errors
    const [checkColumn] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'is_active'
    `);
    
    if (checkColumn.length === 0) {
      // Add the is_active column, defaulting to 1 (active)
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1
      `);
      console.log('Migration successful: Added is_active column to users table');
    } else {
      console.log('Column is_active already exists in users table. Skipping...');
    }
    
    return true;
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