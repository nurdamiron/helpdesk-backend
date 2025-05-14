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

# Продакшн с задержкой (для предотвращения конфликтов портов)
npm run start:delay
```

## Деплой

### Деплой на Render.com

1. Создайте новый Web Service в [Render Dashboard](https://dashboard.render.com/)
2. Подключите ваш репозиторий
3. Укажите следующие настройки:
   - **Name**: helpdesk-backend (или другое имя по вашему выбору)
   - **Environment**: Node
   - **Region**: выберите ближайший к вам регион
   - **Branch**: main (или другую ветку)
   - **Build Command**: `npm install`
   - **Start Command**: `npm run start:delay`
   - **Auto-Deploy**: Yes (по желанию)

4. Добавьте переменные окружения (Environment Variables):
   - `NODE_ENV`: production
   - `PORT`: 10000
   - `DB_HOST`: [ваш хост базы данных]
   - `DB_USER`: [пользователь базы данных]
   - `DB_PASSWORD`: [пароль базы данных]
   - `DB_DATABASE`: [имя базы данных]
   - `JWT_SECRET`: [ваш секретный ключ]
   - `RENDER`: true

5. Нажмите "Create Web Service"

> **Примечание**: Для предотвращения ошибок с портами при деплое на Render мы используем скрипт `start:delay`, который добавляет задержку перед запуском сервера, позволяя предыдущему процессу корректно завершиться.

### Устранение неполадок при деплое

Если вы столкнулись с ошибкой `EADDRINUSE` (порт уже используется), проверьте:

1. Не запущен ли уже другой экземпляр приложения на том же порту
2. Завершение всех процессов перед перезапуском сервера
3. Используйте скрипт с задержкой `npm run start:delay`

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