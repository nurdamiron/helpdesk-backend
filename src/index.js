const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const WebSocket = require('ws');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const orderRoutes = require('./routes/orderRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const customerRoutes = require('./routes/customerRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const companyRoutes = require('./routes/companyRoutes');

// Initialize express app
const app = express();

// CORS Configuration -- Оставляем оригинальные настройки
const whitelist = [
  'http://localhost:3000',
  'http://localhost:3030',
  'https://biz360-sepia.vercel.app',
  'https://biz360.vercel.app',
  'https://helpdesk-ten-omega.vercel.app'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || whitelist.includes(origin)) {
      callback(null, true);
    } else {
      console.log('Blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'Access-Control-Allow-Headers',
    'Upgrade',
    'Sec-WebSocket-Key',
    'Sec-WebSocket-Version'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 86400
};

// Middleware Setup
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Setup uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// Security Headers
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Request Logger
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const { method, url, headers } = req;
  const sanitizedBody = { ...req.body };
  
  if (sanitizedBody.password) {
    sanitizedBody.password = '[HIDDEN]';
  }
  
  console.log('=================================');
  console.log(`[${timestamp}] ${method} ${url}`);
  console.log('Headers:', {
    origin: headers.origin,
    'user-agent': headers['user-agent'],
    'content-type': headers['content-type']
  });
  console.log('Body:', sanitizedBody);
  
  req.requestTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - req.requestTime;
    console.log(`[${timestamp}] ${method} ${url} completed in ${duration}ms`);
    console.log('=================================');
  });
  
  next();
};

app.use(requestLogger);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/product', productRoutes);

// Здесь не трогаем — просто используем employeeRoutes без auth
app.use('/api/employees', employeeRoutes);

app.use('/api/orders', orderRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/companies', companyRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'API is running',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: {
        register: '/api/auth/register',
        login: '/api/auth/login',
        verifyEmail: '/api/auth/verify-email/:token',
        forgotPassword: '/api/auth/forgot-password',
        resetPassword: '/api/auth/reset-password',
        me: '/api/auth/me',
        logout: '/api/auth/logout',
        refreshToken: '/api/auth/refresh-token'
      },
      companies: {
        list: '/api/companies',
        checkBin: '/api/companies/check-bin/:bin',
        search: '/api/companies/search',
        create: '/api/companies',
      },
      product: {
        list: '/api/product/list',
        details: '/api/product/details/:id',
        search: '/api/product/search',
        create: '/api/product',
        update: '/api/product/:id',
        delete: '/api/product/:id'
      },
      employees: {
        list: '/api/employees',
        details: '/api/employees/:id',
        create: '/api/employees',
        update: '/api/employees/:id',
        delete: '/api/employees/:id'
      },
      customers: {
        list: '/api/customers?search=...',
        details: '/api/customers/:id',
        create: '/api/customers',
        update: '/api/customers/:id',
        delete: '/api/customers/:id'
      },
      suppliers: {
        list: '/api/suppliers?search=...',
        details: '/api/suppliers/:id',
        create: '/api/suppliers',
        update: '/api/suppliers/:id',
        delete: '/api/suppliers/:id'
      }
    }
  });
});

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  });
});

// Error Handlers
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        status: 'error',
        error: 'File too large',
        message: 'File size cannot exceed 5MB'
      });
    }
  }
  next(error);
});

// Global Error Handler
app.use((error, req, res, next) => {
  console.error('Error:', {
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    origin: req.headers.origin,
    error: {
      message: error.message,
      status: error.status,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }
  });

  const statusCode = error.status || error.statusCode || 500;
  const errorResponse = {
    status: 'error',
    message: error.message || 'Internal Server Error',
    path: req.path,
    timestamp: new Date().toISOString()
  };

  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = error.stack;
    errorResponse.details = error.details;
  }

  res.status(statusCode).json(errorResponse);
});

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
    availableEndpoints: {
      auth: '/api/auth',
      product: '/api/product',
      employees: '/api/employees',
      health: '/health'
    }
  });
});

// Server Setup
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log('=================================');
  console.log(`Server started on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('=================================');
  console.log('Allowed origins:');
  whitelist.forEach(origin => console.log(`- ${origin}`));
  console.log('=================================');
});

// WebSocket Setup -- Оставляем оригинальные настройки
const wss = new WebSocket.Server({ 
  server,
  path: '/ws' // Add explicit path
});

const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('New client connected');

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

const broadcastUpdate = (data) => {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

module.exports = { app, broadcastUpdate };
