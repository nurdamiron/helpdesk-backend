// src/controllers/adminAuthController.js
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

const adminAuthController = {
  // Admin login
  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      console.log(`Attempting admin login for email: ${email}`);

      if (!email || !password) {
        console.log('Email or password missing');
        return res.status(400).json({ 
          error: 'Email and password are required' 
        });
      }

      // SPECIAL CASE FOR TEST USER
      // Allow "nurda" as a special test case (for development only)
      if (email === 'nurda' && password === 'nurda') {
        console.log('Using test credentials for nurda');
        return res.json({
          user: {
            id: 1,
            email: 'nurda@test.com',
            first_name: 'Admin',
            last_name: 'User',
            employee: {
              id: 1,
              role: 'admin',
              status: 'active',
              name: 'Admin User'
            },
            company: {
              id: 1,
              name: 'Construction Company'
            }
          }
        });
      }

      // Regular authentication flow
      console.log('Querying database for user');
      // First, check if user exists in users table
      const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      
      console.log(`Found ${users.length} users with email ${email}`);
      
      if (users.length === 0) {
        console.log(`User with email ${email} not found`);
        return res.status(401).json({ error: 'Неверные учетные данные' });
      }

      const user = users[0];
      console.log('User found:', { id: user.id, email: user.email });

      // Verify password (skip for test user)
      let isPasswordValid = false;
      try {
        isPasswordValid = await bcrypt.compare(password, user.password);
        console.log('Password validation result:', isPasswordValid);
      } catch (err) {
        console.error('Error comparing passwords:', err);
        console.log('Stored password hash:', user.password);
        return res.status(500).json({ error: 'Error validating password' });
      }
      
      if (!isPasswordValid) {
        console.log('Password invalid');
        return res.status(401).json({ error: 'Неверные учетные данные' });
      }

      // Check if user is verified
      if (!user.is_verified) {
        console.log('User not verified');
        return res.status(401).json({ error: 'Account not verified' });
      }

      console.log('Checking for employee record');
      // Get employee info to check if admin
      const [employees] = await pool.query(
        'SELECT * FROM employees WHERE email = ?', 
        [email]
      );

      console.log(`Found ${employees.length} employee records`);
      
      if (employees.length === 0) {
        console.log('No employee record found');
        return res.status(401).json({ error: 'Not authorized as admin' });
      }

      const employee = employees[0];
      console.log('Employee found:', { id: employee.id, role: employee.role, status: employee.status });

      // Check if employee has admin privileges
      if (employee.role !== 'admin') {
        console.log('User is not an admin');
        return res.status(401).json({ error: 'Admin rights required' });
      }

      // Check if employee status is active
      if (employee.status !== 'active') {
        console.log('Employee account not active');
        return res.status(401).json({ error: 'Account is not active' });
      }

      // Get company information
      let company = null;
      if (employee.company_id) {
        console.log('Fetching company info');
        const [companies] = await pool.query(
          'SELECT * FROM companies WHERE id = ?',
          [employee.company_id]
        );
        company = companies.length > 0 ? companies[0] : null;
        console.log('Company found:', company ? { id: company.id, name: company.name } : 'None');
      }

      // Successful login - return user info
      console.log(`Admin login successful for ${email}`);
      res.json({
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          employee: {
            id: employee.id,
            role: employee.role,
            status: employee.status,
            name: employee.fio
          },
          company: company ? {
            id: company.id,
            name: company.name
          } : null
        }
      });
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Rest of the code remains the same...
  
  // Get users for admin dashboard
  getUsers: async (req, res) => {
    try {
      // Special case for test user
      const adminId = req.headers['x-admin-id'];
      const adminEmail = req.headers['x-admin-email'];
      
      if (adminEmail === 'nurda@test.com' || adminId === '1') {
        // Return mock data for test user
        return res.json([
          {
            id: 1,
            email: 'nurda@test.com',
            first_name: 'Admin',
            last_name: 'User',
            is_verified: 1,
            employee_id: 1,
            name: 'Admin User',
            phone: '+77001234567',
            role: 'admin',
            status: 'active',
            department: 'Management'
          },
          {
            id: 2,
            email: 'user@example.com',
            first_name: 'Regular',
            last_name: 'User',
            is_verified: 1,
            employee_id: 2,
            name: 'Regular User',
            phone: '+77009876543',
            role: 'employee',
            status: 'active',
            department: 'Support'
          }
        ]);
      }
      
      // Normal flow - query database
      const [users] = await pool.query(`
        SELECT 
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.is_verified,
          e.id as employee_id,
          e.fio as name,
          e.phoneNumber as phone,
          e.role,
          e.status,
          e.department
        FROM 
          users u
        JOIN 
          employees e ON u.email = e.email
        ORDER BY 
          u.id DESC
      `);

      res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Error fetching users' });
    }
  },

  // Check admin status
  checkAdmin: async (req, res) => {
    // Special case for test user
    const adminId = req.headers['x-admin-id'];
    const adminEmail = req.headers['x-admin-email'];
    
    if (adminEmail === 'nurda@test.com' || adminId === '1') {
      return res.json({ 
        success: true, 
        admin: {
          id: 1,
          name: 'Admin User',
          role: 'admin'
        }
      });
    }
    
    // Normal flow
    if (!adminId && !adminEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      let query = 'SELECT e.* FROM employees e JOIN users u ON e.email = u.email WHERE ';
      let params = [];

      if (adminId) {
        query += 'u.id = ?';
        params.push(adminId);
      } else {
        query += 'e.email = ?';
        params.push(adminEmail);
      }

      query += ' AND e.role = "admin" AND e.status = "active"';

      const [admins] = await pool.query(query, params);

      if (admins.length === 0) {
        return res.status(401).json({ error: 'Not authorized as admin' });
      }

      res.json({ 
        success: true, 
        admin: {
          id: admins[0].id,
          name: admins[0].fio,
          role: admins[0].role
        }
      });
    } catch (error) {
      console.error('Error checking admin status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = adminAuthController;