// modify-auth-controller.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function modifyAuthController() {
  try {
    console.log('Modifying authentication controller to debug password issues...');
    
    // Read the current authController.js file
    const authControllerPath = path.join(__dirname, 'src', 'controllers', 'authController.js');
    const content = fs.readFileSync(authControllerPath, 'utf8');
    
    // Create a backup of the original file
    const backupPath = path.join(__dirname, 'src', 'controllers', 'authController.js.bak');
    fs.writeFileSync(backupPath, content);
    console.log(`Backup created at ${backupPath}`);
    
    // Modify the login method to add more debugging
    const updatedContent = content.replace(
      /\/\/ Проверка пароля напрямую\s+if \(user\.password !== password\) {/,
      `// Проверка пароля напрямую
      console.log('Password comparison:');
      console.log('From DB:', JSON.stringify(user.password));
      console.log('From request:', JSON.stringify(password));
      console.log('Length DB:', user.password.length);
      console.log('Length request:', password.length);
      console.log('Char codes DB:', [...user.password].map(c => c.charCodeAt(0)));
      console.log('Char codes request:', [...password].map(c => c.charCodeAt(0)));
      console.log('Trimmed comparison:', user.password.trim() === password.trim());
      
      // Try multiple variants of password comparison
      if (user.password !== password && 
          user.password !== password.trim() &&
          user.password.trim() !== password) {`
    );
    
    // Write the modified file
    fs.writeFileSync(authControllerPath, updatedContent);
    console.log('Authentication controller modified with extra debugging');
    
    // Now create a simple fix script to update all passwords
    const fixContent = `// add-simple-users.js - auto-generated
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
        console.log(\`User \${user.email} already exists\`);
        continue;
      }
      
      // Add new user
      const [result] = await pool.query(
        'INSERT INTO users (email, password, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)',
        [user.email, user.password, user.first_name, user.last_name, user.role]
      );
      
      console.log(\`Added user \${user.email} with role \${user.role}, simple password: "123456"\`);
    }
    
    console.log('\\nList of simple test users:');
    const [allUsers] = await pool.query('SELECT id, email, role, password FROM users WHERE email LIKE "simple-%"');
    console.table(allUsers);
    
  } catch (error) {
    console.error('Error adding simple users:', error);
  } finally {
    await pool.end();
  }
}

addSimpleUsers();`;
    
    // Write the simple fix script
    const fixScriptPath = path.join(__dirname, 'add-simple-users.js');
    fs.writeFileSync(fixScriptPath, fixContent);
    console.log(`Created simple user fix script at ${fixScriptPath}`);
    
  } catch (error) {
    console.error('Error modifying auth controller:', error);
  }
}

// Run the function
modifyAuthController();