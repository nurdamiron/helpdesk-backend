// __tests__/services/webSocketManager.test.js
const WebSocketManager = require('../../src/services/WebSocketManager');
const WebSocket = require('ws');
const EventEmitter = require('events');

// Мокаем модуль ws
jest.mock('ws', () => {
  const EventEmitter = require('events');
  
  // Создаем мок для WebSocket.Server
  const MockServer = jest.fn().mockImplementation(() => {
    const server = new EventEmitter();
    server.on = jest.fn((event, callback) => {
      EventEmitter.prototype.on.call(server, event, callback);
      return server;
    });
    server.close = jest.fn();
    return server;
  });
  
  // Создаем мок для WebSocket объекта
  const MockWebSocket = function() {
    const ws = new EventEmitter();
    ws.send = jest.fn();
    ws.readyState = 1; // OPEN
    return ws;
  };
  
  return {
    Server: MockServer,
    OPEN: 1,
    CLOSED: 3,
    ...MockWebSocket
  };
});

describe('WebSocketManager Tests', () => {
  let wsManager;
  let mockHttpServer;
  let mockWsServer;
  let mockWs;
  let mockReq;
  
  beforeEach(() => {
    // Сбрасываем все моки перед каждым тестом
    jest.clearAllMocks();
    
    // Инициализируем объект WebSocketManager
    wsManager = require('../../src/services/WebSocketManager');
    
    // Создаем мок HTTP сервера
    mockHttpServer = new EventEmitter();
    
    // Запоминаем мок WebSocket.Server для дальнейшей проверки
    const WebSocketServer = WebSocket.Server;
    wsManager.init(mockHttpServer, 5002);
    mockWsServer = WebSocketServer.mock.results[0].value;
    
    // Создаем мок WebSocket соединения и HTTP запроса
    mockWs = new EventEmitter();
    mockWs.send = jest.fn();
    mockWs.readyState = WebSocket.OPEN;
    
    mockReq = {
      url: '/ws?userId=123&userType=requester&ticketId=456',
      headers: {
        'origin': 'http://localhost:3000'
      }
    };
    
    // Мокаем console.log и console.error, чтобы тесты не захламляли вывод
    console.log = jest.fn();
    console.error = jest.fn();
  });
  
  afterEach(() => {
    // Очищаем моки после каждого теста
    if (wsManager.wss) {
      wsManager.wss = null;
    }
  });
  
  describe('init()', () => {
    it('должен инициализировать WebSocket сервер с указанными параметрами', () => {
      // Проверяем, что WebSocket.Server был вызван с правильными параметрами
      expect(WebSocket.Server).toHaveBeenCalledWith(
        expect.objectContaining({
          server: mockHttpServer,
          path: '/ws',
          clientTracking: true
        })
      );
      
      // Проверяем, что обработчик подключения был добавлен
      expect(mockWsServer.on).toHaveBeenCalledWith('connection', expect.any(Function));
      
      // Проверяем, что обработчик ошибок был добавлен
      expect(mockWsServer.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
    
    it('не должен повторно инициализировать сервер, если он уже создан', () => {
      WebSocket.Server.mockClear();
      
      // Вызываем init еще раз
      wsManager.init(mockHttpServer, 5002);
      
      // Проверяем, что WebSocket.Server не был вызван повторно
      expect(WebSocket.Server).not.toHaveBeenCalled();
    });
  });
  
  describe('handleConnection()', () => {
    it('должен обрабатывать новое подключение и сохранять информацию о клиенте', () => {
      // Шпионим за методами
      const addClientSpy = jest.spyOn(wsManager, 'addClient');
      const sendToClientSpy = jest.spyOn(wsManager, 'sendToClient');
      
      // Вызываем обработчик соединения
      wsManager.handleConnection(mockWs, mockReq);
      
      // Проверяем, что методы были вызваны с правильными параметрами
      expect(addClientSpy).toHaveBeenCalledWith('requester', '123', mockWs);
      expect(sendToClientSpy).toHaveBeenCalledWith(
        mockWs,
        expect.objectContaining({
          type: 'connection_established',
          userId: '123',
          userType: 'requester',
          ticketId: '456'
        })
      );
      
      // Проверяем, что информация о пользователе была сохранена
      expect(mockWs.userInfo).toEqual({
        userId: '123',
        userType: 'requester',
        ticketId: '456'
      });
      
      // Проверяем, что обработчики событий были установлены
      expect(mockWs.listenerCount('message')).toBe(1);
      expect(mockWs.listenerCount('close')).toBe(1);
      expect(mockWs.listenerCount('error')).toBe(1);
    });
  });
  
  describe('client tracking methods', () => {
    it('addClient должен добавлять клиента в карту отслеживания', () => {
      wsManager.addClient('staff', '456', mockWs);
      
      // Проверяем, что клиент был добавлен в карту
      expect(wsManager.clients.has('staff')).toBe(true);
      expect(wsManager.clients.get('staff').has('456')).toBe(true);
      expect(wsManager.clients.get('staff').get('456')).toBe(mockWs);
    });
    
    it('removeClient должен удалять клиента из карты отслеживания', () => {
      // Сначала добавляем клиента
      wsManager.addClient('staff', '456', mockWs);
      expect(wsManager.clients.get('staff').has('456')).toBe(true);
      
      // Удаляем клиента
      wsManager.removeClient('staff', '456');
      
      // Проверяем, что клиент был удален
      expect(wsManager.clients.has('staff')).toBe(false);
    });
  });
  
  describe('message sending methods', () => {
    it('sendToClient должен отправлять данные клиенту', () => {
      const data = { type: 'test', message: 'hello' };
      
      // Вызываем метод
      wsManager.sendToClient(mockWs, data);
      
      // Проверяем, что ws.send был вызван с правильными параметрами
      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(data));
    });
    
    it('sendToClient должен возвращать false, если соединение закрыто', () => {
      mockWs.readyState = WebSocket.CLOSED;
      
      // Вызываем метод
      const result = wsManager.sendToClient(mockWs, { type: 'test' });
      
      // Проверяем результат
      expect(result).toBe(false);
      expect(mockWs.send).not.toHaveBeenCalled();
    });
    
    it('sendToSpecificClient должен отправлять сообщение конкретному клиенту', () => {
      // Добавляем клиента в карту
      wsManager.addClient('requester', '123', mockWs);
      
      // Шпионим за методом sendToClient
      const sendToClientSpy = jest.spyOn(wsManager, 'sendToClient');
      
      // Вызываем метод
      wsManager.sendToSpecificClient('requester', '123', { type: 'test' });
      
      // Проверяем, что метод был вызван с правильными параметрами
      expect(sendToClientSpy).toHaveBeenCalledWith(
        mockWs,
        expect.objectContaining({ type: 'test' })
      );
    });
    
    it('broadcastToType должен отправлять сообщение всем клиентам определенного типа', () => {
      // Создаем несколько мок-соединений
      const mockWs1 = { ...mockWs, send: jest.fn() };
      const mockWs2 = { ...mockWs, send: jest.fn() };
      
      // Добавляем клиентов в карту
      wsManager.addClient('staff', '1', mockWs1);
      wsManager.addClient('staff', '2', mockWs2);
      
      // Шпионим за методом sendToClient
      const sendToClientSpy = jest.spyOn(wsManager, 'sendToClient');
      
      // Вызываем метод
      wsManager.broadcastToType('staff', { type: 'test' });
      
      // Проверяем, что метод был вызван для каждого клиента
      expect(sendToClientSpy).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('message handling methods', () => {
    it('должен обрабатывать сообщения типа chat_message', () => {
      // Шпионим за методом handleChatMessage
      const handleChatMessageSpy = jest.spyOn(wsManager, 'handleChatMessage');
      
      // Добавляем соединение и имитируем получение сообщения
      wsManager.handleConnection(mockWs, mockReq);
      mockWs.emit('message', JSON.stringify({
        type: 'chat_message',
        ticket_id: '456',
        content: 'Hello world',
        sender_id: '123',
        sender_type: 'requester'
      }));
      
      // Проверяем, что обработчик был вызван
      expect(handleChatMessageSpy).toHaveBeenCalled();
    });
    
    it('должен обрабатывать сообщения типа typing', () => {
      // Шпионим за методом handleTypingIndicator
      const handleTypingIndicatorSpy = jest.spyOn(wsManager, 'handleTypingIndicator');
      
      // Добавляем соединение и имитируем получение сообщения
      wsManager.handleConnection(mockWs, mockReq);
      mockWs.emit('message', JSON.stringify({
        type: 'typing',
        ticket_id: '456',
        isTyping: true,
        user_id: '123'
      }));
      
      // Проверяем, что обработчик был вызван
      expect(handleTypingIndicatorSpy).toHaveBeenCalled();
    });
    
    it('должен отвечать на ping сообщения', () => {
      // Шпионим за методом sendToClient
      const sendToClientSpy = jest.spyOn(wsManager, 'sendToClient');
      
      // Добавляем соединение и имитируем получение ping
      wsManager.handleConnection(mockWs, mockReq);
      mockWs.emit('message', JSON.stringify({
        type: 'ping',
        timestamp: new Date().toISOString()
      }));
      
      // Проверяем, что был отправлен ответ pong
      expect(sendToClientSpy).toHaveBeenCalledWith(
        mockWs,
        expect.objectContaining({ type: 'pong' })
      );
    });
  });
}); 