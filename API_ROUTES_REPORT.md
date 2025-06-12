# Детальный отчет о API эндпоинтах системы HelpDesk

## 1. Аутентификация и управление пользователями (`/api/auth`)
**Файл:** `authRoutes.js`

### Публичные маршруты (без аутентификации):
- **POST** `/api/auth/login`
  - Описание: Вход пользователя в систему
  - Middleware: нет
  - Функция: `authController.login`

- **POST** `/api/auth/register`
  - Описание: Регистрация нового пользователя
  - Middleware: нет
  - Функция: `authController.register`

### Защищенные маршруты (требуют аутентификации):
- **GET** `/api/auth/me`
  - Описание: Получение информации о текущем пользователе
  - Middleware: `authenticateJWT`
  - Функция: `authController.getMe`

- **POST** `/api/auth/logout`
  - Описание: Выход из системы
  - Middleware: `authenticateJWT`
  - Функция: `authController.logout`

### Административные маршруты:
- **GET** `/api/auth/users`
  - Описание: Получение списка всех пользователей
  - Middleware: `authenticateJWT`, `isModeratorOrAdmin`
  - Функция: `authController.getUsers`

- **GET** `/api/auth/users/:id`
  - Описание: Получение информации о конкретном пользователе
  - Middleware: `authenticateJWT`, `isModeratorOrAdmin`
  - Функция: `authController.getUser`

- **PUT** `/api/auth/users/:id`
  - Описание: Обновление данных пользователя
  - Middleware: `authenticateJWT`, `isModeratorOrAdmin`
  - Функция: `authController.updateUser`

- **DELETE** `/api/auth/users/:id`
  - Описание: Удаление пользователя (только администратор)
  - Middleware: `authenticateJWT`, `isAdmin`
  - Функция: `authController.deleteUser`

---

## 2. Чат и сообщения (`/api/chat`)
**Файл:** `chatRoutes.js`

Все маршруты требуют аутентификации (`authenticateJWT`):

- **GET** `/api/chat/`
  - Описание: Получение списка чатов/заявок для текущего пользователя
  - Middleware: `authenticateJWT`
  - Функция: `chatController.getChatData`

- **GET** `/api/chat/tickets/:ticketId/messages`
  - Описание: Получение истории сообщений для конкретной заявки
  - Middleware: `authenticateJWT`
  - Функция: `chatController.getChatHistory`

- **POST** `/api/chat/tickets/:ticketId/messages`
  - Описание: Отправка нового сообщения в чат заявки
  - Middleware: `authenticateJWT`
  - Функция: `chatController.sendMessage`

- **PUT** `/api/chat/messages/:messageId/status`
  - Описание: Обновление статуса сообщения (прочитано/не прочитано)
  - Middleware: `authenticateJWT`
  - Функция: `chatController.updateMessageStatus`

- **POST** `/api/chat/tickets/:ticketId/typing`
  - Описание: Отправка индикатора набора текста для real-time уведомлений
  - Middleware: `authenticateJWT`
  - Функция: `chatController.sendTypingIndicator`

- **PATCH** `/api/chat/tickets/:id/status`
  - Описание: Обновление статуса заявки через чат
  - Middleware: `authenticateJWT`
  - Функция: `chatController.updateTicketStatus`

- **DELETE** `/api/chat/messages/:id`
  - Описание: Удаление сообщения из чата
  - Middleware: `authenticateJWT`
  - Функция: `chatController.deleteMessage`

---

## 3. Управление сотрудниками (`/api/employees`)
**Файл:** `employeeRoutes.js`

- **POST** `/api/employees/`
  - Описание: Создание нового сотрудника (публичный доступ для заявок)
  - Middleware: нет
  - Функция: `employeeController.createEmployee`

- **GET** `/api/employees/`
  - Описание: Получение списка всех сотрудников
  - Middleware: нет (в комментарии указано "только для админов", но не реализовано)
  - Функция: `employeeController.getEmployees`

- **GET** `/api/employees/stats/summary`
  - Описание: Получение статистики по сотрудникам
  - Middleware: нет (в комментарии указано "только для админов", но не реализовано)
  - Функция: `employeeController.getEmployeeStats`

- **GET** `/api/employees/:id`
  - Описание: Получение информации о конкретном сотруднике
  - Middleware: нет (в комментарии указано "только для админов", но не реализовано)
  - Функция: `employeeController.getEmployeeById`

- **PUT** `/api/employees/:id`
  - Описание: Обновление данных сотрудника
  - Middleware: нет (в комментарии указано "только для админов", но не реализовано)
  - Функция: `employeeController.updateEmployee`

- **DELETE** `/api/employees/:id`
  - Описание: Удаление сотрудника
  - Middleware: нет (в комментарии указано "только для админов", но не реализовано)
  - Функция: `employeeController.deleteEmployee`

