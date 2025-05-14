// update-passwords.js
require('dotenv').config();
const mysql = require('mysql2/promise');

async function updatePasswords() {
  console.log('Updating passwords to match frontend expectations...');
  
  // Create a connection directly
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('Connected to database');
    
    // Update passwords to match what the frontend is sending
    const passwordUpdates = [
      { email: 'admin@example.com', password: 'admin123' },
      { email: 'moderator@example.com', password: 'moderator123' },
      { email: 'support@example.com', password: 'support123' },
      { email: 'manager@example.com', password: 'manager123' },
      { email: 'user@example.com', password: 'user123' }
    ];

    for (const update of passwordUpdates) {
      const [result] = await connection.execute(
        'UPDATE users SET password = ? WHERE email = ?',
        [update.password, update.email]
      );
      
      console.log(`Updated password for ${update.email} to "${update.password}" - Rows affected: ${result.affectedRows}`);
    }
    
    // Verify updates
    const [users] = await connection.execute(
      'SELECT id, email, role, password FROM users WHERE email IN (?, ?, ?, ?, ?)',
      ['admin@example.com', 'moderator@example.com', 'support@example.com', 'manager@example.com', 'user@example.com']
    );
    
    console.log('\nUpdated user accounts:');
    console.table(users.map(user => ({
      id: user.id,
      email: user.email,
      role: user.role,
      password: user.password
    })));
    
  } catch (error) {
    console.error('Error updating passwords:', error);
  } finally {
    // Close the connection
    await connection.end();
    console.log('Database connection closed');
  }
}

// Run the function
updatePasswords();