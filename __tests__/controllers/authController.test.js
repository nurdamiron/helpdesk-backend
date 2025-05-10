const authController = require('../../src/controllers/authController');
const pool = require('../../src/services/pool');

// Мокаем модуль pool
jest.mock('../../src/services/pool', () => ({
  query: jest.fn(),
  getConnection: jest.fn()
}));

describe('Auth Controller Tests', () => {
  let req;
  let res;
  
  beforeEach(() => {
    // Сбрасываем моки перед каждым тестом
    jest.clearAllMocks();
    
    // Создаем моки для объектов запроса и ответа
    req = {
      body: {},
      headers: {}
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });
  
  describe('register()', () => {
    it('должен зарегистрировать нового пользователя', async () => {
      // Подготовка данных запроса
      req.body = {
        email: 'test@example.com',
        password: 'password123',
        first_name: 'John',
        last_name: 'Doe'
      };
      
      // Мокаем ответы базы данных
      pool.query
        .mockResolvedValueOnce([[]])  // Проверка существования пользователя
        .mockResolvedValueOnce([{ insertId: 1 }]);  // Вставка пользователя
      
      // Вызов тестируемого метода
      await authController.register(req, res);
      
      // Проверка результатов
      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          user: expect.objectContaining({
            id: 1,
            email: 'test@example.com'
          })
        })
      );
    });
    
    it('должен вернуть ошибку при отсутствии обязательных полей', async () => {
      // Подготовка данных запроса с отсутствующими полями
      req.body = {
        email: 'test@example.com'
      };
      
      // Вызов тестируемого метода
      await authController.register(req, res);
      
      // Проверка результатов
      expect(pool.query).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: expect.stringContaining('обязательны')
        })
      );
    });
    
    it('должен вернуть ошибку, если пользователь уже существует', async () => {
      // Подготовка данных запроса
      req.body = {
        email: 'existing@example.com',
        password: 'password123'
      };
      
      // Мокаем ответ базы данных с существующим пользователем
      pool.query.mockResolvedValueOnce([
        [{ id: 1, email: 'existing@example.com' }]
      ]);
      
      // Вызов тестируемого метода
      await authController.register(req, res);
      
      // Проверка результатов
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: expect.stringContaining('уже существует')
        })
      );
    });
  });
  
  describe('login()', () => {
    it('должен успешно выполнить вход пользователя', async () => {
      // Подготовка данных запроса
      req.body = {
        email: 'test@example.com',
        password: 'password123'
      };
      
      // Мокаем ответ базы данных с пользователем
      pool.query.mockResolvedValueOnce([
        [{
          id: 1,
          email: 'test@example.com',
          password: 'password123',
          first_name: 'John',
          last_name: 'Doe',
          role: 'user'
        }]
      ]);
      
      // Вызов тестируемого метода
      await authController.login(req, res);
      
      // Проверка результатов
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          user: expect.objectContaining({
            id: 1,
            email: 'test@example.com',
            role: 'user'
          })
        })
      );
    });
    
    it('должен вернуть ошибку при неверном пароле', async () => {
      // Подготовка данных запроса с неверным паролем
      req.body = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };
      
      // Мокаем ответ базы данных с пользователем
      pool.query.mockResolvedValueOnce([
        [{
          id: 1,
          email: 'test@example.com',
          password: 'password123'
        }]
      ]);
      
      // Вызов тестируемого метода
      await authController.login(req, res);
      
      // Проверка результатов
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: expect.stringContaining('Неверные учетные данные')
        })
      );
    });
    
    it('должен вернуть ошибку, если пользователь не найден', async () => {
      // Подготовка данных запроса
      req.body = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };
      
      // Мокаем ответ базы данных без пользователя
      pool.query.mockResolvedValueOnce([[]]);
      
      // Вызов тестируемого метода
      await authController.login(req, res);
      
      // Проверка результатов
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: expect.stringContaining('Неверные учетные данные')
        })
      );
    });
  });
  
  describe('getMe()', () => {
    it('должен получить данные текущего пользователя', async () => {
      // Подготовка заголовков запроса
      req.headers['x-user-id'] = '1';
      
      // Мокаем ответ базы данных с пользователем
      pool.query.mockResolvedValueOnce([
        [{
          id: 1,
          email: 'test@example.com',
          first_name: 'John',
          last_name: 'Doe',
          role: 'user'
        }]
      ]);
      
      // Вызов тестируемого метода
      await authController.getMe(req, res);
      
      // Проверка результатов
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          user: expect.objectContaining({
            id: 1,
            email: 'test@example.com'
          })
        })
      );
    });
    
    it('должен вернуть ошибку, если пользователь не авторизован', async () => {
      // Запрос без заголовка x-user-id
      
      // Вызов тестируемого метода
      await authController.getMe(req, res);
      
      // Проверка результатов
      expect(pool.query).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: expect.stringContaining('Необходима аутентификация')
        })
      );
    });
  });
  
  describe('logout()', () => {
    it('должен успешно выполнить выход пользователя', async () => {
      // Вызов тестируемого метода
      await authController.logout(req, res);
      
      // Проверка результатов
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          message: expect.stringContaining('Выход выполнен успешно')
        })
      );
    });
  });
}); 