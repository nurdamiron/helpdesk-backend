// src/index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();
const pool = require('./config/database');

// Импорт маршрутов
const authRoutes = require('./routes/authRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const companyRoutes = require('./routes/companyRoutes');
const chatRoutes = require('./routes/chatRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const requesterRoutes = require('./routes/requesterRoutes');

const app = express();

// CORS Configuration
const whitelist = [
  'http://localhost:5000',
  'http://localhost:3000',
  'http://localhost:3030',
  'https://biz360-sepia.vercel.app',
  'https://biz360.vercel.app',
  'https://helpdesk-ten-omega.vercel.app',
  'https://helpdesk-client-iota.vercel.app',
  'https://helpdesk-admin.vercel.app'
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

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Настройка папки для загрузок
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// Безопасные заголовки
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Middleware для логирования запросов
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

// Подключение маршрутов
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminAuthRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/requesters', requesterRoutes);

// Корневой endpoint
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
      admin: {
        login: '/api/admin/login',
        users: '/api/admin/users',
        check: '/api/admin/check'
      },
      companies: {
        list: '/api/companies',
        checkBin: '/api/companies/check-bin/:bin',
        search: '/api/companies/search',
        create: '/api/companies'
      },
      employees: {
        list: '/api/employees',
        details: '/api/employees/:id',
        create: '/api/employees',
        update: '/api/employees/:id',
        delete: '/api/employees/:id'
      },
      tickets: {
        list: '/api/tickets',
        detail: '/api/tickets/:id',
        create: '/api/tickets',
        update: '/api/tickets/:id',
        delete: '/api/tickets/:id' 
      }
    }
  });
});

// Health Check endpoint
app.get('/health', async (req, res) => {
  try {
    // Попробуем выполнить простой запрос к базе данных
    const connection = await pool.getConnection();
    connection.release();
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      uptime: process.uptime(),
      version: '1.0.0'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Обработчик ошибок для Multer
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

// Глобальный обработчик ошибок
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

// Обработчик 404
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
    availableEndpoints: {
      auth: '/api/auth',
      admin: '/api/admin',
      tickets: '/api/tickets',
      employees: '/api/employees',
      health: '/health'
    }
  });
});

module.exports = app;