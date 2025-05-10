const chatController = require('../../src/controllers/chatController');
const pool = require('../../src/services/pool');
const wsNotificationService = require('../../src/services/wsNotificationService');

// Мокаем модули
jest.mock('../../src/services/pool', () => ({
  query: jest.fn(),
  getConnection: jest.fn()
}));

jest.mock('../../src/services/wsNotificationService', () => ({
  handleWebSocketNotification: jest.fn(),
  sendTypingIndicator: jest.fn(),
  sendStatusUpdate: jest.fn()
}));

describe('Chat Controller Tests', () => {
  let req;
  let res;
  
  beforeEach(() => {
    // Сбрасываем моки перед каждым тестом
    jest.clearAllMocks();
    
    // Создаем моки для объектов запроса и ответа
    req = {
      body: {},
      params: {},
      headers: {},
      user: {
        id: 1,
        role: 'staff'
      }
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });
  
  describe('getChatHistory()', () => {
    it('должен получать историю чата для заявки', async () => {
      // Подготовка параметров запроса
      req.params.ticketId = '123';
      
      // Мокаем ответ базы данных
      const mockMessages = [
        {
          id: 1,
          ticket_id: 123,
          content: 'Тестовое сообщение 1',
          created_at: new Date().toISOString(),
          sender_type: 'requester',
          sender_id: 456,
          status: 'delivered'
        },
        {
          id: 2,
          ticket_id: 123,
          content: 'Тестовое сообщение 2',
          created_at: new Date().toISOString(),
          sender_type: 'staff',
          sender_id: 789,
          status: 'read'
        }
      ];
      
      pool.query
        .mockResolvedValueOnce([[]]) // Мок для запроса проверки заявки
        .mockResolvedValueOnce([mockMessages]); // Мок для запроса сообщений
      
      // Вызов тестируемого метода
      await chatController.getChatHistory(req, res);
      
      // Проверка результатов
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM messages WHERE ticket_id = ?'),
        [123]
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          messages: mockMessages
        })
      );
    });
    
    it('должен возвращать ошибку, если заявка не найдена', async () => {
      // Подготовка параметров запроса
      req.params.ticketId = '999';
      
      // Мокаем ответ базы данных - заявка не найдена
      pool.query
        .mockResolvedValueOnce([[]]) // Проверка существования заявки
        .mockResolvedValueOnce([[]]); // Пустая история сообщений
      
      // Вызов тестируемого метода
      await chatController.getChatHistory(req, res);
      
      // Проверка результатов - должен вернуть пустой массив сообщений
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          messages: []
        })
      );
    });
  });
  
  describe('sendMessage()', () => {
    it('должен отправлять новое сообщение', async () => {
      // Подготовка параметров и тела запроса
      req.params.ticketId = '123';
      req.body = {
        content: 'Новое тестовое сообщение',
        attachments: []
      };
      
      // Мокаем ответы базы данных
      const mockTicket = { id: 123, requester_id: 456, subject: 'Тестовая заявка' };
      const mockInsertResult = { insertId: 789 };
      
      pool.query
        .mockResolvedValueOnce([[mockTicket]]) // Получение информации о заявке
        .mockResolvedValueOnce([mockInsertResult]) // Вставка сообщения
        .mockResolvedValueOnce([[{ id: 789, content: 'Новое тестовое сообщение' }]]) // Получение данных сообщения
        .mockResolvedValueOnce([[]]); // Пустые вложения
      
      // Вызов тестируемого метода
      await chatController.sendMessage(req, res);
      
      // Проверка результатов
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO messages'),
        expect.arrayContaining([123, 'Новое тестовое сообщение'])
      );
      
      expect(wsNotificationService.handleWebSocketNotification).toHaveBeenCalled();
      
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          message: expect.objectContaining({
            id: 789,
            content: 'Новое тестовое сообщение'
          })
        })
      );
    });
    
    it('должен возвращать ошибку при отсутствии содержания сообщения', async () => {
      // Подготовка параметров и тела запроса без содержания
      req.params.ticketId = '123';
      req.body = {
        attachments: []
      };
      
      // Вызов тестируемого метода
      await chatController.sendMessage(req, res);
      
      // Проверка результатов
      expect(pool.query).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: expect.stringContaining('содержание сообщения')
        })
      );
    });
    
    it('должен возвращать ошибку, если заявка не найдена', async () => {
      // Подготовка параметров и тела запроса
      req.params.ticketId = '999';
      req.body = {
        content: 'Новое тестовое сообщение'
      };
      
      // Мокаем ответ базы данных - заявка не найдена
      pool.query.mockResolvedValueOnce([[]]);
      
      // Вызов тестируемого метода
      await chatController.sendMessage(req, res);
      
      // Проверка результатов
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: expect.stringContaining('не найдена')
        })
      );
    });
  });
  
  describe('updateMessageStatus()', () => {
    it('должен обновлять статус сообщения', async () => {
      // Подготовка параметров и тела запроса
      req.params.messageId = '123';
      req.body = {
        status: 'read'
      };
      
      // Мокаем ответы базы данных
      const mockMessage = {
        id: 123,
        ticket_id: 456,
        content: 'Тестовое сообщение',
        sender_type: 'requester',
        sender_id: 789
      };
      
      pool.query
        .mockResolvedValueOnce([[mockMessage]]) // Получение информации о сообщении
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Обновление статуса
      
      // Вызов тестируемого метода
      await chatController.updateMessageStatus(req, res);
      
      // Проверка результатов
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE messages SET status = ?'),
        expect.arrayContaining(['read', 123])
      );
      
      expect(wsNotificationService.sendStatusUpdate).toHaveBeenCalled();
      
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          message: 'Статус сообщения обновлен'
        })
      );
    });
    
    it('должен возвращать ошибку, если сообщение не найдено', async () => {
      // Подготовка параметров и тела запроса
      req.params.messageId = '999';
      req.body = {
        status: 'read'
      };
      
      // Мокаем ответ базы данных - сообщение не найдено
      pool.query.mockResolvedValueOnce([[]]);
      
      // Вызов тестируемого метода
      await chatController.updateMessageStatus(req, res);
      
      // Проверка результатов
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: expect.stringContaining('не найдено')
        })
      );
    });
  });
  
  describe('sendTypingIndicator()', () => {
    it('должен отправлять индикатор набора текста', async () => {
      // Подготовка параметров и тела запроса
      req.params.ticketId = '123';
      req.body = {
        isTyping: true
      };
      
      // Мокаем ответ базы данных - заявка существует
      pool.query.mockResolvedValueOnce([[{ id: 123 }]]);
      
      // Мокаем успешную отправку индикатора
      wsNotificationService.sendTypingIndicator.mockResolvedValueOnce(true);
      
      // Вызов тестируемого метода
      await chatController.sendTypingIndicator(req, res);
      
      // Проверка результатов
      expect(wsNotificationService.sendTypingIndicator).toHaveBeenCalledWith(
        123,
        1,
        'staff',
        true
      );
      
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success'
        })
      );
    });
    
    it('должен возвращать ошибку, если заявка не найдена', async () => {
      // Подготовка параметров и тела запроса
      req.params.ticketId = '999';
      req.body = {
        isTyping: true
      };
      
      // Мокаем ответ базы данных - заявка не найдена
      pool.query.mockResolvedValueOnce([[]]);
      
      // Вызов тестируемого метода
      await chatController.sendTypingIndicator(req, res);
      
      // Проверка результатов
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: expect.stringContaining('не найдена')
        })
      );
    });
  });
}); 