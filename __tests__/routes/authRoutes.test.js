const express = require('express');
const router = require('../../src/routes/authRoutes');
const authController = require('../../src/controllers/authController');

// Мокаем контроллер аутентификации
jest.mock('../../src/controllers/authController', () => ({
  login: jest.fn(),
  register: jest.fn(),
  getMe: jest.fn(),
  logout: jest.fn(),
  getUsers: jest.fn()
}));

// Мокаем middleware аутентификации
jest.mock('../../src/middleware/auth', () => 
  jest.fn((req, res, next) => next())
);

describe('Auth Routes Tests', () => {
  let app;
  
  beforeEach(() => {
    // Сбрасываем все моки перед каждым тестом
    jest.clearAllMocks();
    
    // Создаем тестовое приложение Express
    app = express();
    app.use(express.json());
    app.use('/api/auth', router);
  });
  
  describe('Route integration with controllers', () => {
    it('маршрут POST /login должен вызывать authController.login', () => {
      // Получаем маршрут для метода POST на /login
      const routes = app._router.stack
        .filter(layer => layer.name === 'router')
        .flatMap(layer => layer.handle.stack)
        .filter(layer => layer.route && layer.route.path === '/login' && layer.route.methods.post);
      
      // Проверяем, что маршрут существует
      expect(routes.length).toBe(1);
      
      // Проверяем, что контроллер.login добавлен как обработчик
      const handlers = routes[0].route.stack.map(layer => layer.handle);
      expect(handlers).toContain(authController.login);
    });
    
    it('маршрут POST /register должен вызывать authController.register', () => {
      // Получаем маршрут для метода POST на /register
      const routes = app._router.stack
        .filter(layer => layer.name === 'router')
        .flatMap(layer => layer.handle.stack)
        .filter(layer => layer.route && layer.route.path === '/register' && layer.route.methods.post);
      
      // Проверяем, что маршрут существует
      expect(routes.length).toBe(1);
      
      // Проверяем, что контроллер.register добавлен как обработчик
      const handlers = routes[0].route.stack.map(layer => layer.handle);
      expect(handlers).toContain(authController.register);
    });
    
    it('маршрут GET /me должен вызывать authController.getMe после аутентификации', () => {
      // Получаем маршрут для метода GET на /me
      const routes = app._router.stack
        .filter(layer => layer.name === 'router')
        .flatMap(layer => layer.handle.stack)
        .filter(layer => layer.route && layer.route.path === '/me' && layer.route.methods.get);
      
      // Проверяем, что маршрут существует
      expect(routes.length).toBe(1);
      
      // Проверяем, что в маршруте есть обработчик аутентификации
      // и обработчик контроллера
      const handlers = routes[0].route.stack.map(layer => layer.handle);
      expect(handlers).toHaveLength(2); // auth middleware + getMe
      expect(handlers[1]).toBe(authController.getMe);
    });
    
    it('маршрут POST /logout должен вызывать authController.logout после аутентификации', () => {
      // Получаем маршрут для метода POST на /logout
      const routes = app._router.stack
        .filter(layer => layer.name === 'router')
        .flatMap(layer => layer.handle.stack)
        .filter(layer => layer.route && layer.route.path === '/logout' && layer.route.methods.post);
      
      // Проверяем, что маршрут существует
      expect(routes.length).toBe(1);
      
      // Проверяем, что в маршруте есть обработчик аутентификации
      // и обработчик контроллера
      const handlers = routes[0].route.stack.map(layer => layer.handle);
      expect(handlers).toHaveLength(2); // auth middleware + logout
      expect(handlers[1]).toBe(authController.logout);
    });
    
    it('маршрут GET /users должен вызывать authController.getUsers после аутентификации', () => {
      // Получаем маршрут для метода GET на /users
      const routes = app._router.stack
        .filter(layer => layer.name === 'router')
        .flatMap(layer => layer.handle.stack)
        .filter(layer => layer.route && layer.route.path === '/users' && layer.route.methods.get);
      
      // Проверяем, что маршрут существует
      expect(routes.length).toBe(1);
      
      // Проверяем, что в маршруте есть обработчик аутентификации
      // и обработчик контроллера
      const handlers = routes[0].route.stack.map(layer => layer.handle);
      expect(handlers).toHaveLength(2); // auth middleware + getUsers
      expect(handlers[1]).toBe(authController.getUsers);
    });
  });
}); 