⚠️ **Примечание:** В файле есть комментарии о необходимости защиты маршрутов для администраторов, но фактически middleware не применяется.

---

## 4. Работа с сообщениями (`/api/messages`)
**Файл:** `messageRoutes.js`

### Настройка загрузки файлов:
- Использует `multer` для загрузки файлов
- Разрешенные типы: изображения (jpeg, png, gif), PDF, документы (Word, Excel), текстовые файлы
- Максимальный размер файла: 10 MB
- Файлы сохраняются в папку `uploads/`

### Маршруты:
- **GET** `/api/messages/tickets/:ticketId/messages`
  - Описание: Получение всех сообщений заявки
  - Middleware: нет
  - Функция: `messageController.getTicketMessages`

- **POST** `/api/messages/tickets/:ticketId/messages`
  - Описание: Добавление нового сообщения к заявке
  - Middleware: `devAuth` (временная заглушка для разработки)
  - Функция: `messageController.addMessage`

- **PUT** `/api/messages/tickets/:ticketId/messages/read`
  - Описание: Отметка всех сообщений заявки как прочитанных
  - Middleware: `devAuth`
  - Функция: `messageController.markMessagesAsRead`

- **POST** `/api/messages/tickets/:ticketId/attachments`
  - Описание: Загрузка файлового вложения к заявке
  - Middleware: `devAuth`, `upload.single('file')`
  - Функция: `messageController.uploadAttachment`

- **PUT** `/api/messages/:messageId/status`
  - Описание: Обновление статуса конкретного сообщения
  - Middleware: `devAuth`
  - Функция: `messageController.updateMessageStatus`

- **GET** `/api/messages/unread`
  - Описание: Получение всех непрочитанных сообщений пользователя
  - Middleware: `devAuth`
  - Функция: `messageController.getUnreadMessages`

⚠️ **Примечание:** Используется временная заглушка `devAuth` вместо `authenticateJWT`. В продакшене необходимо заменить.

---

## 5. Статистика и аналитика (`/api/statistics`)
**Файл:** `statisticsRoutes.js`

Все маршруты требуют аутентификации (`authenticateJWT`):

- **GET** `/api/statistics/dashboard`
  - Описание: Получение общей статистики для главной панели
  - Middleware: `authenticateJWT`
  - Функция: `statisticsController.getDashboardStats`

- **GET** `/api/statistics/timeline`
  - Описание: Получение статистики по времени для построения графиков
  - Middleware: `authenticateJWT`
  - Функция: `statisticsController.getTimelineStats`

- **GET** `/api/statistics/staff-performance`
  - Описание: Получение статистики производительности сотрудников
  - Middleware: `authenticateJWT`
  - Функция: `statisticsController.getStaffPerformance`

- **GET** `/api/statistics/kpi`
  - Описание: Получение ключевых показателей эффективности (KPI)
  - Middleware: `authenticateJWT`
  - Функция: `statisticsController.getKPIMetrics`

- **GET** `/api/statistics/export`
  - Описание: Экспорт статистических данных
  - Middleware: `authenticateJWT`
  - Функция: `statisticsController.exportStatistics`

---

## 6. Управление заявками (`/api/tickets`)
**Файл:** `ticketRoutes.js`

### Настройка загрузки файлов:
- Аналогично messageRoutes.js
- Файлы сохраняются с префиксом 'ticket-'

### Основные маршруты заявок:
- **POST** `/api/tickets/`
  - Описание: Создание новой заявки
  - Middleware: `authenticateJWT`
  - Функция: `ticketController.createTicket`
  - Доступ: все авторизованные пользователи

- **GET** `/api/tickets/`
  - Описание: Получение списка заявок (с фильтрацией по роли в контроллере)
  - Middleware: `authenticateJWT`
  - Функция: `ticketController.getTickets`
  - Доступ: все авторизованные пользователи

- **GET** `/api/tickets/analytics`
  - Описание: Получение аналитики по заявкам
  - Middleware: `authenticateJWT`, `isModeratorOrAdmin`
  - Функция: `ticketController.getTicketsAnalytics`
  - Доступ: только модераторы и администраторы

- **GET** `/api/tickets/:id`
  - Описание: Получение детальной информации о заявке
  - Middleware: `authenticateJWT`
  - Функция: `ticketController.getTicketById`
  - Доступ: все авторизованные пользователи

- **PUT** `/api/tickets/:id`
  - Описание: Обновление заявки
  - Middleware: `authenticateJWT`, `isModeratorOrAdmin`
  - Функция: `ticketController.updateTicket`
  - Доступ: только модераторы и администраторы

