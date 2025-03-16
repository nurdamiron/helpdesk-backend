// src/index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();
const pool = require('./config/database');

// Импорт маршрутов
const ticketRoutes = require('./routes/ticketRoutes');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const requesterRoutes = require('./routes/requesterRoutes');
const app = express();

// Конфигурация CORS
const whitelist = [
  'http://localhost:5000',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3030',
  'https://helpdesk-ten-omega.vercel.app',
  'https://helpdesk-client-iota.vercel.app',
  'https://helpdesk-admin-three.vercel.app'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || whitelist.includes(origin)) {
      callback(null, true);
    } else {
      console.log('Заблокирован источник:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: '*',
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 86400
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Создание и настройка папки для загрузок
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Безопасные заголовки
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  next();
});

// Логгер запросов
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const { method, url, headers } = req;
  const sanitizedBody = { ...req.body };
  if (sanitizedBody.password) {
    sanitizedBody.password = '[СКРЫТО]';
  }
  console.log('=================================');
  console.log(`[${timestamp}] ${method} ${url}`);
  console.log('Заголовки:', {
    origin: headers.origin,
    'user-agent': headers['user-agent'],
    'content-type': headers['content-type']
  });
  console.log('Тело запроса:', sanitizedBody);
  req.requestTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - req.requestTime;
    console.log(`[${timestamp}] ${method} ${url} выполнен за ${duration}ms`);
    console.log('=================================');
  });
  next();
};

app.use(requestLogger);

// Подключение маршрутов
app.use('/api/tickets', ticketRoutes);
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/requesters', requesterRoutes);

// Корневой endpoint с информацией об API
app.get('/', (req, res) => {
  res.json({
    status: 'API is running',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: {
        login: '/api/auth/login',
        register: '/api/auth/register',
        me: '/api/auth/me',
        users: '/api/auth/users'
      },
      tickets: {
        list: '/api/tickets',
        details: '/api/tickets/:id',
        create: '/api/tickets',
        update: '/api/tickets/:id',
        delete: '/api/tickets/:id',
        addMessage: '/api/tickets/:id/messages',
        addAttachment: '/api/tickets/:id/attachments'
      },
      users: {
        list: '/api/users',
        details: '/api/users/:id',
        create: '/api/users',
        update: '/api/users/:id',
        delete: '/api/users/:id'
      }
    }
  });
});

// Проверка здоровья системы
app.get('/health', async (req, res) => {
  try {
    // Проверка подключения к базе данных
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
        error: 'Файл слишком большой',
        message: 'Размер файла не может превышать 10MB'
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
      users: '/api/users',
      tickets: '/api/tickets',
      health: '/health'
    }
  });
});

// Установка порта и запуск сервера
const PORT = process.env.PORT || 5000;

// Проверка соединения с базой данных перед запуском сервера
pool.testConnection().then(isConnected => {
  if (!isConnected) {
    console.error('ОШИБКА: Не удалось подключиться к базе данных. Проверьте настройки.');
    process.exit(1);
  }
  
  app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Окружение: ${process.env.NODE_ENV}`);
    console.log(`Время: ${new Date().toISOString()}`);
  });
});

// Обработчики глобальных ошибок
process.on('unhandledRejection', (error) => {
  console.error('Необработанное отклонение Promise:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Необработанное исключение:', error);
  // Даем время на логирование ошибки перед выходом
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

module.exports = app;