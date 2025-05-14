// check-database-roles.js
require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkDatabaseRoles() {
  console.log('Checking database role ENUM definitions...');
  
  // Create a connection directly, bypassing the pool
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('Connected to database directly');
    
    // Check role column definition
    const [roleColumn] = await connection.execute(
      "SHOW COLUMNS FROM users WHERE Field = 'role'"
    );
    
    console.log('Current role column definition:');
    console.log(roleColumn[0]);
    
    // This will help us understand why the roles are not being saved properly
    
    console.log('\nCurrent users in database:');
    const [users] = await connection.execute('SELECT id, email, role FROM users');
    console.table(users);

    // Check if we need to modify the ENUM
    if (!roleColumn[0].Type.includes("'support'") || !roleColumn[0].Type.includes("'manager'")) {
      console.log('\nRole column needs to be updated to include all necessary roles.');
      console.log('Current options:', roleColumn[0].Type);
      
      // Let's fix the role column to allow all roles
      console.log('\nUpdating role column to allow all necessary roles...');
      
      // Temporarily change to VARCHAR
      await connection.execute(
        "ALTER TABLE users MODIFY COLUMN role VARCHAR(20) DEFAULT 'user'"
      );
      
      console.log('Changed role to VARCHAR temporarily');
      
      // Now change back to ENUM with all needed values
      await connection.execute(
        "ALTER TABLE users MODIFY COLUMN role ENUM('user','support','manager','admin','moderator','staff') DEFAULT 'user'"
      );
      
      console.log('Changed role back to ENUM with all necessary values');
      
      // Check the updated column
      const [updatedColumn] = await connection.execute(
        "SHOW COLUMNS FROM users WHERE Field = 'role'"
      );
      
      console.log('\nUpdated role column definition:');
      console.log(updatedColumn[0]);
      
      // Now that we've fixed the ENUM, let's update the roles again
      const usersToUpdate = [
        { email: 'support@example.com', role: 'support' },
        { email: 'manager@example.com', role: 'manager' },
        { email: 'moderator@example.com', role: 'moderator' }
      ];

      for (const user of usersToUpdate) {
        const [result] = await connection.execute(
          'UPDATE users SET role = ? WHERE email = ?',
          [user.role, user.email]
        );
        
        console.log(`Updated user ${user.email} with role: ${user.role} - Affected rows: ${result.affectedRows}`);
      }
      
      // Show updated users
      console.log('\nUsers after update:');
      const [updatedUsers] = await connection.execute('SELECT id, email, role FROM users');
      console.table(updatedUsers);
    }
  } catch (error) {
    console.error('Error checking/updating database roles:', error);
  } finally {
    // Close the connection
    await connection.end();
    console.log('Database connection closed');
  }
}

// Run the function
checkDatabaseRoles();