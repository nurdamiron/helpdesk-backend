const employeeController = require('../src/controllers/employeeController');
const pool = require('../src/config/database');

// Мокаем модуль базы данных
jest.mock('../src/config/database', () => ({
  query: jest.fn()
}));

describe('Employee Controller Tests', () => {
  // Инициализация окружения перед каждым тестом
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Тест создания сотрудника
  describe('createEmployee', () => {
    it('должен создать нового сотрудника с корректными данными', async () => {
      // Мокаем запросы к БД
      pool.query
        .mockResolvedValueOnce([[], null]) // Проверка на существование
        .mockResolvedValueOnce([{ insertId: 1 }, null]) // Вставка
        .mockResolvedValueOnce([[
          { id: 1, email: 'test@example.com', full_name: 'Тест Тестов' }
        ], null]); // Получение нового сотрудника

      // Мокаем объекты запроса и ответа
      const req = {
        body: {
          email: 'test@example.com',
          full_name: 'Тест Тестов',
          phone: '+79991234567',
          department: 'IT',
          position: 'Developer',
          preferred_contact: 'email'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await employeeController.createEmployee(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(3);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Сотрудник создан',
          employee: expect.objectContaining({
            id: 1,
            email: 'test@example.com',
            full_name: 'Тест Тестов'
          })
        })
      );
    });

    it('должен обновить существующего сотрудника с тем же email', async () => {
      // Мокаем запросы к БД
      pool.query
        .mockResolvedValueOnce([[
          { id: 1, email: 'test@example.com', full_name: 'Тест Тестов' }
        ], null]) // Существующий сотрудник
        .mockResolvedValueOnce([{ affectedRows: 1 }, null]); // Обновление

      // Мокаем объекты запроса и ответа
      const req = {
        body: {
          email: 'test@example.com',
          full_name: 'Тест Тестов Обновленный',
          phone: '+79991234568',
          department: 'Design',
          position: 'Designer',
          preferred_contact: 'phone'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await employeeController.createEmployee(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Сотрудник обновлён',
          employee: expect.objectContaining({
            id: 1,
            email: 'test@example.com',
            full_name: 'Тест Тестов'
          })
        })
      );
    });

    it('должен возвращать ошибку 400 без email и full_name', async () => {
      // Мокаем объекты запроса и ответа
      const req = {
        body: {
          phone: '+79991234567',
          department: 'IT'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await employeeController.createEmployee(req, res);

      // Проверяем результаты
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email и полное имя обязательны' });
    });

    it('должен обрабатывать ошибки БД', async () => {
      // Мокаем ошибку БД
      pool.query.mockRejectedValue(new Error('Ошибка базы данных'));

      // Мокаем объекты запроса и ответа
      const req = {
        body: {
          email: 'test@example.com',
          full_name: 'Тест Тестов'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Мокаем консоль для проверки логирования ошибки
      console.error = jest.fn();

      // Вызываем тестируемый метод
      await employeeController.createEmployee(req, res);

      // Проверяем результаты
      expect(console.error).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Внутренняя ошибка сервера' });
    });
  });

  // Тест получения списка сотрудников
  describe('getEmployees', () => {
    it('должен возвращать список всех сотрудников', async () => {
      // Мокаем запрос к БД
      pool.query.mockResolvedValueOnce([[
        { id: 1, email: 'test1@example.com', full_name: 'Тест Первый' },
        { id: 2, email: 'test2@example.com', full_name: 'Тест Второй' }
      ], null]);

      // Мокаем объекты запроса и ответа
      const req = { query: {} };
      const res = { json: jest.fn() };

      // Вызываем тестируемый метод
      await employeeController.getEmployees(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith({
        employees: expect.arrayContaining([
          expect.objectContaining({ id: 1, email: 'test1@example.com' }),
          expect.objectContaining({ id: 2, email: 'test2@example.com' })
        ])
      });
    });

    it('должен фильтровать по email', async () => {
      // Мокаем запрос к БД
      pool.query.mockResolvedValueOnce([[
        { id: 1, email: 'test1@example.com', full_name: 'Тест Первый' }
      ], null]);

      // Мокаем объекты запроса и ответа
      const req = { query: { email: 'test1' } };
      const res = { json: jest.fn() };

      // Вызываем тестируемый метод
      await employeeController.getEmployees(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE email LIKE ?'),
        expect.arrayContaining(['%test1%'])
      );
      expect(res.json).toHaveBeenCalledWith({
        employees: expect.arrayContaining([
          expect.objectContaining({ id: 1, email: 'test1@example.com' })
        ])
      });
    });

    it('должен поддерживать пагинацию', async () => {
      // Мокаем запросы к БД (подсчет и получение данных)
      pool.query
        .mockResolvedValueOnce([[{ total: 5 }], null]) // Общее количество
        .mockResolvedValueOnce([[
          { id: 1, email: 'test1@example.com', full_name: 'Тест Первый' },
          { id: 2, email: 'test2@example.com', full_name: 'Тест Второй' }
        ], null]); // Данные страницы

      // Мокаем объекты запроса и ответа
      const req = { query: { limit: '2', page: '1' } };
      const res = { json: jest.fn() };

      // Вызываем тестируемый метод
      await employeeController.getEmployees(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(pool.query).toHaveBeenLastCalledWith(
        expect.stringContaining('LIMIT ? OFFSET ?'),
        expect.arrayContaining([2, 0])
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        employees: expect.any(Array),
        page: 1,
        limit: 2,
        total: 5,
        totalPages: 3
      }));
    });

    it('должен обрабатывать ошибки БД', async () => {
      // Мокаем ошибку БД
      pool.query.mockRejectedValue(new Error('Ошибка базы данных'));

      // Мокаем объекты запроса и ответа
      const req = { query: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Мокаем консоль для проверки логирования ошибки
      console.error = jest.fn();

      // Вызываем тестируемый метод
      await employeeController.getEmployees(req, res);

      // Проверяем результаты
      expect(console.error).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Ошибка сервера' });
    });
  });

  // Тесты для метода getEmployeeById
  describe('getEmployeeById', () => {
    it('должен возвращать сотрудника по ID', async () => {
      // Мокаем запрос к БД
      pool.query.mockResolvedValueOnce([[
        { id: 1, email: 'test@example.com', full_name: 'Тест Тестов' }
      ], null]);

      // Мокаем объекты запроса и ответа
      const req = { params: { id: '1' } };
      const res = { json: jest.fn() };

      // Вызываем тестируемый метод
      await employeeController.getEmployeeById(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM employees WHERE id=?'),
        ['1']
      );
      expect(res.json).toHaveBeenCalledWith({
        employee: expect.objectContaining({
          id: 1,
          email: 'test@example.com',
          full_name: 'Тест Тестов'
        })
      });
    });

    it('должен возвращать 404 для несуществующего ID', async () => {
      // Мокаем пустой ответ от БД
      pool.query.mockResolvedValueOnce([[], null]);

      // Мокаем объекты запроса и ответа
      const req = { params: { id: '999' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await employeeController.getEmployeeById(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Сотрудник не найден' });
    });
  });

  // Тесты для метода updateEmployee
  describe('updateEmployee', () => {
    it('должен успешно обновлять данные сотрудника', async () => {
      // Мокаем запросы к БД
      pool.query
        .mockResolvedValueOnce([[{ id: 1, email: 'old@example.com', full_name: 'Старое имя' }], null]) // Проверка существования
        .mockResolvedValueOnce([[], null]) // Проверка email (пусто - email свободен)
        .mockResolvedValueOnce([{ affectedRows: 1 }, null]) // Обновление
        .mockResolvedValueOnce([[{ id: 1, email: 'new@example.com', full_name: 'Новое имя' }], null]); // Получение обновленных данных

      // Мокаем объекты запроса и ответа
      const req = {
        params: { id: '1' },
        body: {
          email: 'new@example.com',
          full_name: 'Новое имя',
          department: 'Новый отдел'
        }
      };

      const res = { json: jest.fn() };

      // Вызываем тестируемый метод
      await employeeController.updateEmployee(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(4);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Сотрудник успешно обновлен',
        employee: expect.objectContaining({
          id: 1,
          email: 'new@example.com',
          full_name: 'Новое имя'
        })
      }));
    });

    it('должен возвращать ошибку при занятом email', async () => {
      // Мокаем запросы к БД
      pool.query
        .mockResolvedValueOnce([[{ id: 1, email: 'old@example.com', full_name: 'Старое имя' }], null]) // Проверка существования
        .mockResolvedValueOnce([[{ id: 2 }], null]); // Другой сотрудник с таким email

      // Мокаем объекты запроса и ответа
      const req = {
        params: { id: '1' },
        body: {
          email: 'used@example.com',
          full_name: 'Новое имя'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await employeeController.updateEmployee(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email уже используется другим сотрудником' });
    });
  });

  // Тесты для метода deleteEmployee
  describe('deleteEmployee', () => {
    it('должен успешно удалять сотрудника без связанных заявок', async () => {
      // Мокаем запросы к БД
      pool.query
        .mockResolvedValueOnce([[{ id: 1, email: 'test@example.com', full_name: 'Тест Тестов' }], null]) // Проверка существования
        .mockResolvedValueOnce([[], null]) // Нет связанных заявок
        .mockResolvedValueOnce([{ affectedRows: 1 }, null]); // Удаление

      // Мокаем объекты запроса и ответа
      const req = { params: { id: '1' } };
      const res = { json: jest.fn() };

      // Вызываем тестируемый метод
      await employeeController.deleteEmployee(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(3);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Сотрудник успешно удален',
        deletedEmployee: expect.objectContaining({
          id: 1,
          email: 'test@example.com'
        })
      }));
    });

    it('должен возвращать ошибку при удалении сотрудника со связанными заявками', async () => {
      // Мокаем запросы к БД
      pool.query
        .mockResolvedValueOnce([[{ id: 1, email: 'test@example.com', full_name: 'Тест Тестов' }], null]) // Проверка существования
        .mockResolvedValueOnce([[{ id: 101 }, { id: 102 }], null]); // Связанные заявки

      // Мокаем объекты запроса и ответа
      const req = { params: { id: '1' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Вызываем тестируемый метод
      await employeeController.deleteEmployee(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Невозможно удалить сотрудника, так как с ним связаны заявки',
        ticketsCount: 2
      }));
    });
  });

  // Тесты для метода getEmployeeStats
  describe('getEmployeeStats', () => {
    it('должен возвращать статистику по сотрудникам', async () => {
      // Мокаем запросы к БД
      pool.query
        .mockResolvedValueOnce([[
          { department: 'IT', count: 5 },
          { department: 'HR', count: 3 }
        ], null]) // Статистика по отделам
        .mockResolvedValueOnce([[
          { position: 'Developer', count: 4 },
          { position: 'Manager', count: 2 }
        ], null]) // Статистика по должностям
        .mockResolvedValueOnce([[{ total: 10 }], null]) // Общее количество
        .mockResolvedValueOnce([[
          { id: 1, full_name: 'Тест Активный', email: 'active@example.com', tickets_count: 5 },
          { id: 2, full_name: 'Тест Второй', email: 'test2@example.com', tickets_count: 3 }
        ], null]); // Топ сотрудников по заявкам

      // Мокаем объекты запроса и ответа
      const req = {};
      const res = { json: jest.fn() };

      // Вызываем тестируемый метод
      await employeeController.getEmployeeStats(req, res);

      // Проверяем результаты
      expect(pool.query).toHaveBeenCalledTimes(4);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        total: 10,
        departmentStats: expect.arrayContaining([
          expect.objectContaining({ department: 'IT', count: 5 })
        ]),
        positionStats: expect.arrayContaining([
          expect.objectContaining({ position: 'Developer', count: 4 })
        ]),
        topEmployeesByTickets: expect.arrayContaining([
          expect.objectContaining({ id: 1, tickets_count: 5 })
        ])
      }));
    });
  });
}); 