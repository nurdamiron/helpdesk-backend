const TelegramBot = require('node-telegram-bot-api');
const pool = require('../../config/database');
const { sendTicketCreationNotification } = require('../../utils/emailService');

class HelpdeskTelegramBot {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    if (!this.token) {
      console.error('❌ TELEGRAM_BOT_TOKEN не установлен в переменных окружения');
      return;
    }
    
    this.bot = new TelegramBot(this.token, { polling: true });
    this.userStates = new Map(); // Хранение состояний пользователей
    this.adminChatIds = [];
    this.moderatorChatIds = [];
    
    this.setupHandlers();
    this.loadAdminList();
    
    console.log('✅ Telegram бот запущен успешно');
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
          { text: '❓ Көмек / Помощь', callback_data: 'help' },
          { text: '☎️ Байланыс / Контакты', callback_data: 'contacts' }
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
      case 'help':
        await this.showHelp(chatId);
        break;
      case 'contacts':
        await this.showContacts(chatId);
        break;
      default:
        if (data.startsWith('priority_')) {
          await this.selectPriority(chatId, data.replace('priority_', ''));
        }
    }
  }

  // Начало создания заявки
  async startTicketCreation(chatId) {
    this.userStates.set(chatId, {
      step: 'awaiting_name',
      ticketData: {}
    });

    const text = `
📝 *Жаңа өтініш жасау / Создание новой заявки*

Сұрақтарға жауап беріңіз:
_Пожалуйста, ответьте на вопросы:_

1️⃣ *Аты-жөніңіз / Ваше ФИО:*`;

    await this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
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
      case 'awaiting_name':
        userState.ticketData.name = text;
        userState.step = 'awaiting_email';
        await this.bot.sendMessage(chatId, '2️⃣ *Email мекенжайыңыз / Ваш email:*', { parse_mode: 'Markdown' });
        break;

      case 'awaiting_email':
        if (!this.validateEmail(text)) {
          await this.bot.sendMessage(chatId, '❌ Дұрыс email енгізіңіз / Введите корректный email');
          return;
        }
        userState.ticketData.email = text;
        userState.step = 'awaiting_phone';
        await this.bot.sendMessage(chatId, '3️⃣ *Телефон нөміріңіз / Ваш телефон:*\n_(міндетті емес / необязательно - жіберу үшін "-" енгізіңіз / введите "-" чтобы пропустить)_', { parse_mode: 'Markdown' });
        break;

      case 'awaiting_phone':
        if (text !== '-' && text !== 'жоқ' && text !== 'нет') {
          userState.ticketData.phone = text;
        }
        userState.step = 'awaiting_subject';
        await this.bot.sendMessage(chatId, '4️⃣ *Өтініш тақырыбы / Тема заявки:*', { parse_mode: 'Markdown' });
        break;

      case 'awaiting_subject':
        userState.ticketData.subject = text;
        userState.step = 'awaiting_description';
        await this.bot.sendMessage(chatId, '5️⃣ *Мәселені толық сипаттаңыз / Подробно опишите проблему:*', { parse_mode: 'Markdown' });
        break;

      case 'awaiting_description':
        userState.ticketData.description = text;
        userState.step = 'awaiting_priority';
        await this.showPrioritySelection(chatId);
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

  // Показ категорий
  async showCategorySelection(chatId) {
    const categories = [
      { id: 'it_support', name: '🆘 IT қолдау / IT поддержка' },
      { id: 'equipment_issue', name: '🔧 Құрылғы мәселесі / Проблемы с оборудованием' },
      { id: 'software_issue', name: '🖥️ БҚ мәселесі / Проблемы с ПО' },
      { id: 'access_request', name: '🔐 Рұқсат сұрау / Запрос доступа' },
      { id: 'other', name: '📋 Басқа / Другое' }
    ];

    const keyboard = {
      inline_keyboard: categories.map(cat => [{
        text: cat.name,
        callback_data: `category_${cat.id}`
      }])
    };

    await this.bot.sendMessage(chatId, '4️⃣ *Категорияны таңдаңыз / Выберите категорию:*', {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  // Выбор категории
  async selectCategory(chatId, categoryId) {
    const userState = this.userStates.get(chatId);
    if (!userState) return;

    userState.ticketData.category = categoryId;
    userState.step = 'awaiting_subject';
    
    await this.bot.sendMessage(chatId, '5️⃣ *Өтініш тақырыбы / Тема заявки:*', { parse_mode: 'Markdown' });
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

    await this.bot.sendMessage(chatId, '6️⃣ *Басымдылық / Приоритет:*', {
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
          'support_request',
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
            'support_request',
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

    await this.bot.sendMessage(chatId, contactsText, { parse_mode: 'Markdown' });
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
}

module.exports = HelpdeskTelegramBot;