// debug-auth.js
require('dotenv').config();
const mysql = require('mysql2/promise');

async function debugAuth() {
  console.log('Debugging auth issues...');
  
  // Create a connection directly
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('Connected to database');
    
    // Get the exact user record we're having issues with
    const [users] = await connection.execute(
      'SELECT * FROM users WHERE email = ?',
      ['moderator@example.com']
    );
    
    if (users.length === 0) {
      console.log('User not found!');
      return;
    }
    
    const user = users[0];
    
    // Show all user data
    console.log('User record:');
    console.log(JSON.stringify(user, null, 2));
    
    // Test password comparison directly
    const testPassword = 'password';
    console.log(`\nComparing passwords:`);
    console.log(`User password in DB: "${user.password}"`);
    console.log(`Test password: "${testPassword}"`);
    console.log(`Are they equal? ${user.password === testPassword}`);
    console.log(`Password length in DB: ${user.password.length}`);
    console.log(`Test password length: ${testPassword.length}`);
    
    // Check for hidden characters or encoding issues
    console.log('\nCharacter codes in DB password:');
    for (let i = 0; i < user.password.length; i++) {
      console.log(`Position ${i}: ${user.password.charCodeAt(i)} (${user.password[i]})`);
    }
    
    console.log('\nCharacter codes in test password:');
    for (let i = 0; i < testPassword.length; i++) {
      console.log(`Position ${i}: ${testPassword.charCodeAt(i)} (${testPassword[i]})`);
    }
    
    // Update with explicit string to ensure no encoding issues
    console.log('\nUpdating password with explicit string...');
    await connection.execute(
      'UPDATE users SET password = ? WHERE email = ?',
      ['password', 'moderator@example.com']
    );
    
    // Verify update
    const [updatedUsers] = await connection.execute(
      'SELECT id, email, password FROM users WHERE email = ?',
      ['moderator@example.com']
    );
    
    console.log('\nAfter update:');
    console.log(JSON.stringify(updatedUsers[0], null, 2));
    
  } catch (error) {
    console.error('Error debugging auth:', error);
  } finally {
    // Close the connection
    await connection.end();
    console.log('Database connection closed');
  }
}

// Run the function
debugAuth();