// fix-user-roles.js
const pool = require('./src/services/pool');

// Users to update
const usersToUpdate = [
  { email: 'support@example.com', role: 'support' },
  { email: 'manager@example.com', role: 'manager' },
  { email: 'moderator@example.com', role: 'support' }
];

async function fixUserRoles() {
  console.log('Fixing user roles...');

  try {
    for (const user of usersToUpdate) {
      // Update user role
      const [result] = await pool.query(
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
    const [allUsers] = await pool.query('SELECT id, email, role FROM users');
    console.log('\nAll users in the database after fix:');
    console.table(allUsers);
  } catch (error) {
    console.error('Error fixing user roles:', error);
  } finally {
    // Close the connection pool
    await pool.end();
  }
}

// Run the function
fixUserRoles();