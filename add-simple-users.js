// add-simple-users.js - auto-generated
const pool = require('./src/services/pool');

// Simple test users that should work with any frontend
const testUsers = [
  { email: 'simple-admin@example.com', password: '123456', role: 'admin', first_name: 'Admin', last_name: 'User' },
  { email: 'simple-support@example.com', password: '123456', role: 'support', first_name: 'Support', last_name: 'Staff' },
  { email: 'simple-user@example.com', password: '123456', role: 'user', first_name: 'Regular', last_name: 'User' }
];

async function addSimpleUsers() {
  console.log('Adding simplified test users...');
  
  try {
    for (const user of testUsers) {
      // Check if user exists
      const [existingUsers] = await pool.query('SELECT * FROM users WHERE email = ?', [user.email]);
      
      if (existingUsers.length > 0) {
        console.log(`User ${user.email} already exists`);
        continue;
      }
      
      // Add new user
      const [result] = await pool.query(
        'INSERT INTO users (email, password, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)',
        [user.email, user.password, user.first_name, user.last_name, user.role]
      );
      
      console.log(`Added user ${user.email} with role ${user.role}, simple password: "123456"`);
    }
    
    console.log('\nList of simple test users:');
    const [allUsers] = await pool.query('SELECT id, email, role, password FROM users WHERE email LIKE "simple-%"');
    console.table(allUsers);
    
  } catch (error) {
    console.error('Error adding simple users:', error);
  } finally {
    await pool.end();
  }
}

addSimpleUsers();