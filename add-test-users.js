// add-test-users.js
const pool = require('./src/services/pool');

// Test users for different roles
const testUsers = [
  {
    email: 'admin@example.com',
    password: 'password',
    first_name: 'Admin',
    last_name: 'User',
    role: 'admin'
  },
  {
    email: 'support@example.com',
    password: 'password',
    first_name: 'Support',
    last_name: 'Staff',
    role: 'support'
  },
  {
    email: 'manager@example.com',
    password: 'password',
    first_name: 'Manager',
    last_name: 'User',
    role: 'manager'
  },
  {
    email: 'user@example.com',
    password: 'password',
    first_name: 'Regular',
    last_name: 'User',
    role: 'user'
  },
  {
    email: 'moderator@example.com',
    password: 'password',
    first_name: 'Moderator',
    last_name: 'User',
    role: 'support' // moderator role maps to support
  }
];

async function addTestUsers() {
  console.log('Adding test users to the database...');

  try {
    // First check if users already exist
    for (const user of testUsers) {
      const [existingUsers] = await pool.query('SELECT * FROM users WHERE email = ?', [user.email]);
      
      if (existingUsers.length > 0) {
        console.log(`User ${user.email} already exists with role: ${existingUsers[0].role}`);
        continue;
      }
      
      // Insert new user
      const [result] = await pool.query(
        'INSERT INTO users (email, password, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)',
        [user.email, user.password, user.first_name, user.last_name, user.role]
      );
      
      console.log(`Added user: ${user.email} with role: ${user.role}, ID: ${result.insertId}`);
    }
    
    console.log('Test users setup complete!');
    
    // List all users
    const [allUsers] = await pool.query('SELECT id, email, role FROM users');
    console.log('\nAll users in the database:');
    console.table(allUsers);
  } catch (error) {
    console.error('Error adding test users:', error);
  } finally {
    // Close the connection pool
    await pool.end();
  }
}

// Run the function
addTestUsers();