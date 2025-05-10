 const ticketController = require('../src/controllers/ticketController');
const pool = require('../src/config/database');
const nodemailer = require('nodemailer');

// Мокаем модули базы данных и nodemailer
jest.mock('../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-message-id' })
  })
}));

describe('Ticket Controller Tests', () => {
  // Инициализация окружения перед каждым тестом
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Тесты для метода createTicket
  describe('createTicket', () => {
    it('должен создавать заявку с данными сотрудника', async () => {
      // Мокаем запросы к БД
      pool.query
        .mockResolvedValueOnce([[], null]) // Проверка сотрудника (не найден)
        .mockResolvedValueOnce([{ insertId: 1 }, null]) // Создание сотрудника
        .mockResolvedValueOnce([{ insertId: 101 }, null]) // Создание заявки
        .mockResolvedValueOnce([{ affectedRows: 1 }, null]); // Добавление сообщения

      // Мокаем объекты запроса и ответа
      const req = {
        body: {
          subject: 'Тестовая заявка',
          description: 'Описание тестовой заявки',
          type: 'request',
          priority: 'medium',
          category: 'it',
          metadata: {
            employee: {
              email: 'employee@example.com',
              full_name: 'Тест Сотрудников',
              department: 'IT',
              position: 'Developer',
              phone: '+79991234567',
              preferred_contact: 'email'
            }
          }
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await ticketController.createTicket(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(4);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        ticket: expect.objectContaining({
          id: 101,
          subject: 'Тестовая заявка',
          description: 'Описание тестовой заявки',
          type: 'request',
          status: 'new',
          priority: 'medium',
          category: 'it'
        })
      }));
    });

    it('должен использовать существующего сотрудника если найден по email', async () => {
      // Мокаем запросы к БД
      pool.query
        .mockResolvedValueOnce([[{ id: 1, email: 'existing@example.com' }], null]) // Сотрудник найден
        .mockResolvedValueOnce([{ affectedRows: 1 }, null]) // Обновление сотрудника
        .mockResolvedValueOnce([{ insertId: 102 }, null]) // Создание заявки
        .mockResolvedValueOnce([{ affectedRows: 1 }, null]); // Добавление сообщения

      // Мокаем объекты запроса и ответа
      const req = {
        body: {
          subject: 'Тестовая заявка',
          description: 'Описание тестовой заявки',
          type: 'complaint',
          priority: 'high',
          category: 'hr',
          metadata: {
            employee: {
              email: 'existing@example.com',
              full_name: 'Существующий Сотрудник',
              department: 'HR'
            }
          }
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await ticketController.createTicket(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(4);
      expect(pool.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO tickets'),
        expect.arrayContaining(['complaint', 'high', 'hr', 1])
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('должен возвращать ошибку 400 без обязательных полей', async () => {
      // Мокаем объекты запроса и ответа
      const req = {
        body: {
          // Отсутствует subject
          description: 'Только описание',
          priority: 'low'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await ticketController.createTicket(req, res);

      // Проверяем результаты
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Тема и описание обязательны' });
    });

    it('должен обрабатывать ошибки БД', async () => {
      // Мокаем ошибку БД
      pool.query.mockRejectedValue(new Error('Ошибка базы данных'));

      // Мокаем объекты запроса и ответа
      const req = {
        body: {
          subject: 'Тестовая заявка',
          description: 'Описание тестовой заявки',
          type: 'request',
          priority: 'medium'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Мокаем консоль для проверки логирования ошибки
      console.error = jest.fn();

      // Вызываем тестируемый метод
      await ticketController.createTicket(req, res);

      // Проверяем результаты
      expect(console.error).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Ошибка при создании заявки' });
    });
  });

  // Тесты для метода getTickets
  describe('getTickets', () => {
    it('должен возвращать список заявок с пагинацией', async () => {
      // Мокаем запросы к БД (count и получение данных)
      pool.query
        .mockResolvedValueOnce([[{ total: 15 }], null]) // Подсчет общего количества
        .mockResolvedValueOnce([[
          { 
            id: 1, 
            subject: 'Заявка 1', 
            created_at: '2023-01-01', 
            employee_id: 1,
            employee_email: 'emp1@example.com',
            employee_name: 'Сотрудник 1',
            employee_department: 'IT'
          },
          { 
            id: 2, 
            subject: 'Заявка 2', 
            created_at: '2023-01-02',
            employee_id: 2,
            employee_email: 'emp2@example.com',
            employee_name: 'Сотрудник 2',
            employee_department: 'HR'
          }
        ], null]); // Получение заявок

      // Мокаем объекты запроса и ответа
      const req = {
        query: {
          page: '1',
          limit: '10',
          sort: 'created_at',
          order: 'DESC'
        }
      };

      const res = {
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await ticketController.getTickets(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            subject: 'Заявка 1',
            employee: expect.objectContaining({
              id: 1,
              email: 'emp1@example.com'
            })
          })
        ]),
        total: 15,
        page: 1,
        limit: 10,
        totalPages: 2
      }));
    });

    it('должен поддерживать фильтрацию по статусу, типу и категории', async () => {
      // Мокаем запросы к БД
      pool.query
        .mockResolvedValueOnce([[{ total: 3 }], null]) // Подсчет
        .mockResolvedValueOnce([[
          { id: 3, subject: 'Отфильтрованная заявка', status: 'in_progress', type: 'complaint', category: 'hr' }
        ], null]); // Результаты с фильтрами

      // Мокаем объекты запроса и ответа
      const req = {
        query: {
          status: 'in_progress',
          type: 'complaint',
          category: 'hr',
          page: '1',
          limit: '10'
        }
      };

      const res = {
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await ticketController.getTickets(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(2);
      // Проверяем SQL запрос с фильтрами
      expect(pool.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('WHERE') && 
        expect.stringContaining('t.status = ?') && 
        expect.stringContaining('t.type = ?') && 
        expect.stringContaining('t.category = ?'),
        expect.arrayContaining(['in_progress', 'complaint', 'hr'])
      );
    });

    it('должен поддерживать поиск по тексту', async () => {
      // Мокаем запросы к БД
      pool.query
        .mockResolvedValueOnce([[{ total: 2 }], null]) // Подсчет
        .mockResolvedValueOnce([[
          { id: 4, subject: 'Заявка с поисковым термином' }
        ], null]); // Результаты поиска

      // Мокаем объекты запроса и ответа
      const req = {
        query: {
          search: 'поисковый термин',
          page: '1',
          limit: '10'
        }
      };

      const res = {
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await ticketController.getTickets(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(2);
      // Проверяем SQL запрос с поиском
      expect(pool.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('LIKE ?'),
        expect.arrayContaining(['%поисковый термин%'])
      );
    });
  });

  // Тесты для метода getTicketById
  describe('getTicketById', () => {
    it('должен возвращать заявку по ID со всеми связанными данными', async () => {
      // Мокаем запросы к БД
      pool.query
        .mockResolvedValueOnce([[{ 
          id: 101, 
          subject: 'Тестовая заявка', 
          status: 'in_progress',
          employee_id: 1,
          employee_email: 'emp@example.com',
          employee_name: 'Сотрудник',
          employee_department: 'IT'
        }], null]) // Основная информация о заявке
        .mockResolvedValueOnce([[
          { id: 201, ticket_id: 101, content: 'Сообщение 1', sender_type: 'requester', sender_name: 'Сотрудник' },
          { id: 202, ticket_id: 101, content: 'Сообщение 2', sender_type: 'staff', sender_name: 'Админ' }
        ], null]) // Сообщения
        .mockResolvedValueOnce([[
          { id: 301, ticket_id: 101, file_name: 'test.pdf', file_path: '/uploads/test.pdf' }
        ], null]); // Вложения

      // Мокаем объекты запроса и ответа
      const req = {
        params: { id: '101' }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await ticketController.getTicketById(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(3);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        ticket: expect.objectContaining({
          id: 101,
          subject: 'Тестовая заявка',
          employee: expect.objectContaining({
            id: 1,
            email: 'emp@example.com'
          }),
          messages: expect.arrayContaining([
            expect.objectContaining({ id: 201, content: 'Сообщение 1' })
          ]),
          attachments: expect.arrayContaining([
            expect.objectContaining({ id: 301, file_name: 'test.pdf' })
          ])
        })
      }));
    });

    it('должен возвращать 404 для несуществующей заявки', async () => {
      // Мокаем пустой ответ от БД
      pool.query.mockResolvedValueOnce([[], null]);

      // Мокаем объекты запроса и ответа
      const req = {
        params: { id: '999' }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await ticketController.getTicketById(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Заявка не найдена' });
    });
  });

  // Тесты для метода updateTicket
  describe('updateTicket', () => {
    it('должен обновлять заявку с валидными данными', async () => {
      // Мокаем запросы к БД
      pool.query
        .mockResolvedValueOnce([[{ id: 101, subject: 'Старая тема' }], null]) // Проверка существования
        .mockResolvedValueOnce([{ affectedRows: 1 }, null]) // Обновление
        .mockResolvedValueOnce([[{ id: 101, subject: 'Новая тема', status: 'in_progress' }], null]); // Получение обновленной заявки

      // Мокаем объекты запроса и ответа
      const req = {
        params: { id: '101' },
        body: {
          subject: 'Новая тема',
          status: 'in_progress',
          priority: 'high'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await ticketController.updateTicket(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(3);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Заявка успешно обновлена',
        ticket: expect.objectContaining({
          id: 101,
          subject: 'Новая тема',
          status: 'in_progress'
        })
      }));
    });

    it('должен возвращать 404 для несуществующей заявки', async () => {
      // Мокаем пустой ответ от БД
      pool.query.mockResolvedValueOnce([[], null]);

      // Мокаем объекты запроса и ответа
      const req = {
        params: { id: '999' },
        body: {
          status: 'resolved'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await ticketController.updateTicket(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Заявка не найдена' });
    });
  });

  // Тесты для метода addMessage
  describe('addMessage', () => {
    it('должен добавлять сообщение к заявке', async () => {
      // Мокаем запросы к БД
      pool.query
        .mockResolvedValueOnce([[{ id: 101 }], null]) // Проверка существования заявки
        .mockResolvedValueOnce([{ insertId: 301 }, null]) // Добавление сообщения
        .mockResolvedValueOnce([{ affectedRows: 1 }, null]); // Обновление updated_at

      // Мокаем объекты запроса и ответа
      const req = {
        params: { id: '101' },
        body: {
          content: 'Новое сообщение',
          sender_type: 'staff',
          sender_id: 1,
          content_type: 'text'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await ticketController.addMessage(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(3);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.objectContaining({
          id: 301,
          ticket_id: 101,
          content: 'Новое сообщение',
          sender_type: 'staff'
        })
      }));
    });

    it('должен возвращать ошибку 400 без содержания сообщения', async () => {
      // Мокаем объекты запроса и ответа
      const req = {
        params: { id: '101' },
        body: {
          sender_type: 'staff',
          content: ''  // Пустое сообщение
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await ticketController.addMessage(req, res);

      // Проверяем результаты
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Содержание сообщения обязательно' });
    });

    it('должен возвращать 404 для несуществующей заявки', async () => {
      // Мокаем пустой ответ от БД
      pool.query.mockResolvedValueOnce([[], null]);

      // Мокаем объекты запроса и ответа
      const req = {
        params: { id: '999' },
        body: {
          content: 'Сообщение для несуществующей заявки',
          sender_type: 'staff'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await ticketController.addMessage(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Заявка не найдена' });
    });
  });

  // Тесты для метода deleteTicket
  describe('deleteTicket', () => {
    it('должен удалять заявку по ID', async () => {
      // Мокаем запрос к БД
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }, null]);

      // Мокаем объекты запроса и ответа
      const req = {
        params: { id: '101' }
      };

      const res = {
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await ticketController.deleteTicket(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(pool.query).toHaveBeenCalledWith('DELETE FROM tickets WHERE id=?', ['101']);
      expect(res.json).toHaveBeenCalledWith({ message: 'Заявка удалена' });
    });

    it('должен возвращать 404 при удалении несуществующей заявки', async () => {
      // Мокаем пустой результат удаления
      pool.query.mockResolvedValueOnce([{ affectedRows: 0 }, null]);

      // Мокаем объекты запроса и ответа
      const req = {
        params: { id: '999' }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await ticketController.deleteTicket(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Заявка не найдена' });
    });
  });
}); 