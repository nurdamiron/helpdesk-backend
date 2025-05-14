// fix-password.js
require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixPassword() {
  console.log('Fixing user password...');
  
  // Create a connection directly, bypassing the pool
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('Connected to database');
    
    // Fix passwords for all test accounts to ensure they are exactly "password"
    const usersToFix = [
      'admin@example.com',
      'support@example.com',
      'manager@example.com',
      'moderator@example.com',
      'user@example.com'
    ];

    for (const email of usersToFix) {
      // Update password
      const [result] = await connection.execute(
        'UPDATE users SET password = ? WHERE email = ?',
        ['password', email]
      );
      
      console.log(`Updated password for ${email} - Affected rows: ${result.affectedRows}`);
    }
    
    // Verify the updates
    const [users] = await connection.execute(
      'SELECT id, email, role, password FROM users WHERE email LIKE "%example.com"'
    );
    
    console.log('\nVerified user accounts:');
    console.table(users.map(user => ({
      id: user.id,
      email: user.email,
      role: user.role,
      password: user.password
    })));
    
  } catch (error) {
    console.error('Error fixing passwords:', error);
  } finally {
    // Close the connection
    await connection.end();
    console.log('Database connection closed');
  }
}

// Run the function
fixPassword();