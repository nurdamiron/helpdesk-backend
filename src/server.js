// server.js
require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const app = require('./index');

const PORT = process.env.PORT || 5000;

// 1) Создаем http-сервер на базе вашего app (Express)
const server = http.createServer(app);

// 2) Запускаем сервер на нужном порту
server.listen(PORT, () => {
  console.log('=================================');
  console.log(`Server started on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('=================================');
});

// 3) Настраиваем WebSocket поверх того же http-сервера
const wss = new WebSocket.Server({
  server,
  path: '/ws',
});

const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('New WebSocket client connected');

  ws.on('close', () => {
    clients.delete(ws);
    console.log('WebSocket client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// 4) Функция для рассылки обновлений всем подключенным WebSocket-клиентам
const broadcastUpdate = (data) => {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

// 5) Обработчики событий процесса
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

// 6) Экспортируем сервер и функцию вещания, если потребуется
module.exports = { server, broadcastUpdate };
