// direct-db-fix.js
require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixUserRoles() {
  console.log('Fixing user roles with direct connection...');
  
  // Create a connection directly, bypassing the pool
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('Connected to database directly');
    
    // Users to update
    const usersToUpdate = [
      { email: 'support@example.com', role: 'support' },
      { email: 'manager@example.com', role: 'manager' },
      { email: 'moderator@example.com', role: 'support' }
    ];

    for (const user of usersToUpdate) {
      // Update user role
      const [result] = await connection.execute(
        'UPDATE users SET role = ? WHERE email = ?',
        [user.role, user.email]
      );
      
      if (result.affectedRows > 0) {
        console.log(`Updated user ${user.email} with role: ${user.role}`);
      } else {
        console.log(`No user found with email: ${user.email}`);
      }
    }
    
    // List all users after update
    const [allUsers] = await connection.execute('SELECT id, email, role FROM users');
    console.log('\nAll users in the database after fix:');
    console.table(allUsers);
  } catch (error) {
    console.error('Error fixing user roles:', error);
  } finally {
    // Close the connection
    await connection.end();
    console.log('Database connection closed');
  }
}

// Run the function
fixUserRoles();