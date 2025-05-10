# Helpdesk Backend

Бэкенд-часть системы поддержки для обращений сотрудников (заявки, жалобы, предложения).

## Структура проекта

```
helpdesk-backend/
├── src/
│   ├── config/          # Конфигурация приложения
│   ├── controllers/     # Контроллеры API
│   ├── middleware/      # Промежуточное ПО
│   ├── routes/          # Маршруты API
│   └── index.js         # Точка входа
├── __tests__/           # Тесты
├── uploads/             # Загружаемые файлы
├── .env                 # Переменные окружения
├── jest.config.js       # Конфигурация Jest
└── package.json         # Зависимости проекта
```

## Установка

1. Клонируйте репозиторий
2. Установите зависимости:

```bash
npm install
```

3. Создайте файл `.env` на основе `.env.example`:

```
PORT=5002
DB_HOST=
DB_USER=root
DB_PASSWORD=your_password
DB_DATABASE=helpdesk
JWT_SECRET=your_jwt_secret
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_email_password
```

4. Запустите сервер:

```bash
# Разработка (с nodemon)
npm run dev

# Продакшн
npm start
```

## API Endpoints

### Сотрудники

- `GET /api/employees` - Получить список всех сотрудников
- `GET /api/employees/:id` - Получить сотрудника по ID
- `POST /api/employees` - Создать/обновить сотрудника
- `PUT /api/employees/:id` - Обновить сотрудника
- `DELETE /api/employees/:id` - Удалить сотрудника
- `GET /api/employees/stats/summary` - Получить статистику по сотрудникам

### Заявки

- `GET /api/tickets` - Получить список всех заявок
- `GET /api/tickets/:id` - Получить заявку по ID
- `POST /api/tickets` - Создать новую заявку
- `PUT /api/tickets/:id` - Обновить заявку
- `DELETE /api/tickets/:id` - Удалить заявку
- `POST /api/tickets/:id/messages` - Добавить сообщение к заявке
- `POST /api/tickets/:id/attachments` - Загрузить вложение к заявке

### Аутентификация (для админ-панели)

- `POST /api/auth/register` - Регистрация пользователя
- `POST /api/auth/login` - Вход в систему 
- `GET /api/auth/me` - Получить данные текущего пользователя

## Тестирование

### Установка зависимостей для тестирования

```bash
npm install --save-dev jest supertest @babel/core @babel/preset-env
```

### Запуск тестов

```bash
# Запуск всех тестов
npm test

# Запуск тестов в режиме watch
npm run test:watch

# Запуск тестов с проверкой покрытия
npm run test:coverage
```

### Структура тестов

Тесты находятся в директории `__tests__` и соответствуют файлам в директории `src/controllers`:

- `employeeController.test.js` - тесты API сотрудников
- `ticketController.test.js` - тесты API заявок

## База данных

Структура базы данных находится в файле `database_structure.txt` 