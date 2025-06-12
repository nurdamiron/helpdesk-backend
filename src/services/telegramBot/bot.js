const TelegramBot = require('node-telegram-bot-api');
const pool = require('../../config/database');
const { sendTicketCreationNotification } = require('../../utils/emailService');

class HelpdeskTelegramBot {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    if (!this.token) {
      console.error('❌ TELEGRAM_BOT_TOKEN не установлен в переменных окружения');
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }
    
    // Инициализация свойств
    this.bot = null;
    this.isInitializing = true;
    this.isRunning = false;
    this.userStates = new Map();
    this.adminChatIds = [];
    this.moderatorChatIds = [];
    this.instanceId = `bot-${process.pid}-${Date.now()}`;
    this.retryCount = 0;
    this.maxRetries = 3;
    
    console.log(`🤖 Создание экземпляра Telegram бота (ID: ${this.instanceId})`);
    
    // Запускаем асинхронную инициализацию
    this.init().catch(error => {
      console.error('❌ Критическая ошибка инициализации бота:', error);
      this.isInitializing = false;
      this.isRunning = false;
    });
  }

  async init() {
    try {
      console.log(`📍 Начало инициализации бота (ID: ${this.instanceId})`);
      
      // Используем webhook в продакшене, polling в разработке
      const useWebhook = process.env.NODE_ENV === 'production' || process.env.USE_WEBHOOK === 'true';
      
      // Создаем экземпляр бота без автозапуска
      if (useWebhook) {
        this.bot = new TelegramBot(this.token, { webHook: false });
      } else {
        this.bot = new TelegramBot(this.token, { 
          polling: false // Отключаем автозапуск
        });
      }
      
      // Сохраняем ссылку на глобальный объект
      global.telegramBot = this;
      
      // Настраиваем обработчики
      this.setupHandlers();
      
      // Загружаем список администраторов
      await this.loadAdminList();
      
      // Запускаем бота в зависимости от режима
      if (useWebhook) {
        await this.setupWebhook();
      } else {
        await this.startPollingWithRetry();
      }
      
      // Устанавливаем флаги успешной инициализации
      this.isInitializing = false;
      this.isRunning = true;
      
      console.log(`✅ Бот инициализирован успешно (ID: ${this.instanceId})`);
      
    } catch (error) {
      console.error(`❌ Ошибка инициализации бота (ID: ${this.instanceId}):`, error);
      this.isInitializing = false;
      this.isRunning = false;
      throw error;
    }
  }

  async startPollingWithRetry() {
    let retryCount = 0;
    const maxRetries = 3;
    const baseDelay = 20000; // 20 секунд базовая задержка
    
    while (retryCount < maxRetries) {
      try {
        console.log(`🔄 Попытка ${retryCount + 1}/${maxRetries} запуска polling...`);
        
        // Очищаем предыдущие соединения
        await this.clearPreviousConnections();
        
        // Дополнительная задержка между попытками
        if (retryCount > 0) {
          const delay = baseDelay + (retryCount * 10000);
          console.log(`⏳ Ожидание ${delay / 1000} секунд перед следующей попыткой...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Запускаем polling
        await this.bot.startPolling({
          restart: true,
          polling: {
            interval: 2000,
            params: {
              timeout: 30,
              allowed_updates: ["message", "callback_query", "inline_query"]
            }
          }
        });
        
        console.log(`✅ Telegram бот запущен успешно в режиме polling (ID: ${this.instanceId})`);
        return; // Успешный запуск
        
      } catch (error) {
        retryCount++;
        console.error(`❌ Ошибка запуска (попытка ${retryCount}/${maxRetries}):`, error.message);
        
        if (error.message.includes('409') || error.message.includes('Conflict')) {
          console.log('⚠️ Обнаружен конфликт с другим экземпляром бота');
          
          // Принудительная очистка
          await this.forceClearTelegramApi();
          
          if (retryCount >= maxRetries) {
            throw new Error(`Не удалось запустить бот после ${maxRetries} попыток из-за конфликта`);
          }
        } else {
          // Для других ошибок меньшая задержка
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          if (retryCount >= maxRetries) {
            throw error;
          }
        }
      }
    }
  }

  async setupWebhook() {
    try {
      const webhookUrl = `${process.env.WEBHOOK_URL || 'https://your-domain.com'}/api/telegram/webhook`;
      await this.bot.setWebHook(webhookUrl);
      console.log('✅ Telegram webhook настроен успешно:', webhookUrl);
      this.isInitializing = false;
    } catch (error) {
      console.error('❌ Ошибка настройки webhook:', error.message);
      this.isInitializing = false;
      throw error;
    }
  }

  async clearPreviousConnections() {
    try {
      // Удаляем webhook если он установлен
      await this.bot.deleteWebHook();
      console.log('🧹 Webhook удален');
      
      // Небольшая пауза
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log('⚠️ Ошибка при удалении webhook (это нормально):', error.message);
    }
  }

  async forceClearTelegramApi() {
    try {
      console.log('🔧 Принудительная очистка Telegram API...');
      
      // Создаем временный экземпляр для очистки
      const tempBot = new TelegramBot(this.token, { polling: false, webHook: false });
      
      // Удаляем webhook
      try {
        await tempBot.deleteWebHook();
        console.log('🧹 Webhook удален через временный бот');
      } catch (e) {
        console.log('⚠️ Webhook уже удален или не существует');
      }
      
      // Получаем обновления для очистки очереди
      try {
        await tempBot.getUpdates({ offset: -1 });
        console.log('🧹 Очередь обновлений очищена');
      } catch (e) {
        console.log('⚠️ Ошибка очистки очереди:', e.message);
      }
      
      // Ждем перед следующей попыткой
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error('❌ Ошибка принудительной очистки:', error.message);
    }
  }

  setupHandlers() {
    // Команды
    this.bot.onText(/\/start(.*)/, (msg, match) => this.handleStart(msg, match));
    this.bot.onText(/\/help/, (msg) => this.handleHelp(msg));
    this.bot.onText(/\/status (.+)/, (msg, match) => this.handleStatus(msg, match));
    this.bot.onText(/\/mytickets/, (msg) => this.handleMyTickets(msg));
    this.bot.onText(/\/cancel/, (msg) => this.handleCancel(msg));
    
    // Команды для администраторов
    this.bot.onText(/\/register (.+)/, (msg, match) => this.handleAdminRegister(msg, match));
    this.bot.onText(/\/stats/, (msg) => this.handleAdminStats(msg));
    this.bot.onText(/\/active/, (msg) => this.handleShowActiveTickets(msg));
    
    // Callback queries (для inline кнопок)
    this.bot.on('callback_query', (query) => this.handleCallbackQuery(query));
    
    // Обычные сообщения
    this.bot.on('message', (msg) => {
      if (!msg.text || msg.text.startsWith('/')) return;
      this.handleMessage(msg);
    });
    
    // Фото и документы
    this.bot.on('photo', (msg) => this.handlePhoto(msg));
    this.bot.on('document', (msg) => this.handleDocument(msg));
    
    // Обработка ошибок
    this.bot.on('polling_error', (error) => {
      console.error('Telegram polling error:', error);
    });
  }

  // Загрузка списка администраторов
  async loadAdminList() {
    try {
      const [admins] = await pool.query(
        `SELECT telegram_chat_id, role, first_name, last_name 
         FROM users 
         WHERE role IN ('admin', 'moderator') 
         AND telegram_chat_id IS NOT NULL 
         AND is_active = 1`
      );

      this.adminChatIds = admins
        .filter(u => u.role === 'admin')
        .map(u => u.telegram_chat_id);
        
      this.moderatorChatIds = admins
        .filter(u => u.role === 'moderator')
        .map(u => u.telegram_chat_id);

      console.log(`Загружено ${this.adminChatIds.length} админов и ${this.moderatorChatIds.length} модераторов для уведомлений`);
    } catch (error) {
      console.error('Ошибка загрузки списка администраторов:', error);
    }
  }

  // Приветствие с главным меню
  async handleStart(msg, match) {
    const chatId = msg.chat.id;
    const userName = msg.from.first_name || 'Пользователь';
    
    // Проверяем, есть ли данные после команды /start
    if (match && match[1] && match[1].trim()) {
      // Это данные заявки, переданные через URL
      const encodedData = match[1].trim();
      try {
        const decodedMessage = decodeURIComponent(encodedData);
        // Имитируем обычное сообщение с данными заявки
        await this.handleQuickTicket({ ...msg, text: decodedMessage });
        return;
      } catch (error) {
        console.error('Ошибка декодирования данных заявки:', error);
      }
    }
    
    const welcomeText = `
🏗️ *Қош келдіңіз, ${userName}!*
_Добро пожаловать в службу поддержки Алатау Строй Инвест_

Мен сізге техникалық қолдау қызметімен байланысуға көмектесемін.
_Я помогу вам связаться с нашей службой технической поддержки._

📋 *Не істей аласыз / Что вы можете сделать:*
• Жаңа өтініш жасау / Создать новую заявку
• Өтініш күйін тексеру / Проверить статус заявки
• Жиі қойылатын сұрақтар / Частые вопросы
• Менеджермен байланысу / Связаться с менеджером

Төменде пәрмендерді таңдаңыз:
_Выберите команду ниже:_`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📝 Жаңа өтініш / Новая заявка', callback_data: 'new_ticket' }
        ],
        [
          { text: '📊 Менің өтініштерім / Мои заявки', callback_data: 'my_tickets' },
          { text: '🔍 Күйді тексеру / Проверить статус', callback_data: 'check_status' }
        ],
        [
          { text: '🚨 Шұғыл / Срочная помощь', callback_data: 'urgent_help' },
          { text: '📋 Жиі сұрақтар / FAQ', callback_data: 'faq' }
        ],
        [
          { text: '❓ Көмек / Помощь', callback_data: 'help' },
          { text: '☎️ Байланыс / Контакты', callback_data: 'contacts' }
        ],
        [
          { text: '🌐 Веб-сайт / Веб-сайт', url: process.env.FRONTEND_URL || 'http://localhost:5173' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, welcomeText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  // Обработка callback кнопок
  async handleCallbackQuery(query) {
    const chatId = query.message.chat.id;
    const data = query.data;

    // Отвечаем на callback чтобы убрать "часики"
    await this.bot.answerCallbackQuery(query.id);

    // Обработка админских действий
    if (data.startsWith('admin_')) {
      await this.handleAdminCallback(query);
      return;
    }

    switch (data) {
      case 'new_ticket':
        await this.startTicketCreation(chatId);
        break;
      case 'my_tickets':
        await this.showMyTickets(chatId, query.from.id);
        break;
      case 'check_status':
        await this.askForTicketId(chatId);
        break;
      case 'urgent_help':
        await this.showUrgentHelp(chatId);
        break;
      case 'faq':
        await this.showFAQ(chatId);
        break;
      case 'help':
        await this.showHelp(chatId);
        break;
      case 'contacts':
        await this.showContacts(chatId);
        break;
      case 'main_menu':
        await this.handleStart(query.message, []);
        break;
      case 'urgent_ticket':
        await this.startUrgentTicketCreation(chatId);
        break;
      case 'ask_question':
        await this.startQuestionMode(chatId);
        break;
      default:
        if (data.startsWith('priority_')) {
          await this.selectPriority(chatId, data.replace('priority_', ''));
        } else if (data.startsWith('type_')) {
          await this.selectType(chatId, data.replace('type_', ''));
        } else if (data.startsWith('reply_')) {
          await this.handleReplyCallback(query);
        } else if (data.startsWith('status_')) {
          await this.handleStatusCallback(query);
        }
    }
  }

  // Начало создания заявки
  async startTicketCreation(chatId) {
    this.userStates.set(chatId, {
      step: 'awaiting_subject',
      ticketData: {}
    });

    const text = `
📝 *Жаңа өтініш жасау / Создание новой заявки*

Сұрақтарға жауап беріңіз:
_Пожалуйста, ответьте на вопросы:_

1️⃣ *Өтініш тақырыбын жазыңыз / Укажите тему заявки:*
_Мысалы / Например: "Принтер жұмыс істемейді" / "Не работает принтер"_`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '❌ Жабу / Отменить', callback_data: 'main_menu' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, text, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  // Создание срочной заявки
  async startUrgentTicketCreation(chatId) {
    this.userStates.set(chatId, {
      step: 'awaiting_subject',
      ticketData: { priority: 'urgent' }
    });

    const text = `
🚨 *ШҰҒЫЛ ӨТІНІШ / СРОЧНАЯ ЗАЯВКА*

⚠️ *Назарағар / Внимание:* Бұл шұғыл көмек үшін / Это для срочной помощи

Сұрақтарға жауап беріңіз:
_Пожалуйста, ответьте на вопросы:_

1️⃣ *Не болды? Мәселені қысқаша жазыңыз / Что случилось? Кратко опишите проблему:*`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📞 Қоңырау шалу / Позвонить', url: 'tel:+77770131838' }
        ],
        [
          { text: '❌ Жабу / Отменить', callback_data: 'main_menu' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, text, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  // Режим быстрых вопросов
  async startQuestionMode(chatId) {
    this.userStates.set(chatId, {
      step: 'awaiting_question',
      mode: 'question'
    });

    const text = `
💬 *СҰРАҚ ҚОЮ / ЗАДАТЬ ВОПРОС*

Сіздің сұрағыңызды жазыңыз, біз тез жауап береміз:
_Напишите ваш вопрос, мы быстро ответим:_

📝 *Мысалдар / Примеры:*
• "Принтер жұмыс істемейді" / "Принтер не работает"
• "Интернет баяу" / "Интернет медленный"  
• "Компьютер қосылмайды" / "Компьютер не включается"
• "Құпия сөзді ұмыттым" / "Забыл пароль"

_Немесе дереу қоңырау шалыңыз:_
_Или позвоните прямо сейчас:_`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📞 Дереу қоңырау / Позвонить сейчас', url: 'tel:+77770131838' }
        ],
        [
          { text: '❌ Жабу / Отменить', callback_data: 'main_menu' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, text, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  // Обработка сообщений в зависимости от состояния
  async handleMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userState = this.userStates.get(chatId);

    if (!userState) {
      // Если нет активного состояния, предполагаем что это новая заявка
      await this.handleQuickTicket(msg);
      return;
    }

    switch (userState.step) {
      case 'awaiting_question':
        if (userState.mode === 'question') {
          await this.handleQuickQuestion(chatId, text, msg.from.id);
          return;
        }
        break;

      case 'awaiting_subject':
        userState.ticketData.subject = text;
        userState.step = 'awaiting_description';
        await this.bot.sendMessage(chatId, '2️⃣ *Мәселені толық сипаттаңыз / Подробно опишите проблему:*', { parse_mode: 'Markdown' });
        break;

      case 'awaiting_description':
        userState.ticketData.description = text;
        userState.step = 'awaiting_name';
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: '❌ Жабу / Отменить', callback_data: 'main_menu' }
            ]
          ]
        };
        
        await this.bot.sendMessage(chatId, '3️⃣ *Аты-жөніңіз / Ваше ФИО:*', { 
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        break;

      case 'awaiting_name':
        userState.ticketData.name = text;
        userState.step = 'awaiting_email';
        await this.bot.sendMessage(chatId, '4️⃣ *Email мекенжайыңыз / Ваш email:*', { parse_mode: 'Markdown' });
        break;

      case 'awaiting_email':
        if (!this.validateEmail(text)) {
          await this.bot.sendMessage(chatId, '❌ Дұрыс email енгізіңіз / Введите корректный email');
          return;
        }
        userState.ticketData.email = text;
        userState.step = 'awaiting_phone';
        await this.bot.sendMessage(chatId, '5️⃣ *Телефон нөміріңіз / Ваш телефон:*\n_(міндетті емес / необязательно - жіберу үшін "-" енгізіңіз / введите "-" чтобы пропустить)_', { parse_mode: 'Markdown' });
        break;

      case 'awaiting_phone':
        if (text !== '-' && text !== 'жоқ' && text !== 'нет') {
          userState.ticketData.phone = text;
        }
        userState.step = 'awaiting_type';
        await this.showTypeSelection(chatId);
        break;


      case 'replying':
        // Пользователь отвечает на сообщение от поддержки
        await this.processUserReply(chatId, text, userState.ticketId);
        break;

      case 'admin_replying':
        // Администратор отвечает пользователю
        await this.processAdminReply(chatId, text, userState.ticketId, userState.adminId, userState.adminName);
        break;

      case 'awaiting_confirmation':
        if (text.toLowerCase() === 'иә' || text.toLowerCase() === 'да') {
          await this.createTicket(chatId, userState.ticketData, msg.from.id);
        } else {
          await this.bot.sendMessage(chatId, '❌ Өтініш жасаудан бас тартылды / Создание заявки отменено');
          this.userStates.delete(chatId);
        }
        break;

      case 'awaiting_ticket_id':
        await this.checkTicketStatus(chatId, text);
        this.userStates.delete(chatId);
        break;
    }

    this.userStates.set(chatId, userState);
  }

  // Показ типов заявок
  async showTypeSelection(chatId) {
    const types = [
      { id: 'support_request', name: '🔧 Сұрау / Запрос' },
      { id: 'complaint', name: '📋 Шағым / Жалоба' },
      { id: 'incident', name: '🚨 Инцидент / Инцидент' }
    ];

    const keyboard = {
      inline_keyboard: types.map(type => [{
        text: type.name,
        callback_data: `type_${type.id}`
      }])
    };

    await this.bot.sendMessage(chatId, '6️⃣ *Өтініш түрін таңдаңыз / Выберите тип заявки:*', {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  // Выбор типа заявки
  async selectType(chatId, typeId) {
    const userState = this.userStates.get(chatId);
    if (!userState) return;

    userState.ticketData.type = typeId;
    userState.step = 'awaiting_priority';
    
    await this.showPrioritySelection(chatId);
  }

  // Показ приоритетов
  async showPrioritySelection(chatId) {
    const priorities = [
      { id: 'low', name: '🟢 Төмен / Низкий' },
      { id: 'medium', name: '🟡 Орташа / Средний' },
      { id: 'high', name: '🟠 Жоғары / Высокий' },
      { id: 'urgent', name: '🔴 Шұғыл / Срочный' }
    ];

    const keyboard = {
      inline_keyboard: priorities.map(priority => [{
        text: priority.name,
        callback_data: `priority_${priority.id}`
      }])
    };

    await this.bot.sendMessage(chatId, '7️⃣ *Басымдылық / Приоритет:*', {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  // Выбор приоритета
  async selectPriority(chatId, priorityId) {
    const userState = this.userStates.get(chatId);
    if (!userState) return;

    userState.ticketData.priority = priorityId;
    userState.step = 'awaiting_confirmation';
    
    await this.showTicketSummary(chatId, userState.ticketData);
  }

  // Показ итоговой информации
  async showTicketSummary(chatId, ticketData) {
    const summary = `
✅ *Өтініш мәліметтері / Данные заявки:*

👤 *Аты-жөні / ФИО:* ${ticketData.name}
📧 *Email:* ${ticketData.email}
📱 *Телефон:* ${ticketData.phone || 'Көрсетілмеген / Не указан'}
📋 *Тақырып / Тема:* ${ticketData.subject}
🏷️ *Түрі / Тип:* ${this.getTypeName(ticketData.type)}
📝 *Сипаттама / Описание:* 
${ticketData.description}
⚡ *Басымдылық / Приоритет:* ${this.getPriorityName(ticketData.priority)}

*Растайсыз ба? / Подтвердить?*
Жауап беріңіз: *Иә/Да* немесе *Жоқ/Нет*`;

    await this.bot.sendMessage(chatId, summary, { parse_mode: 'Markdown' });
  }

  // Создание заявки
  async createTicket(chatId, ticketData, telegramUserId) {
    try {
      // Создаем заявку в БД
      const [result] = await pool.query(
        `INSERT INTO tickets (subject, description, type, priority, status, metadata, requester_metadata, user_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ticketData.subject,
          ticketData.description,
          ticketData.type || 'support_request',
          ticketData.priority,
          'new',
          JSON.stringify({
            source: 'telegram',
            telegram_chat_id: chatId,
            telegram_user_id: telegramUserId
          }),
          JSON.stringify({
            name: ticketData.name,
            email: ticketData.email,
            phone: ticketData.phone
          }),
          null
        ]
      );

      const ticketId = result.insertId;

      // Получаем созданную заявку
      const [ticketRows] = await pool.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
      const ticket = ticketRows[0];

      // Отправляем email уведомление
      if (ticketData.email) {
        await sendTicketCreationNotification(ticketData.email, ticket);
      }

      // Отправляем подтверждение в Telegram
      const successMessage = `
✅ *Өтініш сәтті тіркелді! / Заявка успешно создана!*

🎫 *Өтініш нөмірі / Номер заявки:* #${ticketId}
📧 *Email-ге хабарлама жіберілді / Уведомление отправлено на email*

Өтініш күйін тексеру үшін:
_Для проверки статуса заявки:_
/status ${ticketId}

💬 *Қосымша ақпарат қажет болса, біз сізге хабарласамыз*
_Если потребуется дополнительная информация, мы свяжемся с вами_`;

      await this.bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });

      // Уведомляем администраторов
      await this.notifyAdminsNewTicket(ticket, ticketData);

      // Очищаем состояние
      this.userStates.delete(chatId);

    } catch (error) {
      console.error('Ошибка создания заявки через Telegram:', error);
      await this.bot.sendMessage(chatId, '❌ Қате пайда болды. Кейінірек қайталап көріңіз / Произошла ошибка. Попробуйте позже');
    }
  }

  // Быстрое создание заявки (из сообщения с frontend)
  async handleQuickTicket(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Проверяем, содержит ли сообщение структурированные данные
    if (text.includes('НОВАЯ ЗАЯВКА В СЛУЖБУ ПОДДЕРЖКИ') || text.includes('ЖАҢА ӨТІНІШ')) {
      try {
        // Парсим данные из сообщения
        const ticketData = this.parseTicketMessage(text);
        
        // Создаем заявку
        await this.createTicketFromParsedData(chatId, ticketData, msg.from.id);
        
      } catch (error) {
        console.error('Ошибка парсинга заявки:', error);
        await this.startTicketCreation(chatId);
      }
    } else {
      // Обычное сообщение - начинаем процесс создания заявки
      await this.bot.sendMessage(chatId, 
        'Сіз жаңа өтініш жасағыңыз келе ме? / Вы хотите создать новую заявку?\n\n' +
        'Үшін /start басыңыз / Нажмите /start для начала'
      );
    }
  }

  // Парсинг структурированного сообщения
  parseTicketMessage(text) {
    const data = {};
    
    // Извлекаем данные с помощью регулярных выражений
    const patterns = {
      name: /(?:Сотрудник|Қызметкер):\s*(.+?)(?:\n|$)/,
      email: /Email:\s*(.+?)(?:\n|$)/,
      phone: /(?:Телефон|Телефон):\s*(.+?)(?:\n|$)/,
      subject: /(?:Тема обращения|Өтініш тақырыбы):\s*(.+?)(?:\n|$)/,
      type: /(?:Тип заявки|Өтініш түрі):\s*(.+?)(?:\n|$)/,
      priority: /(?:Приоритет|Басымдылық):\s*(.+?)(?:\n|$)/,
      description: /(?:Описание проблемы|Мәселе сипаттамасы):\s*([\s\S]+?)(?:\n\n|$)/
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        data[key] = match[1].trim();
      }
    }

    // Преобразуем приоритет
    if (data.priority) {
      const priorityMap = {
        'Низкий': 'low',
        'Төмен': 'low',
        'Средний': 'medium',
        'Орташа': 'medium',
        'Высокий': 'high',
        'Жоғары': 'high',
        'Срочный': 'urgent',
        'Шұғыл': 'urgent'
      };
      data.priority = priorityMap[data.priority] || 'medium';
    }

    return data;
  }

  // Обработка быстрого вопроса
  async handleQuickQuestion(chatId, questionText, telegramUserId) {
    try {
      // Создаем заявку с типом "вопрос"
      const [result] = await pool.query(
        `INSERT INTO tickets (subject, description, type, priority, status, metadata, requester_metadata) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          `Сұрақ / Вопрос: ${questionText.substring(0, 50)}...`,
          questionText,
          'support_request',
          'medium',
          'new',
          JSON.stringify({
            source: 'telegram_question',
            telegram_chat_id: chatId,
            telegram_user_id: telegramUserId,
            quick_question: true
          }),
          JSON.stringify({
            name: `Telegram User ${telegramUserId}`,
            telegram_username: `@telegram_user_${telegramUserId}`
          })
        ]
      );

      const ticketId = result.insertId;

      // Уведомляем пользователя
      const confirmMessage = `
💬 *Сұрағыңыз қабылданды / Ваш вопрос принят!*

🎫 *Өтініш нөмірі / Номер заявки:* #${ticketId}

📝 *Сұрағыңыз / Ваш вопрос:*
${questionText}

⏱️ *Орташа жауап уақыты / Среднее время ответа:* 30 минут - 2 сағат / часа

_Біз сізбен тез арада байланысамыз_
_Мы свяжемся с вами в ближайшее время_`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📊 Күйді көру / Статус', callback_data: `status_${ticketId}` }
          ],
          [
            { text: '💬 Басқа сұрақ / Другой вопрос', callback_data: 'ask_question' },
            { text: '🏠 Басты мәзір / Главное меню', callback_data: 'main_menu' }
          ]
        ]
      };

      await this.bot.sendMessage(chatId, confirmMessage, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      // Уведомляем администраторов
      await this.notifyAdminsQuickQuestion(ticketId, questionText, telegramUserId);

      // Очищаем состояние
      this.userStates.delete(chatId);

    } catch (error) {
      console.error('Ошибка обработки быстрого вопроса:', error);
      await this.bot.sendMessage(chatId, '❌ Қате пайда болды / Произошла ошибка');
    }
  }

  // Уведомление администраторов о быстром вопросе
  async notifyAdminsQuickQuestion(ticketId, questionText, telegramUserId) {
    try {
      const message = `
💬 *ЖЫЛДАМ СҰРАҚ / БЫСТРЫЙ ВОПРОС #${ticketId}*

👤 *Пайдаланушы / Пользователь:* Telegram User ${telegramUserId}
📱 *Көзі / Источник:* Telegram (Быстрый вопрос)

❓ *Сұрақ / Вопрос:*
${questionText}

⚡ *Бұл жылдам сұрақ - тез жауап күтеді*
*Это быстрый вопрос - ожидает быстрого ответа*`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '💬 Жауап беру / Ответить', callback_data: `admin_reply_${ticketId}` },
            { text: '👁 Қарау / Просмотреть', callback_data: `admin_view_${ticketId}` }
          ],
          [
            { text: '✋ Қабылдау / Принять', callback_data: `admin_take_${ticketId}` }
          ]
        ]
      };

      // Отправляем всем администраторам
      const allAdmins = [...this.adminChatIds, ...this.moderatorChatIds];
      
      for (const chatId of allAdmins) {
        try {
          await this.bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
          });
        } catch (error) {
          console.error(`Не удалось отправить уведомление админу ${chatId}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Ошибка уведомления админов о быстром вопросе:', error);
    }
  }

  // Создание заявки из распарсенных данных
  async createTicketFromParsedData(chatId, ticketData, telegramUserId) {
    try {
      // Обновляем статус заявки если она была создана через веб-форму
      const [pendingTickets] = await pool.query(
        `SELECT id FROM tickets 
         WHERE status = 'telegram_pending' 
         AND JSON_EXTRACT(metadata, '$.communicationChannel') = 'telegram'
         AND created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
         ORDER BY created_at DESC LIMIT 1`
      );

      let ticketId;
      
      if (pendingTickets.length > 0) {
        // Обновляем существующую заявку
        ticketId = pendingTickets[0].id;
        await pool.query(
          `UPDATE tickets 
           SET status = 'new',
               metadata = JSON_SET(metadata, 
                 '$.telegram_chat_id', ?,
                 '$.telegram_user_id', ?,
                 '$.telegram_confirmed', true
               )
           WHERE id = ?`,
          [chatId, telegramUserId, ticketId]
        );
      } else {
        // Создаем новую заявку
        const [result] = await pool.query(
          `INSERT INTO tickets (subject, description, type, priority, status, metadata, requester_metadata) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            ticketData.subject || 'Заявка из Telegram',
            ticketData.description || ticketData.subject,
            ticketData.type || 'support_request',
            ticketData.priority || 'medium',
            'new',
            JSON.stringify({
              source: 'telegram',
              telegram_chat_id: chatId,
              telegram_user_id: telegramUserId
            }),
            JSON.stringify({
              name: ticketData.name,
              email: ticketData.email,
              phone: ticketData.phone
            })
          ]
        );
        ticketId = result.insertId;
      }

      const confirmMessage = `
✅ *Өтініш қабылданды! / Заявка принята!*

🎫 *Өтініш нөмірі / Номер заявки:* #${ticketId}
📧 *Email:* ${ticketData.email}

📊 *Күй / Статус:* Жаңа / Новая
⏱️ *Орташа өңдеу уақыты / Среднее время обработки:* 2-4 сағат / часа

_Біз сізбен жақын арада байланысамыз_
_Мы свяжемся с вами в ближайшее время_

/status ${ticketId} - күйді тексеру / проверить статус`;

      await this.bot.sendMessage(chatId, confirmMessage, { parse_mode: 'Markdown' });

      // Уведомляем администраторов
      const [tickets] = await pool.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
      if (tickets.length > 0) {
        await this.notifyAdminsNewTicket(tickets[0], ticketData);
      }

    } catch (error) {
      console.error('Ошибка создания заявки:', error);
      await this.bot.sendMessage(chatId, '❌ Қате пайда болды / Произошла ошибка');
    }
  }

  // Отправка уведомлений администраторам о новой заявке
  async notifyAdminsNewTicket(ticket, ticketData) {
    const priorityEmoji = {
      'low': '🟢',
      'medium': '🟡', 
      'high': '🟠',
      'urgent': '🔴'
    };

    const message = `
${priorityEmoji[ticket.priority]} *ЖАҢА ӨТІНІШ / НОВАЯ ЗАЯВКА #${ticket.id}*

👤 *Қызметкер / Сотрудник:* ${ticketData.name}
📧 *Email:* ${ticketData.email}
📱 *Телефон:* ${ticketData.phone || 'Көрсетілмеген / Не указан'}

📋 *Тақырып / Тема:* ${ticket.subject}
⚡ *Басымдылық / Приоритет:* ${this.getPriorityName(ticket.priority)}

📝 *Сипаттама / Описание:*
${ticket.description}

⏰ *Уақыт / Время:* ${new Date().toLocaleString('kk-KZ')}
📱 *Көзі / Источник:* Telegram`;

    // Inline кнопки для быстрых действий
    const keyboard = {
      inline_keyboard: [
        [
          { text: '👁 Қарау / Просмотреть', callback_data: `admin_view_${ticket.id}` },
          { text: '✋ Қабылдау / Принять', callback_data: `admin_take_${ticket.id}` }
        ],
        [
          { text: '📊 Барлық өтініштер / Все заявки', url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/tickets` }
        ]
      ]
    };

    // Отправляем всем администраторам
    const allAdmins = [...this.adminChatIds, ...this.moderatorChatIds];
    
    for (const chatId of allAdmins) {
      try {
        await this.bot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } catch (error) {
        console.error(`Не удалось отправить уведомление админу ${chatId}:`, error.message);
      }
    }
  }

  // Обработка действий администратора
  async handleAdminCallback(query) {
    const chatId = query.message.chat.id;
    const data = query.data;
    const adminId = query.from.id;

    if (data.startsWith('admin_view_')) {
      const ticketId = data.replace('admin_view_', '');
      await this.showTicketDetailsForAdmin(chatId, ticketId);
      
    } else if (data.startsWith('admin_take_')) {
      const ticketId = data.replace('admin_take_', '');
      await this.assignTicketToAdmin(chatId, ticketId, adminId);
      
    } else if (data.startsWith('admin_reply_')) {
      const ticketId = data.replace('admin_reply_', '');
      await this.startAdminReply(chatId, ticketId, adminId);
    }
  }

  // Показать детали заявки для админа
  async showTicketDetailsForAdmin(chatId, ticketId) {
    try {
      const [tickets] = await pool.query(
        `SELECT t.*, u.email as user_email, u.first_name as user_first_name, u.last_name as user_last_name
         FROM tickets t 
         LEFT JOIN users u ON t.user_id = u.id 
         WHERE t.id = ?`,
        [ticketId]
      );

      if (tickets.length === 0) {
        await this.bot.sendMessage(chatId, `❌ Өтініш #${ticketId} табылмады / Заявка #${ticketId} не найдена`);
        return;
      }

      const ticket = tickets[0];
      let requesterInfo = {};
      
      if (ticket.requester_metadata) {
        try {
          requesterInfo = JSON.parse(ticket.requester_metadata);
        } catch (e) {
          console.error('Ошибка парсинга requester_metadata:', e);
        }
      }

      const statusEmoji = {
        'new': '🆕',
        'in_progress': '⏳',
        'pending': '⏸️',
        'resolved': '✅',
        'closed': '🔒'
      };

      const message = `
${statusEmoji[ticket.status] || '📋'} *ӨТІНІШ / ЗАЯВКА #${ticketId}*

👤 *Өтініш беруші / Заявитель:* ${requesterInfo.name || 'Белгісіз / Неизвестно'}
📧 *Email:* ${requesterInfo.email || ticket.user_email || 'Жоқ / Нет'}
📱 *Телефон:* ${requesterInfo.phone || 'Көрсетілмеген / Не указан'}

📋 *Тақырып / Тема:* ${ticket.subject}
📝 *Сипаттама / Описание:*
${ticket.description}

⚡ *Басымдылық / Приоритет:* ${this.getPriorityName(ticket.priority)}
📊 *Күй / Статус:* ${this.getStatusName(ticket.status)}

📅 *Құрылған / Создана:* ${new Date(ticket.created_at).toLocaleString('kk-KZ')}
🔄 *Жаңартылған / Обновлена:* ${new Date(ticket.updated_at).toLocaleString('kk-KZ')}

${ticket.assigned_to ? `👤 *Орындаушы / Исполнитель:* ID ${ticket.assigned_to}` : '❗ *Орындаушы тағайындалмаған / Исполнитель не назначен*'}`;

      const keyboard = {
        inline_keyboard: [
          ticket.assigned_to ? [] : [{ text: '✋ Қабылдау / Принять заявку', callback_data: `admin_take_${ticketId}` }],
          [
            { text: '📱 Веб-интерфейсте ашу / Открыть в веб-интерфейсе', url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/tickets/${ticketId}` }
          ]
        ].filter(row => row.length > 0)
      };

      await this.bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

    } catch (error) {
      console.error('Ошибка показа деталей заявки:', error);
      await this.bot.sendMessage(chatId, '❌ Қате пайда болды / Произошла ошибка');
    }
  }

  // Назначение заявки администратору
  async assignTicketToAdmin(chatId, ticketId, adminTelegramId) {
    try {
      // Найдем user_id администратора по telegram_id
      const [adminUser] = await pool.query(
        'SELECT id, first_name, last_name FROM users WHERE telegram_chat_id = ?',
        [adminTelegramId]
      );

      if (adminUser.length === 0) {
        await this.bot.sendMessage(chatId, '❌ Сіздің аккаунтыңыз табылмады / Ваш аккаунт не найден\n\nТіркелу үшін / Для регистрации: /register [token]');
        return;
      }

      const admin = adminUser[0];

      // Обновляем заявку
      await pool.query(
        'UPDATE tickets SET assigned_to = ?, status = ? WHERE id = ?',
        [admin.id, 'in_progress', ticketId]
      );

      // Отправляем подтверждение
      await this.bot.sendMessage(chatId, 
        `✅ Өтініш #${ticketId} сізге тағайындалды / Заявка #${ticketId} назначена на вас\n` +
        `👤 ${admin.first_name} ${admin.last_name}`
      );

      // Уведомляем пользователя который создал заявку
      await this.notifyUserTicketAssigned(ticketId, admin);

    } catch (error) {
      console.error('Ошибка назначения заявки:', error);
      await this.bot.sendMessage(chatId, '❌ Қате пайда болды / Произошла ошибка');
    }
  }

  // Уведомление пользователя о назначении исполнителя
  async notifyUserTicketAssigned(ticketId, admin) {
    try {
      const [tickets] = await pool.query(
        'SELECT metadata FROM tickets WHERE id = ?',
        [ticketId]
      );

      if (tickets.length > 0) {
        const metadata = JSON.parse(tickets[0].metadata);
        if (metadata.telegram_chat_id) {
          const message = `
📬 *Өтініш жаңартылды / Заявка обновлена #${ticketId}*

👤 *Орындаушы тағайындалды / Назначен исполнитель:*
${admin.first_name} ${admin.last_name}

📊 *Күй / Статус:* Өңделуде / В работе

_Біз сізбен жақын арада байланысамыз_
_Мы свяжемся с вами в ближайшее время_`;

          await this.bot.sendMessage(metadata.telegram_chat_id, message, {
            parse_mode: 'Markdown'
          });
        }
      }
    } catch (error) {
      console.error('Ошибка уведомления пользователя:', error);
    }
  }

  // Начать ответ администратора на заявку
  async startAdminReply(chatId, ticketId, adminTelegramId) {
    try {
      // Проверяем, является ли пользователь администратором
      const [adminUser] = await pool.query(
        'SELECT id, first_name, last_name, role FROM users WHERE telegram_chat_id = ?',
        [adminTelegramId]
      );

      if (adminUser.length === 0 || !['admin', 'moderator', 'staff'].includes(adminUser[0].role)) {
        await this.bot.sendMessage(chatId, '❌ Сізде бұл әрекетті орындауға рұқсат жоқ / У вас нет прав для этого действия');
        return;
      }

      // Устанавливаем состояние для ответа администратора
      this.userStates.set(chatId, {
        step: 'admin_replying',
        ticketId: ticketId,
        adminId: adminUser[0].id,
        adminName: `${adminUser[0].first_name} ${adminUser[0].last_name}`
      });

      const replyMessage = `
💬 *Өтініш #${ticketId} үшін жауап / Ответ на заявку #${ticketId}*

Пайдаланушыға жіберетін хабарламаңызды жазыңыз:
_Напишите сообщение для отправки пользователю:_

📝 *Кеңестер / Советы:*
• Анық және түсінікті болыңыз / Будьте четкими и понятными
• Қосымша ақпарат сұраңыз / Запросите дополнительную информацию
• Шешімді ұсыныңыз / Предложите решение

Болдырмау үшін /cancel командасын пайдаланыңыз
_Для отмены используйте команду /cancel_`;

      await this.bot.sendMessage(chatId, replyMessage, { 
        parse_mode: 'Markdown' 
      });

    } catch (error) {
      console.error('Ошибка начала ответа администратора:', error);
      await this.bot.sendMessage(chatId, '❌ Қате пайда болды / Произошла ошибка');
    }
  }

  // Команда для регистрации администратора
  async handleAdminRegister(msg, match) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username;

    if (!match || !match[1]) {
      await this.bot.sendMessage(chatId, 
        'Пайдалану / Использование: /register [токен]\n' +
        'Токенді жүйе әкімшісінен алыңыз / Получите токен у системного администратора'
      );
      return;
    }

    const token = match[1];

    try {
      // Проверяем токен в БД
      const [users] = await pool.query(
        'SELECT id, role, first_name, last_name FROM users WHERE registration_token = ? AND is_active = 1',
        [token]
      );

      if (users.length === 0) {
        await this.bot.sendMessage(chatId, '❌ Жарамсыз токен / Недействительный токен');
        return;
      }

      const user = users[0];

      // Обновляем telegram_chat_id
      await pool.query(
        'UPDATE users SET telegram_chat_id = ?, telegram_username = ?, registration_token = NULL WHERE id = ?',
        [telegramId, username, user.id]
      );

      // Перезагружаем список администраторов
      await this.loadAdminList();

      await this.bot.sendMessage(chatId, 
        `✅ *Тіркелу сәтті аяқталды / Регистрация успешна!*\n\n` +
        `👤 *Аты-жөні / ФИО:* ${user.first_name} ${user.last_name}\n` +
        `🔑 *Рөл / Роль:* ${user.role}\n\n` +
        `Енді сіз жаңа өтініштер туралы хабарлама аласыз!\n` +
        `Теперь вы будете получать уведомления о новых заявках!`,
        { parse_mode: 'Markdown' }
      );

    } catch (error) {
      console.error('Ошибка регистрации:', error);
      await this.bot.sendMessage(chatId, '❌ Қате пайда болды / Произошла ошибка');
    }
  }

  // Проверка статуса заявки
  async handleStatus(msg, match) {
    const chatId = msg.chat.id;
    const ticketId = match[1];
    await this.checkTicketStatus(chatId, ticketId);
  }

  async checkTicketStatus(chatId, ticketId) {
    try {
      const [tickets] = await pool.query(
        `SELECT * FROM tickets WHERE id = ?`,
        [ticketId]
      );

      if (tickets.length === 0) {
        await this.bot.sendMessage(chatId, `❌ Өтініш #${ticketId} табылмады / Заявка #${ticketId} не найдена`);
        return;
      }

      const ticket = tickets[0];
      const statusEmoji = {
        'new': '🆕',
        'in_progress': '⏳',
        'pending': '⏸️',
        'resolved': '✅',
        'closed': '🔒'
      };

      const message = `
${statusEmoji[ticket.status] || '📋'} *Өтініш #${ticketId}*

📝 *Тақырып / Тема:* ${ticket.subject}
📊 *Күй / Статус:* ${this.getStatusName(ticket.status)}
📅 *Құрылған / Создана:* ${new Date(ticket.created_at).toLocaleString('kk-KZ')}
🔄 *Жаңартылған / Обновлена:* ${new Date(ticket.updated_at).toLocaleString('kk-KZ')}

${ticket.assigned_to ? `👤 *Орындаушы / Исполнитель:* ID ${ticket.assigned_to}` : ''}
${ticket.status === 'resolved' ? '\n✅ *Мәселе шешілді / Проблема решена*' : ''}`;

      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Ошибка проверки статуса:', error);
      await this.bot.sendMessage(chatId, '❌ Қате пайда болды / Произошла ошибка');
    }
  }

  // Показ заявок пользователя
  async showMyTickets(chatId, telegramUserId) {
    try {
      const [tickets] = await pool.query(
        `SELECT * FROM tickets 
         WHERE JSON_EXTRACT(metadata, '$.telegram_user_id') = ?
         OR JSON_EXTRACT(metadata, '$.telegram_chat_id') = ?
         ORDER BY created_at DESC
         LIMIT 10`,
        [telegramUserId.toString(), chatId.toString()]
      );

      if (tickets.length === 0) {
        await this.bot.sendMessage(chatId, 'Сізде өтініштер жоқ / У вас нет заявок');
        return;
      }

      let message = '*📋 Сіздің өтініштеріңіз / Ваши заявки:*\n\n';
      
      for (const ticket of tickets) {
        const statusEmoji = {
          'new': '🆕',
          'in_progress': '⏳',
          'pending': '⏸️',
          'resolved': '✅',
          'closed': '🔒'
        }[ticket.status] || '📋';

        message += `${statusEmoji} #${ticket.id} - ${ticket.subject}\n`;
        message += `_${new Date(ticket.created_at).toLocaleDateString('ru-RU')}_\n\n`;
      }

      message += '_Күйді тексеру үшін / Для проверки статуса:_ /status [номер]';

      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Ошибка получения заявок:', error);
      await this.bot.sendMessage(chatId, '❌ Қате пайда болды / Произошла ошибка');
    }
  }

  // Помощь
  async showHelp(chatId) {
    const helpText = `
❓ *Көмек / Помощь*

📌 *Негізгі командалар / Основные команды:*
/start - Басты мәзір / Главное меню
/help - Көмек / Помощь
/status [номер] - Өтініш күйін тексеру / Проверить статус заявки
/mytickets - Менің өтініштерім / Мои заявки
/cancel - Әрекетті тоқтату / Отменить действие

📝 *Өтініш жасау / Создание заявки:*
1. /start командасын жіберіңіз / Отправьте команду /start
2. "Жаңа өтініш" батырмасын басыңыз / Нажмите "Новая заявка"
3. Барлық сұрақтарға жауап беріңіз / Ответьте на все вопросы
4. Өтінішті растаңыз / Подтвердите заявку

💡 *Кеңестер / Советы:*
• Мәселені толық сипаттаңыз / Подробно опишите проблему
• Скриншоттар қосыңыз / Прикрепляйте скриншоты
• Дұрыс байланыс ақпаратын көрсетіңіз / Указывайте корректные контакты`;

    await this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
  }

  // Контакты
  async showContacts(chatId) {
    const contactsText = `
☎️ *Байланыс ақпараты / Контактная информация*

🏢 *Алатау Строй Инвест*

📞 *Телефон / Телефон:*
+7 (727) 355-00-00

📧 *Email:*
it-support@alataustroyinvest.kz

🕐 *Жұмыс уақыты / Рабочее время:*
Дүйсенбі-Жұма / Пн-Пт: 8:00 - 18:00
Сенбі / Сб: 9:00 - 13:00

🆘 *Тәулік бойы IT қолдау / Круглосуточная IT поддержка:*
+7 (777) 013-1838

📍 *Мекенжай / Адрес:*
Қазақстан, Алматы қ., Қ.Әзірбаев к., 161б
Казахстан, г. Алматы, ул. К. Азербаева, 161б`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📞 Дереу қоңырау шалу / Позвонить сейчас', url: 'tel:+77770131838' }
        ],
        [
          { text: '📧 Email жіберу / Отправить Email', url: 'mailto:it-support@alataustroyinvest.kz' }
        ],
        [
          { text: '🏠 Басты мәзір / Главное меню', callback_data: 'main_menu' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, contactsText, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  // Срочная помощь
  async showUrgentHelp(chatId) {
    const urgentText = `
🚨 *ШҰҒЫЛ КӨМЕК / СРОЧНАЯ ПОМОЩЬ*

🔴 *Мына жағдайларда дереу қоңырау шалыңыз / Звоните немедленно:*

🔥 *Өрт қауіпті жағдай / Пожароопасная ситуация*
📞 101 немесе / или +7 (777) 013-1838

⚡ *Электр жүйесі апатты / Авария электросети*
📞 Энергосбыт: 180
📞 Аварийная служба: +7 (777) 013-1838

💧 *Сантехника апаты / Авария водопровода*
📞 Водоканал: 109
📞 Аварийная служба: +7 (777) 013-1838

🖥️ *Маңызды жүйелер істемейді / Критические системы не работают*
📞 IT поддержка 24/7: +7 (777) 013-1838

🏢 *Ғимарат қауіпсіздігі / Безопасность здания*
📞 Охрана: +7 (727) 355-00-00

⚠️ *Басқа апаттық жағдайлар / Другие аварийные ситуации*
📞 +7 (777) 013-1838

_Басқа мәселелер үшін қарапайым өтініш жасаңыз_
_Для остальных проблем создайте обычную заявку_`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🚨 Шұғыл өтініш / Срочная заявка', callback_data: 'urgent_ticket' }
        ],
        [
          { text: '📞 IT Қолдау / IT Поддержка', url: 'tel:+77770131838' },
          { text: '🏢 Офис / Офис', url: 'tel:+77273550000' }
        ],
        [
          { text: '🏠 Басты мәзір / Главное меню', callback_data: 'main_menu' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, urgentText, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  // FAQ - Часто задаваемые вопросы
  async showFAQ(chatId) {
    const faqText = `
📋 *ЖИІ ҚОЙЫЛАТЫН СҰРАҚТАР / ЧАСТО ЗАДАВАЕМЫЕ ВОПРОСЫ*

❓ *Компьютер қосылмайды / Компьютер не включается*
🔸 Қуат кабелін тексеріңіз / Проверьте кабель питания
🔸 Қосқышты басып көріңіз / Попробуйте нажать кнопку питания
🔸 UPS қосылғанын тексеріңіз / Проверьте подключение UPS

❓ *Интернет жұмыс істемейді / Интернет не работает*
🔸 Wi-Fi қосылғанын тексеріңіз / Проверьте подключение Wi-Fi
🔸 Роутерді қайта қосыңыз / Перезагрузите роутер
🔸 Кабель қосылуын тексеріңіз / Проверьте подключение кабеля

❓ *Принтер басып шығармайды / Принтер не печатает*
🔸 Қағаз бар ма тексеріңіз / Проверьте наличие бумаги
🔸 Сия картриджін тексеріңіз / Проверьте картридж
🔸 Принтерді қайта қосыңыз / Перезагрузите принтер

❓ *Құпия сөзді ұмыттым / Забыл пароль*
🔸 IT қызметіне хабарласыңыз / Обратитесь в IT службу
🔸 Өтініш жасаңыз / Создайте заявку
🔸 Жеке куәлігіңізді дайындаңыз / Подготовьте удостоверение

❓ *Файлдар жоғалды / Файлы пропали*
🔸 Корзинаны тексеріңіз / Проверьте корзину
🔸 OneDrive/облакты тексеріңіз / Проверьте OneDrive/облако
🔸 Дереу IT-ге хабарласыңыз / Немедленно обратитесь в IT`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔍 Мәселені таба алмадым / Не нашел проблему', callback_data: 'new_ticket' }
        ],
        [
          { text: '💬 Сұрақ қою / Задать вопрос', callback_data: 'ask_question' },
          { text: '📞 Қоңырау шалу / Позвонить', url: 'tel:+77770131838' }
        ],
        [
          { text: '🏠 Басты мәзір / Главное меню', callback_data: 'main_menu' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, faqText, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  // Запрос ID заявки
  async askForTicketId(chatId) {
    this.userStates.set(chatId, {
      step: 'awaiting_ticket_id'
    });
    
    await this.bot.sendMessage(chatId, 
      '🔍 *Өтініш нөмірін енгізіңіз / Введите номер заявки:*\n' +
      '_Мысалы / Например: 123_',
      { parse_mode: 'Markdown' }
    );
  }

  // Показ активных заявок для админов
  async handleShowActiveTickets(msg) {
    const chatId = msg.chat.id;
    
    if (!this.isAdmin(chatId)) {
      await this.bot.sendMessage(chatId, '❌ Бұл команда тек әкімшілер үшін / Эта команда только для администраторов');
      return;
    }

    try {
      const [tickets] = await pool.query(
        `SELECT t.*, 
         JSON_UNQUOTE(JSON_EXTRACT(t.requester_metadata, '$.name')) as requester_name
         FROM tickets t 
         WHERE t.status IN ('new', 'in_progress', 'pending')
         ORDER BY 
           CASE t.priority 
             WHEN 'urgent' THEN 1
             WHEN 'high' THEN 2
             WHEN 'medium' THEN 3
             WHEN 'low' THEN 4
           END,
           t.created_at DESC
         LIMIT 20`
      );

      if (tickets.length === 0) {
        await this.bot.sendMessage(chatId, '✅ Актив өтініштер жоқ / Нет активных заявок');
        return;
      }

      let message = '*📋 АКТИВ ӨТІНІШТЕР / АКТИВНЫЕ ЗАЯВКИ:*\n\n';
      
      for (const ticket of tickets) {
        const priorityEmoji = {
          'low': '🟢',
          'medium': '🟡',
          'high': '🟠',
          'urgent': '🔴'
        }[ticket.priority] || '⚪';

        const statusEmoji = {
          'new': '🆕',
          'in_progress': '⏳',
          'pending': '⏸️'
        }[ticket.status] || '📋';

        message += `${priorityEmoji} ${statusEmoji} #${ticket.id} - ${ticket.subject}\n`;
        message += `👤 ${ticket.requester_name || 'Белгісіз / Неизвестно'}\n`;
        message += `_${new Date(ticket.created_at).toLocaleDateString('ru-RU')} ${new Date(ticket.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}_\n\n`;
      }

      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Ошибка получения активных заявок:', error);
      await this.bot.sendMessage(chatId, '❌ Қате пайда болды / Произошла ошибка');
    }
  }

  // Показ статистики для админов
  async handleAdminStats(msg) {
    const chatId = msg.chat.id;
    
    // Проверяем, является ли пользователь админом
    if (!this.isAdmin(chatId)) {
      await this.bot.sendMessage(chatId, '❌ Бұл команда тек әкімшілер үшін / Эта команда только для администраторов');
      return;
    }

    try {
      // Получаем статистику
      const [stats] = await pool.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
          SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent
        FROM tickets 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `);

      const stat = stats[0];

      const message = `
📊 *СТАТИСТИКА ЗА 30 КҮН / СТАТИСТИКА ЗА 30 ДНЕЙ*

📋 *Барлығы / Всего:* ${stat.total}
🆕 *Жаңа / Новых:* ${stat.new}
⏳ *Өңделуде / В работе:* ${stat.in_progress}
✅ *Шешілген / Решено:* ${stat.resolved}
🔒 *Жабылған / Закрыто:* ${stat.closed}
🔴 *Шұғыл / Срочных:* ${stat.urgent}

_Жаңартылды / Обновлено:_ ${new Date().toLocaleString('kk-KZ')}`;

      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Ошибка получения статистики:', error);
      await this.bot.sendMessage(chatId, '❌ Қате пайда болды / Произошла ошибка');
    }
  }

  // Отмена текущего действия
  async handleCancel(msg) {
    const chatId = msg.chat.id;
    this.userStates.delete(chatId);
    await this.bot.sendMessage(chatId, '❌ Әрекет тоқтатылды / Действие отменено');
    await this.handleStart(msg);
  }

  // Обработка фотографий
  async handlePhoto(msg) {
    const chatId = msg.chat.id;
    const userState = this.userStates.get(chatId);

    if (!userState || !userState.ticketData) {
      await this.bot.sendMessage(chatId, 
        'Алдымен өтініш жасаңыз / Сначала создайте заявку\n/start'
      );
      return;
    }

    // Сохраняем информацию о фото для будущей обработки
    if (!userState.ticketData.attachments) {
      userState.ticketData.attachments = [];
    }
    
    userState.ticketData.attachments.push({
      type: 'photo',
      fileId: msg.photo[msg.photo.length - 1].file_id
    });

    await this.bot.sendMessage(chatId, 
      '📸 Фото қосылды / Фото добавлено\n' +
      'Жалғастыру үшін сұрақтарға жауап беріңіз / Продолжите отвечать на вопросы'
    );
  }

  // Обработка документов
  async handleDocument(msg) {
    const chatId = msg.chat.id;
    const userState = this.userStates.get(chatId);

    if (!userState || !userState.ticketData) {
      await this.bot.sendMessage(chatId, 
        'Алдымен өтініш жасаңыз / Сначала создайте заявку\n/start'
      );
      return;
    }

    // Сохраняем информацию о документе
    if (!userState.ticketData.attachments) {
      userState.ticketData.attachments = [];
    }
    
    userState.ticketData.attachments.push({
      type: 'document',
      fileId: msg.document.file_id,
      fileName: msg.document.file_name
    });

    await this.bot.sendMessage(chatId, 
      '📎 Файл қосылды / Файл добавлен\n' +
      'Жалғастыру үшін сұрақтарға жауап беріңіз / Продолжите отвечать на вопросы'
    );
  }

  // Утилиты
  validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }


  getPriorityName(priorityId) {
    const priorities = {
      'low': 'Төмен / Низкий',
      'medium': 'Орташа / Средний',
      'high': 'Жоғары / Высокий',
      'urgent': 'Шұғыл / Срочный'
    };
    return priorities[priorityId] || priorityId;
  }

  getTypeName(typeId) {
    const types = {
      'support_request': 'Сұрау / Запрос',
      'complaint': 'Шағым / Жалоба',
      'incident': 'Инцидент / Инцидент'
    };
    return types[typeId] || typeId;
  }

  getStatusName(statusId) {
    const statuses = {
      'new': 'Жаңа / Новая',
      'in_progress': 'Өңделуде / В работе',
      'pending': 'Күтуде / В ожидании',
      'resolved': 'Шешілді / Решена',
      'closed': 'Жабылды / Закрыта',
      'telegram_pending': 'Telegram арқылы күтуде / Ожидает через Telegram',
      'whatsapp_pending': 'WhatsApp арқылы күтуде / Ожидает через WhatsApp'
    };
    return statuses[statusId] || statusId;
  }

  // Проверка, является ли пользователь админом
  isAdmin(chatId) {
    return this.adminChatIds.includes(chatId.toString()) || 
           this.moderatorChatIds.includes(chatId.toString());
  }

  // Методы для отправки сообщений пользователям через Telegram
  async sendMessageToUser(ticketId, message, fromStaff = true) {
    try {
      // Получаем информацию о заявке и Telegram chat_id пользователя
      const [tickets] = await pool.query(
        `SELECT t.*, JSON_EXTRACT(t.metadata, '$.telegram_chat_id') as telegram_chat_id
         FROM tickets t 
         WHERE t.id = ?`,
        [ticketId]
      );

      if (tickets.length === 0) {
        throw new Error(`Ticket #${ticketId} not found`);
      }

      const ticket = tickets[0];
      const chatId = ticket.telegram_chat_id;

      if (!chatId) {
        throw new Error(`No Telegram chat_id found for ticket #${ticketId}`);
      }

      // Формируем сообщение
      const staffPrefix = fromStaff ? '👨‍💼 *Қолдау қызметі / Служба поддержки:*\n\n' : '';
      const ticketInfo = `\n\n📋 *Өтініш / Заявка:* #${ticketId}`;
      
      const fullMessage = `${staffPrefix}${message}${ticketInfo}`;

      // Создаем кнопки для ответа
      const keyboard = {
        inline_keyboard: [
          [
            { text: '💬 Жауап беру / Ответить', callback_data: `reply_${ticketId}` }
          ],
          [
            { text: '📊 Күйді көру / Статус', callback_data: `status_${ticketId}` },
            { text: '📋 Менің өтініштерім / Мои заявки', callback_data: 'my_tickets' }
          ]
        ]
      };

      await this.bot.sendMessage(chatId, fullMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      return true;
    } catch (error) {
      console.error('Error sending message to user via Telegram:', error);
      throw error;
    }
  }

  // Уведомление об изменении статуса заявки
  async notifyStatusChange(ticketId, newStatus, comment = '') {
    try {
      const statusEmoji = {
        'new': '🆕',
        'in_progress': '⏳',
        'pending': '⏸️',
        'resolved': '✅',
        'closed': '🔒'
      };

      const statusText = this.getStatusName(newStatus);
      const emoji = statusEmoji[newStatus] || '📋';
      
      let message = `${emoji} *Өтініш күйі өзгерді / Статус заявки изменен*\n\n`;
      message += `📊 *Жаңа күй / Новый статус:* ${statusText}`;
      
      if (comment) {
        message += `\n\n💬 *Комментарий:*\n${comment}`;
      }

      await this.sendMessageToUser(ticketId, message, true);
    } catch (error) {
      console.error('Error notifying status change:', error);
    }
  }

  // Уведомление о новом сообщении от сотрудника
  async notifyNewMessage(ticketId, messageText, staffName = '') {
    try {
      const staffInfo = staffName ? ` (${staffName})` : '';
      let message = `💬 *Жаңа хабарлама / Новое сообщение*${staffInfo}\n\n`;
      message += messageText;

      await this.sendMessageToUser(ticketId, message, true);
    } catch (error) {
      console.error('Error notifying new message:', error);
    }
  }

  // Обработка ответов пользователей на сообщения
  async handleReplyCallback(query) {
    const chatId = query.message.chat.id;
    const ticketId = query.data.replace('reply_', '');
    
    await this.bot.answerCallbackQuery(query.id);
    
    // Устанавливаем состояние для ответа
    this.userStates.set(chatId, {
      state: 'replying',
      ticketId: ticketId,
      step: 'message'
    });

    const replyMessage = `
💬 *Өтініш #${ticketId} үшін жауап / Ответ на заявку #${ticketId}*

Сіздің хабарламаңызды жазыңыз:
_Напишите ваше сообщение:_

Болдырмау үшін /cancel командасын пайдаланыңыз
_Для отмены используйте команду /cancel_`;

    await this.bot.sendMessage(chatId, replyMessage, { parse_mode: 'Markdown' });
  }

  // Обработка статуса заявки из кнопки
  async handleStatusCallback(query) {
    const chatId = query.message.chat.id;
    const ticketId = query.data.replace('status_', '');
    
    await this.bot.answerCallbackQuery(query.id);
    await this.checkTicketStatus(chatId, ticketId);
  }

  // Обработка ответа пользователя
  async processUserReply(chatId, messageText, ticketId) {
    try {
      // Получаем информацию о пользователе
      const [userData] = await pool.query(
        'SELECT first_name, last_name FROM users WHERE telegram_chat_id = ?',
        [chatId]
      );

      const userName = userData.length > 0 
        ? `${userData[0].first_name || ''} ${userData[0].last_name || ''}`.trim()
        : 'Telegram User';

      // Сохраняем сообщение в БД
      await pool.query(
        `INSERT INTO ticket_messages (ticket_id, sender_type, message, metadata) 
         VALUES (?, ?, ?, ?)`,
        [
          ticketId,
          'user',
          messageText,
          JSON.stringify({
            source: 'telegram',
            telegram_chat_id: chatId,
            sender_name: userName
          })
        ]
      );

      // Обновляем дату последнего обновления заявки
      await pool.query(
        'UPDATE tickets SET updated_at = NOW() WHERE id = ?',
        [ticketId]
      );

      // Уведомляем администраторов о новом сообщении
      await this.notifyAdminsUserReply(ticketId, messageText, userName);

      // Подтверждаем получение сообщения
      const confirmMessage = `
✅ *Сіздің хабарламаңыз жіберілді / Ваше сообщение отправлено*

📋 *Өтініш / Заявка:* #${ticketId}
💬 *Хабарлама / Сообщение:* ${messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText}

Біз сізбен жақын арада байланысамыз.
_Мы свяжемся с вами в ближайшее время._`;

      await this.bot.sendMessage(chatId, confirmMessage, { parse_mode: 'Markdown' });

      // Очищаем состояние пользователя
      this.userStates.delete(chatId);

    } catch (error) {
      console.error('Error processing user reply:', error);
      await this.bot.sendMessage(chatId, '❌ Қате пайда болды / Произошла ошибка при отправке сообщения');
    }
  }

  // Уведомление администраторов о новом сообщении от пользователя
  async notifyAdminsUserReply(ticketId, messageText, userName) {
    try {
      const message = `
💬 *ЖАҢА ХАБАРЛАМА / НОВОЕ СООБЩЕНИЕ*

🎫 *Өтініш / Заявка:* #${ticketId}
👤 *Пайдаланушы / Пользователь:* ${userName}

📝 *Хабарлама / Сообщение:*
${messageText}

📲 *Көз / Источник:* Telegram`;

      // Отправляем уведомления всем админам и модераторам
      const allAdminChatIds = [...this.adminChatIds, ...this.moderatorChatIds];
      
      for (const adminChatId of allAdminChatIds) {
        try {
          const keyboard = {
            inline_keyboard: [
              [
                { text: '💬 Жауап беру / Ответить', callback_data: `admin_reply_${ticketId}` },
                { text: '📋 Өтініш / Заявка', callback_data: `admin_view_${ticketId}` }
              ]
            ]
          };

          await this.bot.sendMessage(adminChatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
          });
        } catch (error) {
          console.error(`Error sending notification to admin ${adminChatId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error notifying admins about user reply:', error);
    }
  }

  // Обработка ответа администратора пользователю
  async processAdminReply(chatId, messageText, ticketId, adminId, adminName) {
    try {
      // Сохраняем сообщение в БД
      await pool.query(
        `INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message, metadata) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          ticketId,
          'staff',
          adminId,
          messageText,
          JSON.stringify({
            source: 'telegram_admin',
            telegram_chat_id: chatId,
            sender_name: adminName
          })
        ]
      );

      // Обновляем дату последнего обновления заявки
      await pool.query(
        'UPDATE tickets SET updated_at = NOW() WHERE id = ?',
        [ticketId]
      );

      // Отправляем сообщение пользователю через Telegram
      await this.sendMessageToUser(ticketId, messageText, true);

      // Подтверждаем отправку администратору
      const confirmMessage = `
✅ *Хабарлама жіберілді / Сообщение отправлено*

🎫 *Өтініш / Заявка:* #${ticketId}
👤 *Қабылдаушы / Получатель:* Пользователь заявки
💬 *Хабарлама / Сообщение:* ${messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText}

📲 *Жіберілді / Отправлено через:* Telegram`;

      await this.bot.sendMessage(chatId, confirmMessage, { 
        parse_mode: 'Markdown' 
      });

      // Очищаем состояние администратора
      this.userStates.delete(chatId);

    } catch (error) {
      console.error('Error processing admin reply:', error);
      await this.bot.sendMessage(chatId, '❌ Қате пайда болды / Произошла ошибка при отправке сообщения');
    }
  }

  // Подтверждение создания заявки
  async confirmTicketCreation(chatId) {
    const userState = this.userStates.get(chatId);
    if (!userState || !userState.ticketData) {
      await this.bot.sendMessage(chatId, '❌ Қате: деректер табылмады / Ошибка: данные не найдены');
      return;
    }

    await this.createTicket(chatId, userState.ticketData, chatId);
  }

  // Отмена создания заявки
  async cancelTicketCreation(chatId) {
    this.userStates.delete(chatId);
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🏠 Басты мәзір / Главное меню', callback_data: 'main_menu' }
        ]
      ]
    };
    
    await this.bot.sendMessage(chatId, '❌ Өтініш жасаудан бас тартылды / Создание заявки отменено', {
      reply_markup: keyboard
    });
  }

  // Редактирование заявки
  async editTicket(chatId) {
    const userState = this.userStates.get(chatId);
    if (!userState || !userState.ticketData) {
      await this.bot.sendMessage(chatId, '❌ Қате: деректер табылмады / Ошибка: данные не найдены');
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📝 Тақырып / Тема', callback_data: 'edit_subject' },
          { text: '📄 Сипаттама / Описание', callback_data: 'edit_description' }
        ],
        [
          { text: '👤 Аты-жөні / ФИО', callback_data: 'edit_name' },
          { text: '📧 Email', callback_data: 'edit_email' }
        ],
        [
          { text: '📱 Телефон', callback_data: 'edit_phone' },
          { text: '⚡ Басымдылық / Приоритет', callback_data: 'edit_priority' }
        ],
        [
          { text: '✅ Дайын / Готово', callback_data: 'confirm_ticket' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, '✏️ Не өзгерткіңіз келеді? / Что вы хотите изменить?', {
      reply_markup: keyboard
    });
  }

  // Показать мои заявки
  async showMyTickets(chatId, telegramUserId) {
    try {
      // Получаем заявки пользователя
      const [tickets] = await pool.query(
        `SELECT id, subject, status, priority, created_at
         FROM tickets 
         WHERE JSON_EXTRACT(metadata, '$.telegram_chat_id') = ?
         OR JSON_EXTRACT(metadata, '$.telegram_user_id') = ?
         ORDER BY created_at DESC
         LIMIT 10`,
        [chatId, telegramUserId]
      );

      if (tickets.length === 0) {
        const keyboard = {
          inline_keyboard: [
            [
              { text: '📝 Жаңа өтініш / Новая заявка', callback_data: 'new_ticket' }
            ],
            [
              { text: '🏠 Басты мәзір / Главное меню', callback_data: 'main_menu' }
            ]
          ]
        };

        await this.bot.sendMessage(chatId, 
          '📭 Сізде әлі өтініштер жоқ / У вас пока нет заявок', 
          { reply_markup: keyboard }
        );
        return;
      }

      let message = '📋 *Сіздің өтініштеріңіз / Ваши заявки:*\n\n';

      const keyboard = {
        inline_keyboard: []
      };

      tickets.forEach((ticket, index) => {
        const statusEmoji = {
          'new': '🆕',
          'in_progress': '⏳',
          'pending': '⏸️',
          'resolved': '✅',
          'closed': '🔒'
        }[ticket.status] || '📋';

        const priorityEmoji = {
          'low': '🟢',
          'medium': '🟡',
          'high': '🟠',
          'urgent': '🔴'
        }[ticket.priority] || '⚪';

        message += `${index + 1}. ${statusEmoji} *#${ticket.id}* - ${ticket.subject}\n`;
        message += `   ${priorityEmoji} ${this.getStatusName(ticket.status)}\n`;
        message += `   📅 ${new Date(ticket.created_at).toLocaleDateString('ru-RU')}\n\n`;

        // Добавляем кнопку для каждой заявки
        keyboard.inline_keyboard.push([{
          text: `#${ticket.id} - ${ticket.subject.substring(0, 30)}${ticket.subject.length > 30 ? '...' : ''}`,
          callback_data: `ticket_${ticket.id}`
        }]);
      });

      // Добавляем навигационные кнопки
      keyboard.inline_keyboard.push([
        { text: '📝 Жаңа өтініш / Новая заявка', callback_data: 'new_ticket' }
      ]);
      keyboard.inline_keyboard.push([
        { text: '🏠 Басты мәзір / Главное меню', callback_data: 'main_menu' }
      ]);

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

    } catch (error) {
      console.error('Ошибка получения заявок:', error);
      await this.bot.sendMessage(chatId, '❌ Қате пайда болды / Произошла ошибка');
    }
  }

  // Обработка действий с конкретной заявкой
  async handleTicketAction(query) {
    const chatId = query.message.chat.id;
    const ticketId = query.data.replace('ticket_', '');
    
    await this.bot.answerCallbackQuery(query.id);

    try {
      // Получаем информацию о заявке
      const [tickets] = await pool.query(
        `SELECT * FROM tickets WHERE id = ?`,
        [ticketId]
      );

      if (tickets.length === 0) {
        await this.bot.sendMessage(chatId, '❌ Өтініш табылмады / Заявка не найдена');
        return;
      }

      const ticket = tickets[0];
      
      const statusEmoji = {
        'new': '🆕',
        'in_progress': '⏳',
        'pending': '⏸️',
        'resolved': '✅',
        'closed': '🔒'
      }[ticket.status] || '📋';

      const priorityEmoji = {
        'low': '🟢',
        'medium': '🟡',
        'high': '🟠',
        'urgent': '🔴'
      }[ticket.priority] || '⚪';

      let message = `📋 *Өтініш / Заявка #${ticket.id}*\n\n`;
      message += `📝 *Тақырып / Тема:* ${ticket.subject}\n`;
      message += `${statusEmoji} *Күйі / Статус:* ${this.getStatusName(ticket.status)}\n`;
      message += `${priorityEmoji} *Басымдылық / Приоритет:* ${this.getPriorityName(ticket.priority)}\n`;
      message += `📅 *Құрылған / Создана:* ${new Date(ticket.created_at).toLocaleString('ru-RU')}\n\n`;
      message += `📄 *Сипаттама / Описание:*\n${ticket.description}`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '💬 Хабарлама қосу / Добавить сообщение', callback_data: `reply_${ticket.id}` }
          ]
        ]
      };

      // Добавляем кнопку закрытия если заявка решена
      if (ticket.status === 'resolved') {
        keyboard.inline_keyboard.push([
          { text: '🔒 Жабу / Закрыть', callback_data: `close_${ticket.id}` }
        ]);
      }

      keyboard.inline_keyboard.push([
        { text: '🔙 Өтініштерге оралу / Вернуться к заявкам', callback_data: 'my_tickets' }
      ]);

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

    } catch (error) {
      console.error('Ошибка показа заявки:', error);
      await this.bot.sendMessage(chatId, '❌ Қате пайда болды / Произошла ошибка');
    }
  }

  // Запрос ID заявки для проверки статуса
  async askForTicketId(chatId) {
    this.userStates.set(chatId, {
      step: 'awaiting_ticket_id'
    });

    const keyboard = {
      inline_keyboard: [
        [
          { text: '❌ Болдырмау / Отменить', callback_data: 'main_menu' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, 
      '🔍 *Өтініш нөмірін енгізіңіз / Введите номер заявки:*\n\n_Мысалы / Например: 123_', 
      { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  // Показать срочную помощь
  async showUrgentHelp(chatId) {
    const text = `
🚨 *ШҰҒЫЛ КӨМЕК / СРОЧНАЯ ПОМОЩЬ*

⚡ *Критикалық мәселелер үшін / Для критических проблем:*

📞 *Тікелей қоңырау шалыңыз / Звоните напрямую:*
+7 (777) 013-18-38

🕐 *Жұмыс уақыты / Рабочее время:*
Дүйсенбі-Жұма / Пн-Пт: 09:00 - 18:00

⚠️ *Шұғыл жағдайлар / Экстренные ситуации:*
• Жүйенің толық істен шығуы / Полный отказ системы
• Деректердің жоғалуы / Потеря данных
• Кибершабуыл белгілері / Признаки кибератаки
• Маңызды жабдықтың істен шығуы / Выход из строя критического оборудования

💡 *Не істеу керек / Что делать:*
1. Дереу қоңырау шалыңыз / Немедленно позвоните
2. Мәселені қысқаша сипаттаңыз / Кратко опишите проблему
3. Нұсқауларды орындаңыз / Следуйте инструкциям`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📞 Қазір қоңырау шалу / Позвонить сейчас', url: 'tel:+77770131838' }
        ],
        [
          { text: '🚨 Шұғыл өтініш жасау / Создать срочную заявку', callback_data: 'urgent_ticket' }
        ],
        [
          { text: '🏠 Басты мәзір / Главное меню', callback_data: 'main_menu' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  // Метод для корректного завершения работы бота
  async shutdown() {
    console.log(`🔄 Завершение работы Telegram бота (ID: ${this.instanceId})...`);
    
    // Устанавливаем флаг, что бот больше не работает
    this.isRunning = false;
    
    try {
      if (this.bot) {
        // Останавливаем прием новых сообщений
        console.log('🛑 Остановка обработки сообщений...');
        this.bot.removeAllListeners();
        
        // Останавливаем поллинг
        try {
          console.log('🛑 Остановка поллинга...');
          await this.bot.stopPolling();
        } catch (e) {
          console.log('⚠️ Поллинг уже остановлен или ошибка:', e.message);
        }
        
        // Удаляем webhook
        try {
          console.log('🧹 Удаление webhook...');
          await this.bot.deleteWebHook();
        } catch (e) {
          console.log('⚠️ Webhook уже удален или ошибка:', e.message);
        }
        
        // Закрываем соединение
        try {
          console.log('🔌 Закрытие соединения...');
          await this.bot.close();
        } catch (e) {
          console.log('⚠️ Ошибка закрытия соединения:', e.message);
        }
        
        // Увеличенная задержка для полного закрытия соединений
        console.log('⏳ Ожидание полного закрытия соединений (5 секунд)...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log(`✅ Telegram бот полностью остановлен (ID: ${this.instanceId})`);
      }
      
      // Очищаем состояния
      if (this.userStates) {
        this.userStates.clear();
      }
      
      // Очищаем глобальную ссылку
      if (global.telegramBot === this) {
        global.telegramBot = null;
      }
      
      // Обнуляем ссылку на бота
      this.bot = null;
      
    } catch (error) {
      console.error(`❌ Ошибка при остановке Telegram бота (ID: ${this.instanceId}):`, error.message);
      
      // Принудительно очищаем все ссылки даже при ошибке
      this.bot = null;
      if (global.telegramBot === this) {
        global.telegramBot = null;
      }
    }
  }
}

module.exports = HelpdeskTelegramBot;