- **DELETE** `/api/tickets/:id`
  - Описание: Удаление заявки
  - Middleware: `authenticateJWT`, `isAdmin`
  - Функция: `ticketController.deleteTicket`
  - Доступ: только администраторы

- **PATCH** `/api/tickets/:id/status`
  - Описание: Обновление статуса заявки
  - Middleware: `authenticateJWT`, `isModeratorOrAdmin`
  - Функция: `ticketController.updateTicketStatus`
  - Доступ: только модераторы и администраторы

### Маршруты работы с сообщениями заявок:
- **GET** `/api/tickets/:ticketId/messages`
  - Описание: Получение истории сообщений заявки
  - Middleware: `authenticateJWT`
  - Функция: `messageController.getTicketMessages`

- **POST** `/api/tickets/:ticketId/messages`
  - Описание: Отправка сообщения в заявку
  - Middleware: `authenticateJWT`
  - Функция: `messageController.addMessage`

- **PUT** `/api/tickets/:ticketId/messages/read`
  - Описание: Отметка сообщений как прочитанных
  - Middleware: `authenticateJWT`
  - Функция: `messageController.markMessagesAsRead`

- **POST** `/api/tickets/:ticketId/attachments`
  - Описание: Загрузка файла к заявке
  - Middleware: `authenticateJWT`, `upload.single('file')`
  - Функция: `messageController.uploadAttachment`

- **PUT** `/api/tickets/:ticketId/messages/:messageId/status`
  - Описание: Обновление статуса конкретного сообщения
  - Middleware: `authenticateJWT`, `isModeratorOrAdmin`
  - Функция: `messageController.updateMessageStatus`
  - Доступ: только модераторы и администраторы

---

## 7. Управление пользователями (`/api/users`)
**Файл:** `userRoutes.js`

### Публичные маршруты:
- **POST** `/api/users/login`
  - Описание: Авторизация пользователя
  - Middleware: нет
  - Функция: `userController.login`

- **GET** `/api/users/`
  - Описание: Получение списка всех пользователей
  - Middleware: нет
  - Функция: `userController.getUsers`

- **POST** `/api/users/`
  - Описание: Создание нового пользователя
  - Middleware: нет
  - Функция: `userController.createUser`

- **GET** `/api/users/:id`
  - Описание: Получение информации о пользователе по ID
  - Middleware: нет
  - Функция: `userController.getUserById`

- **PUT** `/api/users/:id`
  - Описание: Обновление данных пользователя
  - Middleware: нет
  - Функция: `userController.updateUser`

- **PUT** `/api/users/:id/password`
  - Описание: Обновление пароля пользователя
  - Middleware: нет
  - Функция: `userController.updatePassword`

- **PUT** `/api/users/:id/settings`
  - Описание: Обновление настроек пользователя
  - Middleware: нет
  - Функция: `userController.updateSettings`

- **DELETE** `/api/users/:id`
  - Описание: Удаление пользователя
  - Middleware: нет
  - Функция: `userController.deleteUser`

### Защищенные маршруты:
- **POST** `/api/users/:userId/telegram-token`
  - Описание: Генерация токена для привязки Telegram (только для администраторов)
  - Middleware: `authenticateJWT`
  - Функция: `userController.generateTelegramToken`

⚠️ **Примечание:** Большинство маршрутов не защищены middleware аутентификации, хотя по логике должны быть защищены.

---

## Роли и доступ в системе

### Роли пользователей:
1. **admin** - Полный доступ ко всем функциям
2. **support/manager** - Доступ к модерации заявок и статистике
3. **user** - Базовый доступ (создание заявок, просмотр своих заявок)

### Middleware для проверки прав:
- `authenticateJWT` - проверка валидности JWT токена
- `isAdmin` - проверка роли администратора
- `isModeratorOrAdmin` - проверка роли модератора или администратора
- `hasRole(roles)` - проверка наличия определенной роли

### Особенности разработки:
- В режиме разработки используются mock-пользователи
- Поддерживаются токены вида `mock-jwt-token-{role}` для тестирования
- Некоторые маршруты используют временную заглушку `devAuth`

---

## Рекомендации по безопасности

1. **Защита маршрутов сотрудников**: В `employeeRoutes.js` необходимо добавить middleware аутентификации и проверки прав
2. **Защита пользовательских маршрутов**: В `userRoutes.js` большинство маршрутов должны требовать аутентификацию
3. **Замена devAuth**: В `messageRoutes.js` заменить `devAuth` на `authenticateJWT` в продакшене
4. **Валидация данных**: Рекомендуется добавить middleware для валидации входных данных
5. **Rate limiting**: Добавить ограничение количества запросов для защиты от DDoS
6. **CORS настройки**: Убедиться в правильной конфигурации CORS для продакшена