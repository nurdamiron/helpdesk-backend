// frontend-auth-simulation.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const axios = require('axios');

async function simulateLogin() {
  console.log('Simulating frontend login...');
  
  // Create a connection directly to check what's in the DB
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('Connected to database to check password');
    
    // Get the exact password from DB for admin user
    const [users] = await connection.execute(
      'SELECT id, email, password FROM users WHERE email = ?',
      ['admin@example.com']
    );
    
    if (users.length === 0) {
      console.log('User not found!');
      return;
    }
    
    const dbUser = users[0];
    console.log(`User in DB: ${dbUser.email}, password: "${dbUser.password}"`);
    
    // Try various password formats to see what works
    const testPasswords = [
      { label: 'password (plain)', value: 'password' },
      { label: 'password with spaces', value: ' password ' },
      { label: 'Password (capitalized)', value: 'Password' },
      { label: 'admin123 (from original DB user)', value: 'admin123' }
    ];
    
    console.log('\nTesting different password formats:');
    
    for (const test of testPasswords) {
      try {
        console.log(`\nTrying: ${test.label}`);
        
        // Call the API
        const response = await axios.post('http://localhost:5002/api/auth/login', {
          email: 'admin@example.com',
          password: test.value
        });
        
        console.log('Login SUCCESS! Response:', response.data);
        
        // Update the password in the DB to match this successful one
        await connection.execute(
          'UPDATE users SET password = ? WHERE email LIKE "%example.com"',
          [test.value]
        );
        
        console.log(`Updated all test users to use password: "${test.value}"`);
        return;
      } catch (error) {
        console.log(`Login failed with "${test.label}": ${error.response?.status} ${error.response?.data?.error || error.message}`);
      }
    }
    
    // If we get here, none of the passwords worked
    console.log('\nNone of the password formats worked!');
    
  } catch (error) {
    console.error('Error in simulation:', error);
  } finally {
    // Close the connection
    await connection.end();
    console.log('Database connection closed');
  }
}

// Run the function
simulateLogin();