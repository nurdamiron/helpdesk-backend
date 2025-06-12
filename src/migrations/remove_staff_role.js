// src/migrations/remove_staff_role.js
const pool = require('../config/database');

/**
 * Migration to remove 'staff' role references and update to three-role system
 * Changes 'staff' sender_type to 'moderator' in ticket_messages table
 */
const removeStaffRole = async () => {
  try {
    console.log('Starting migration to remove staff role references...');
    
    // 1. Check if ticket_messages table exists
    const [tables] = await pool.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'ticket_messages'
    `);
    
    if (tables.length > 0) {
      console.log('Updating ticket_messages table...');
      
      // 2. Update any 'staff' sender_type to 'moderator'
      const [updateResult] = await pool.query(`
        UPDATE ticket_messages 
        SET sender_type = 'moderator' 
        WHERE sender_type = 'staff'
      `);
      
      console.log(`Updated ${updateResult.affectedRows} rows in ticket_messages table.`);
      
      // 3. Update the CHECK constraint if it exists
      try {
        // First, we need to drop the existing constraint
        // MySQL doesn't support direct constraint modification, so we need to recreate
        await pool.query(`
          ALTER TABLE ticket_messages 
          DROP CHECK ticket_messages_chk_1
        `);
        
        // Add the new constraint
        await pool.query(`
          ALTER TABLE ticket_messages 
          ADD CONSTRAINT ticket_messages_sender_type_check 
          CHECK (sender_type IN ('user', 'moderator', 'admin', 'requester', 'system'))
        `);
        
        console.log('Updated CHECK constraint on ticket_messages.sender_type');
      } catch (error) {
        console.log('Could not update CHECK constraint (might not exist or different DB type):', error.message);
      }
    }
    
    console.log('Migration to remove staff role completed successfully.');
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
};

// Run the migration if called directly
if (require.main === module) {
  removeStaffRole()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = removeStaffRole;