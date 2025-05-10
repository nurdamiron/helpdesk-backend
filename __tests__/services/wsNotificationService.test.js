const wsNotificationService = require('../../src/services/wsNotificationService');
const WebSocketManager = require('../../src/services/WebSocketManager');

// Мокаем WebSocketManager
jest.mock('../../src/services/WebSocketManager', () => ({
  broadcastToType: jest.fn(),
  sendToSpecificClient: jest.fn(),
  broadcastToAll: jest.fn()
}));

describe('WebSocket Notification Service Tests', () => {
  beforeEach(() => {
    // Сбрасываем все моки перед каждым тестом
    jest.clearAllMocks();
    
    // Мокаем глобальную переменную wsServer
    global.wsServer = WebSocketManager;
  });
  
  afterEach(() => {
    // Очищаем глобальную переменную после каждого теста
    delete global.wsServer;
  });
  
  describe('handleWebSocketNotification()', () => {
    it('должен отправлять уведомление о новом сообщении администраторам, если сообщение от заявителя', async () => {
      // Тестовые данные
      const message = {
        id: 789,
        ticket_id: 123,
        content: 'Тестовое сообщение',
        created_at: new Date().toISOString(),
        sender: {
          type: 'requester',
          id: 456,
          name: 'Тест Тестов'
        },
        attachments: []
      };
      
      const ticket = {
        id: 123,
        subject: 'Тестовая заявка',
        status: 'new'
      };
      
      // Вызываем тестируемый метод
      await wsNotificationService.handleWebSocketNotification(message, ticket, 'requester', 456);
      
      // Проверяем, что метод broadcast был вызван для администраторов
      expect(WebSocketManager.broadcastToType).toHaveBeenCalledWith(
        'staff',
        expect.objectContaining({
          type: 'new_message',
          message: expect.objectContaining({
            id: 789,
            content: 'Тестовое сообщение'
          })
        })
      );
      
      // Проверяем, что метод sendToSpecificClient был вызван для отправителя
      expect(WebSocketManager.sendToSpecificClient).toHaveBeenCalledWith(
        'requester', 
        456,
        expect.objectContaining({
          type: 'message_sent',
          message_id: 789
        })
      );
    });
    
    it('должен отправлять уведомление о новом сообщении заявителю, если сообщение от администратора', async () => {
      // Тестовые данные
      const message = {
        id: 790,
        ticket_id: 123,
        content: 'Тестовое сообщение от администратора',
        created_at: new Date().toISOString(),
        sender: {
          type: 'staff',
          id: 789,
          name: 'Администратор'
        },
        attachments: []
      };
      
      const ticket = {
        id: 123,
        subject: 'Тестовая заявка',
        requester_id: 456
      };
      
      // Вызываем тестируемый метод
      await wsNotificationService.handleWebSocketNotification(message, ticket, 'staff', 789);
      
      // Проверяем, что метод sendToSpecificClient был вызван для заявителя
      expect(WebSocketManager.sendToSpecificClient).toHaveBeenCalledWith(
        'requester',
        456,
        expect.objectContaining({
          type: 'new_message',
          message: expect.objectContaining({
            id: 790,
            content: 'Тестовое сообщение от администратора'
          })
        })
      );
      
      // Проверяем, что метод sendToSpecificClient был вызван для отправителя
      expect(WebSocketManager.sendToSpecificClient).toHaveBeenCalledWith(
        'staff', 
        789,
        expect.objectContaining({
          type: 'message_sent',
          message_id: 790
        })
      );
    });
    
    it('не должен отправлять уведомление, если wsServer не доступен', async () => {
      // Удаляем глобальную переменную
      delete global.wsServer;
      
      // Тестовые данные
      const message = {
        id: 789,
        content: 'Тестовое сообщение'
      };
      
      const ticket = {
        id: 123,
        subject: 'Тестовая заявка'
      };
      
      // Вызываем тестируемый метод
      await wsNotificationService.handleWebSocketNotification(message, ticket, 'requester', 456);
      
      // Проверяем, что методы не были вызваны
      expect(WebSocketManager.broadcastToType).not.toHaveBeenCalled();
      expect(WebSocketManager.sendToSpecificClient).not.toHaveBeenCalled();
    });
  });
  
  describe('sendStatusUpdate()', () => {
    it('должен отправлять уведомление об изменении статуса сообщения', async () => {
      // Тестовые данные
      const message = {
        id: 789,
        ticket_id: 123,
        sender_type: 'requester',
        sender_id: 456
      };
      
      const status = 'read';
      
      // Вызываем тестируемый метод
      await wsNotificationService.sendStatusUpdate(message, status);
      
      // Проверяем, что метод sendToSpecificClient был вызван с правильными параметрами
      expect(WebSocketManager.sendToSpecificClient).toHaveBeenCalledWith(
        'requester',
        456,
        expect.objectContaining({
          type: 'status_update',
          message_id: 789,
          status: 'read'
        })
      );
    });
    
    it('должен возвращать false, если wsServer не доступен', async () => {
      // Удаляем глобальную переменную
      delete global.wsServer;
      
      // Тестовые данные
      const message = {
        id: 789,
        sender_type: 'requester',
        sender_id: 456
      };
      
      // Вызываем тестируемый метод
      const result = await wsNotificationService.sendStatusUpdate(message, 'read');
      
      // Проверяем результат
      expect(result).toBe(false);
      expect(WebSocketManager.sendToSpecificClient).not.toHaveBeenCalled();
    });
  });
  
  describe('sendTypingIndicator()', () => {
    it('должен отправлять индикатор набора текста сотрудникам', async () => {
      // Тестовые данные
      const ticketId = 123;
      const senderId = 456;
      const senderType = 'requester';
      const isTyping = true;
      
      // Вызываем тестируемый метод
      await wsNotificationService.sendTypingIndicator(ticketId, senderId, senderType, isTyping);
      
      // Проверяем, что метод broadcastToType был вызван с правильными параметрами
      expect(WebSocketManager.broadcastToType).toHaveBeenCalledWith(
        'staff',
        expect.objectContaining({
          type: 'typing_indicator',
          ticket_id: 123,
          user_id: 456,
          isTyping: true
        })
      );
    });
    
    it('должен возвращать false, если wsServer не доступен', async () => {
      // Удаляем глобальную переменную
      delete global.wsServer;
      
      // Тестовые данные
      const ticketId = 123;
      const senderId = 456;
      const senderType = 'requester';
      const isTyping = true;
      
      // Вызываем тестируемый метод
      const result = await wsNotificationService.sendTypingIndicator(ticketId, senderId, senderType, isTyping);
      
      // Проверяем результат
      expect(result).toBe(false);
      expect(WebSocketManager.broadcastToType).not.toHaveBeenCalled();
    });
  });
}); 