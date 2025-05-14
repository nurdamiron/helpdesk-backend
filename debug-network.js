// debug-network.js
// This script listens for incoming requests to debug what's happening

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Apply middleware
app.use(cors());
app.use(bodyParser.json());

// Middleware to log all requests
app.use((req, res, next) => {
  const requestTime = new Date().toISOString();
  
  console.log(`\n==== REQUEST ${requestTime} ====`);
  console.log(`${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  // Log body but hide passwords
  const safeBody = { ...req.body };
  if (safeBody.password) {
    safeBody.password = '****';
  }
  console.log('Body:', JSON.stringify(safeBody, null, 2));
  
  // Capture response to log it
  const originalSend = res.send;
  res.send = function(body) {
    const responseTime = new Date().toISOString();
    console.log(`\n==== RESPONSE ${responseTime} ====`);
    console.log(`Status: ${res.statusCode}`);
    
    let safeBody = body;
    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        if (parsed.token) {
          parsed.token = parsed.token.substring(0, 20) + '...';
        }
        safeBody = JSON.stringify(parsed);
      } catch (e) {
        // Not JSON, continue
      }
    }
    
    console.log('Body:', safeBody);
    console.log('==== END OF REQUEST/RESPONSE ====\n');
    
    originalSend.apply(res, arguments);
  };
  
  next();
});

// Mock login endpoint that will respond correctly to any credentials
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  console.log('Received login attempt:', {
    email, 
    password,
    passwordHash: password ? Buffer.from(password).toString('hex') : null
  });
  
  // Return success response no matter what
  res.json({
    status: 'success',
    token: 'mock-token-debug-12345',
    user: {
      id: 999,
      email: email || 'unknown@example.com',
      first_name: 'Debug',
      last_name: 'User',
      role: 'admin'
    }
  });
});

// Start the server
const PORT = 5003;
app.listen(PORT, () => {
  console.log(`Debug server running on port ${PORT}`);
  console.log(`Try: curl -X POST http://localhost:${PORT}/api/auth/login -H "Content-Type: application/json" -d '{"email":"test@example.com","password":"test123"}'`);
  console.log(`Configure frontend to use http://localhost:${PORT}/api temporarily for testing`);
});