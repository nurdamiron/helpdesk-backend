// src/controllers/ticketController.js
const nodemailer = require('nodemailer');
const pool = require('../config/database');
const { sendTicketCreationNotification } = require('../utils/emailService');

// Маппинги для локализации категорий службы поддержки
const CATEGORY_MAP = {
  'technical': 'Техническая проблема',
  'billing': 'Биллинг и расчеты',
  'general': 'Общие вопросы',
  'it_support': 'IT поддержка',
  'equipment_issue': 'Проблемы с оборудованием',
  'software_issue': 'Проблемы с ПО',
  'access_request': 'Запрос доступа',
  'complaint': 'Жалоба',
  'suggestion': 'Предложение',
  'hr_question': 'Вопрос по HR',
  'safety_issue': 'Вопрос безопасности',
  'training_request': 'Запрос на обучение',
  'policy_question': 'Вопрос по политикам',
  'other': 'Другое'
};

const PRIORITY_MAP = {
  'low': 'Төмен',
  'medium': 'Орташа',
  'high': 'Жоғары',
  'urgent': 'Шұғыл'
};

const STATUS_MAP = {
  'new': 'Новая',
  'whatsapp_pending': 'Ожидает отправки WhatsApp',
  'in_review': 'На рассмотрении',
  'in_progress': 'В работе',
  'pending': 'Ожидает ответа',
  'resolved': 'Решена',
  'closed': 'Закрыта'
};

const TYPE_MAP = {
  'support_request': 'Запрос',
  'complaint': 'Жалоба', 
  'incident': 'Инцидент'
};

const PROPERTY_TYPE_MAP = {
  'apartment': 'Пәтер', // Квартира
  'house': 'Жеке үй', // Частный дом
  'office': 'Офис', // Офис
  'commercial': 'Коммерциялық жай', // Коммерческое помещение
  'land': 'Жер учаскесі', // Земельный участок
  'other': 'Басқа' // Другое
};

// Создаем транспорт для отправки почты
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true' ? true : false,
  auth: {
      user: process.env.SMTP_USER || process.env.EMAIL_USER,
      pass: process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD
  }
});

// Создание заявки
exports.createTicket = async (req, res) => {
  try {
    const { 
      subject, 
      description, 
      type = 'support_request', 
      priority = 'medium',
      status = 'new',
      metadata = {},
      requester_metadata = {},
      user_id = null // Добавляем возможность передать ID пользователя
    } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ 
        status: 'error',
        error: 'Тақырып және сипаттама міндетті өрістер болып табылады' // Тема и описание являются обязательными полями
      });
    }

    // Преобразование объектов в JSON строки, если они переданы как объекты
    const metadataJSON = typeof metadata === 'string' ? metadata : JSON.stringify({
      ...metadata,
      type: type // Добавляем тип в metadata
    });
    
    // Получаем данные заявителя, если они есть
    let requesterMetadataJSON = '{}';
    if (requester_metadata && Object.keys(requester_metadata).length > 0) {
      // Если передана информация о заявителе, используем её
      requesterMetadataJSON = typeof requester_metadata === 'string' 
        ? requester_metadata 
        : JSON.stringify(requester_metadata);
    } else if (metadata.employee) {
      // Для обратной совместимости
      requesterMetadataJSON = JSON.stringify(metadata.employee);
    }

    // Проверяем переданный user_id, если он есть
    let userId = null;
    if (user_id) {
      // Проверяем существует ли пользователь с таким ID
      const [userExists] = await pool.query('SELECT id FROM users WHERE id = ?', [user_id]);
      if (userExists.length > 0) {
        userId = user_id;
      }
    }
    
    // В этой версии не используем employee_id - сотрудники хранятся в metadata

    // Вставка заявки с user_id и переданным статусом
    const [result] = await pool.query(
      `INSERT INTO tickets (subject, description, type, priority, status, metadata, requester_metadata, user_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [subject, description, type, priority, status, metadataJSON, requesterMetadataJSON, userId]
    );

    // Получаем данные заявки для ответа
    const [ticketRows] = await pool.query('SELECT * FROM tickets WHERE id = ?', [result.insertId]);
    
    const ticket = ticketRows[0];

    // Извлекаем данные пользователя из requester_metadata
    let userData = {};
    if (ticket.requester_metadata) {
      try {
        // Проверяем, является ли requester_metadata уже объектом
        const requesterMetadata = typeof ticket.requester_metadata === 'object' && ticket.requester_metadata !== null
          ? ticket.requester_metadata
          : JSON.parse(ticket.requester_metadata);
          
        if (requesterMetadata.requester) {
          userData = requesterMetadata.requester;
        } else if (requesterMetadata.employee) {
          userData = requesterMetadata.employee;
        } else {
          userData = requesterMetadata;
        }
      } catch (e) {
        console.error('Ошибка при разборе requester_metadata:', e);
        // При ошибке парсинга используем данные из запроса если они есть
        if (metadata.employee) {
          userData = metadata.employee;
        }
      }
    }

    // Если заявка связана с пользователем, получаем его данные
    if (userId) {
      const [userRows] = await pool.query(
        'SELECT id, email, first_name, last_name, role FROM users WHERE id = ?', 
        [userId]
      );
      
      if (userRows.length > 0) {
        // Если у пользователя есть email и он не был получен из metadata
        // используем email из данных пользователя
        if (userRows[0].email && !userData.email) {
          userData.email = userRows[0].email;
        }
      }
    }

    // Отправляем письмо-подтверждение, если есть email
    let emailSent = false;
    if (userData.email) {
      try {
        // Добавляем дополнительное логирование для отладки
        console.log('Sending notification to email:', userData.email);
        console.log('Ticket data for email:', JSON.stringify(ticket, null, 2));
        console.log('User data for email:', JSON.stringify(userData, null, 2));
        
        // Используем новую функцию отправки уведомлений
        await sendTicketCreationNotification(userData.email, ticket);
        console.log(`Өтініш туралы хабарлама ${userData.email} адресіне жіберілді`);
        emailSent = true;
      } catch (emailError) {
        console.error('Email жіберу кезінде қате:', emailError);
        console.error('Error details:', emailError.message, emailError.stack);
        // Продолжаем выполнение, даже если не удалось отправить письмо
      }
    } else {
      console.log('No email address found for notification.');
      console.log('Ticket requester_metadata:', ticket.requester_metadata);
      console.log('Extracted user data:', userData);
    }

    // Добавляем статус отправки email в заголовки ответа
    res.set('X-Email-Sent', emailSent ? 'true' : 'false');
    
    return res.status(201).json({
      status: 'success',
      message: 'Өтініш сәтті құрылды', // Заявка успешно создана
      email_sent: emailSent, // Добавляем статус отправки email в ответ
      ticket
    });
  } catch (error) {
    console.error('Ошибка createTicket:', error);
    return res.status(500).json({ 
      status: 'error',
      error: 'Өтінішті құру кезінде қате пайда болды', // Ошибка при создании заявки 
      details: error.message
    });
  }
};

// Получение списка заявок
exports.getTickets = async (req, res) => {
  try {
    const {
      status,
      type,
      priority,
      search,
      user_id,
      limit = 10,
      offset = 0,
      sort = 'created_at',
      order = 'DESC'
    } = req.query;

    // Базовый запрос
    let query = 'SELECT t.*, u.email as user_email, u.first_name, u.last_name FROM tickets t LEFT JOIN users u ON t.user_id = u.id WHERE 1=1';
    const params = [];

    console.log('Current user:', req.user);
    
    // Определяем, какие заявки показывать в зависимости от роли
    const isAdminOrModerator = req.user && ['admin', 'moderator'].includes(req.user.role);
    
    if (req.user && !isAdminOrModerator) {
      // Обычные пользователи видят только свои заявки
      console.log('Filtering tickets for user ID:', req.user.id);
      query += ' AND t.user_id = ?';
      params.push(req.user.id);
    } else if (user_id && isAdminOrModerator) {
      // Если передан user_id и пользователь имеет права (админ или модератор), фильтруем по нему
      console.log('Admin/Moderator filtering tickets by provided user_id:', user_id);
      query += ' AND t.user_id = ?';
      params.push(user_id);
    } else if (isAdminOrModerator) {
      // Админы и модераторы видят все заявки
      console.log('Showing all tickets (admin/moderator view)');
    }

    // Добавляем остальные фильтры
    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    if (type) {
      query += ' AND t.type = ?';
      params.push(type);
    }
    if (priority) {
      query += ' AND t.priority = ?';
      params.push(priority);
    }
    if (search) {
      query += ' AND (t.subject LIKE ? OR t.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Добавляем сортировку и пагинацию
    query += ` ORDER BY t.${sort} ${order} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    // Выполняем запрос
    const [tickets] = await pool.query(query, params);

    // Получаем общее количество заявок для пагинации
    let countQuery = 'SELECT COUNT(*) as total FROM tickets t WHERE 1=1';
    const countParams = [];

    if (req.user && !isAdminOrModerator) {
      // Обычные пользователи видят только свои заявки
      countQuery += ' AND t.user_id = ?';
      countParams.push(req.user.id);
    } else if (user_id && isAdminOrModerator) {
      // Фильтрация по конкретному пользователю для админов и модераторов
      countQuery += ' AND t.user_id = ?';
      countParams.push(user_id);
    }

    // Добавляем те же фильтры для подсчета
    if (status) {
      countQuery += ' AND t.status = ?';
      countParams.push(status);
    }
    if (type) {
      countQuery += ' AND t.type = ?';
      countParams.push(type);
    }
    if (priority) {
      countQuery += ' AND t.priority = ?';
      countParams.push(priority);
    }
    if (search) {
      countQuery += ' AND (t.subject LIKE ? OR t.description LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const [totalCount] = await pool.query(countQuery, countParams);

    return res.json({
      status: 'success',
      data: tickets,
      pagination: {
        total: totalCount[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Ошибка getTickets:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Өтініштер тізімін алу кезінде қате пайда болды', // Ошибка при получении списка заявок
      details: error.message
    });
  }
};

// Получение заявки по ID
exports.getTicketById = async (req, res) => {
  try {
    const { id } = req.params;

    // Проверка, есть ли у пользователя доступ к этой заявке
    const isModerator = req.user && (req.user.role === 'moderator' || req.user.role === 'admin');
    const userId = req.user ? req.user.id : null;
    
    // Запрос для получения заявки
    // Если пользователь модератор или админ, он может видеть все заявки
    // Если обычный пользователь, то только свои заявки
    const query = isModerator 
      ? `SELECT * FROM tickets WHERE id = ?` 
      : `SELECT * FROM tickets WHERE id = ? AND (user_id = ? OR requester_id = ?)`;
    
    const params = isModerator ? [id] : [id, userId, userId];
    
    // Получаем данные заявки
    const [tickets] = await pool.query(query, params);

    if (tickets.length === 0) {
      return res.status(404).json({ 
        status: 'error',
        error: 'Өтініш табылмады' // Заявка не найдена 
      });
    }

    const ticket = tickets[0];
    let ticketType = 'request'; // Тип по умолчанию

    // Если есть metadata, парсим его для получения типа
    if (ticket.metadata) {
      try {
        let metadata = ticket.metadata;
        // Если metadata - строка, пытаемся распарсить как JSON
        if (typeof metadata === 'string') {
          metadata = JSON.parse(metadata);
        } else if (metadata.toString() === '[object Object]') {
          // Если объект уже преобразован, используем его напрямую
          metadata = ticket.metadata;
        }
        
        if (metadata.type) {
          ticketType = metadata.type;
        }
      } catch (e) {
        console.error('Ошибка при парсинге metadata:', e);
      }
    }
    
    // Добавляем тип в объект заявки
    ticket.type = ticketType;

    // Если есть requester_metadata, парсим его
    if (ticket.requester_metadata) {
      try {
        ticket.requester = JSON.parse(ticket.requester_metadata);
      } catch (e) {
        console.error('Ошибка парсинга requester_metadata:', e);
        ticket.requester = null;
      }
    } else {
      ticket.requester = null;
    }

    // Если есть assigned_to, получим данные исполнителя
    if (ticket.assigned_to) {
      const [users] = await pool.query(
        `SELECT id, first_name, last_name, email, role FROM users WHERE id = ?`,
        [ticket.assigned_to]
      );
      ticket.assigned_user = users.length ? users[0] : null;
    } else {
      ticket.assigned_user = null;
    }

    // Попробуем получить сообщения заявки вместе с информацией об отправителях
    try {
      // Импортируем сервис для сообщений
      const messageService = require('../services/messageService');
      // Получаем сообщения с дополнительной информацией
      const messages = await messageService.getTicketMessagesWithSenders(id);
      
      // Преобразуем сообщения в нужный формат
      ticket.messages = messages.map(message => {
        return {
          ...message,
          sender: {
            id: message.sender_id,
            name: message.sender_name,
            email: message.sender_email,
            type: message.sender_type
          }
        };
      });
      
      console.log(`Получено ${ticket.messages.length} сообщений для заявки #${id} с информацией об отправителях`);
    } catch (error) {
      // Если таблицы нет или другая ошибка, просто вернем пустой массив
      console.error('Не удалось получить сообщения:', error.message);
      ticket.messages = [];
    }

    // Добавляем локализованные тексты
    ticket.status_text = STATUS_MAP[ticket.status] || ticket.status;
    ticket.priority_text = PRIORITY_MAP[ticket.priority] || ticket.priority;
    ticket.type_text = TYPE_MAP[ticket.type] || ticket.type;
    if (ticket.property_type) {
      ticket.property_type_text = PROPERTY_TYPE_MAP[ticket.property_type] || ticket.property_type;
    }

    return res.json({
      status: 'success',
      ticket
    });
  } catch (error) {
    console.error('Ошибка getTicketById:', error);
    return res.status(500).json({ 
      status: 'error',
      error: 'Өтінішті алу кезінде қате пайда болды', // Ошибка при получении заявки
      details: error.message
    });
  }
};

// Обновление заявки
exports.updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      subject,
      description,
      status,
      priority,
      type,
      assigned_to,
      deadline,
      metadata = {}
    } = req.body;

    // Сначала проверим существование заявки
    const [checkResult] = await pool.query('SELECT id, metadata FROM tickets WHERE id = ?', [id]);
    if (checkResult.length === 0) {
      return res.status(404).json({ 
        status: 'error',
        error: 'Өтініш табылмады' // Заявка не найдена
      });
    }

    // Получаем текущие метаданные
    let currentMetadata = {};
    if (checkResult[0].metadata) {
      try {
        currentMetadata = JSON.parse(checkResult[0].metadata);
      } catch (e) {
        console.error('Ошибка парсинга metadata в updateTicket:', e);
      }
    }

    // Обновляем метаданные с новым типом, если он передан
    const updatedMetadata = {
      ...currentMetadata,
      ...(metadata && metadata.additional ? metadata.additional : {}),
    };
    
    if (type !== undefined) {
      updatedMetadata.type = type;
    }

    // Формируем запрос обновления
    const updateFields = [];
    const updateValues = [];

    if (subject !== undefined) {
      updateFields.push('subject = ?');
      updateValues.push(subject);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }
    if (priority !== undefined) {
      updateFields.push('priority = ?');
      updateValues.push(priority);
    }
    if (assigned_to !== undefined) {
      updateFields.push('assigned_to = ?');
      updateValues.push(assigned_to);
    }
    if (deadline !== undefined) {
      updateFields.push('deadline = ?');
      updateValues.push(deadline);
    }

    // Обновляем metadata с типом
    updateFields.push('metadata = ?');
    updateValues.push(JSON.stringify(updatedMetadata));

    // Если пришли новые данные о заявителе, обновляем requester_metadata
    if (metadata && (metadata.requester || metadata.employee)) {
      const requesterData = metadata.requester || metadata.employee || {};
      updateFields.push('requester_metadata = ?');
      updateValues.push(JSON.stringify(requesterData));
    }

    // Добавляем timestamp обновления и ID заявки
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(id);

    // Выполняем запрос обновления
    const query = `UPDATE tickets SET ${updateFields.join(', ')} WHERE id = ?`;
    const [updateResult] = await pool.query(query, [...updateValues, id]);

    if (updateResult.affectedRows === 0) {
      return res.status(500).json({ 
        status: 'error',
        error: 'Өтінішті жаңарту мүмкін болмады' // Не удалось обновить заявку
      });
    }

    // Получаем обновленные данные заявки
    const [tickets] = await pool.query('SELECT * FROM tickets WHERE id = ?', [id]);
    const ticket = tickets[0];

    // Добавляем тип из метаданных
    let ticketType = 'request'; // Тип по умолчанию
    if (ticket.metadata) {
      try {
        let metadata = ticket.metadata;
        // Если metadata - строка, пытаемся распарсить как JSON
        if (typeof metadata === 'string') {
          metadata = JSON.parse(metadata);
        } else if (metadata.toString() === '[object Object]') {
          // Если объект уже преобразован, используем его напрямую
          metadata = ticket.metadata;
        }
        
        if (metadata.type) {
          ticketType = metadata.type;
        }
      } catch (e) {
        console.error('Ошибка при парсинге metadata:', e);
      }
    }
    ticket.type = ticketType;

    // Добавляем локализованные тексты
    ticket.status_text = STATUS_MAP[ticket.status] || ticket.status;
    ticket.priority_text = PRIORITY_MAP[ticket.priority] || ticket.priority;
    ticket.type_text = TYPE_MAP[ticket.type] || ticket.type;
    if (ticket.property_type) {
      ticket.property_type_text = PROPERTY_TYPE_MAP[ticket.property_type] || ticket.property_type;
    }

    return res.json({
      status: 'success',
      message: 'Өтініш сәтті жаңартылды', // Заявка успешно обновлена
      ticket
    });
  } catch (error) {
    console.error('Ошибка updateTicket:', error);
    return res.status(500).json({ 
      status: 'error',
      error: 'Өтінішті жаңарту кезінде қате пайда болды', // Ошибка при обновлении заявки
      details: error.message
    });
  }
};

// Добавление сообщения к заявке
exports.addMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, sender_type = 'moderator', content_type = 'text', sender_id } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Содержание сообщения обязательно' });
    }

    // Проверяем заявку
    const [tickets] = await pool.query('SELECT * FROM tickets WHERE id = ?', [id]);
    if (!tickets.length) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }

    const [insert] = await pool.query(
      `INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, content, content_type)
       VALUES (?, ?, ?, ?, ?)`,
      [id, sender_type, sender_id, content, content_type]
    );

    // Обновляем updated_at
    await pool.query('UPDATE tickets SET updated_at=CURRENT_TIMESTAMP WHERE id=?', [id]);

    // Возвращаем инфу
    return res.status(201).json({
      message: {
        id: insert.insertId,
        ticket_id: parseInt(id),
        sender_type,
        sender_id,
        content,
        content_type,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Ошибка addMessage:', error);
    return res.status(500).json({ error: 'Ошибка при добавлении сообщения' });
  }
};

// Загрузка вложения
exports.uploadAttachment = async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем заявку
    const [tickets] = await pool.query('SELECT * FROM tickets WHERE id=?', [id]);
    if (!tickets.length) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const { filename, path, mimetype, size } = req.file;
    const uploaded_by = req.body.user_id || null;
    const message_id = req.body.message_id || null;

    // Запись во вложения
    const [ins] = await pool.query(
      `INSERT INTO ticket_attachments
       (ticket_id, message_id, file_name, file_path, file_type, file_size, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, message_id, filename, path, mimetype, size, uploaded_by]
    );

    // Обновим updated_at
    await pool.query('UPDATE tickets SET updated_at=CURRENT_TIMESTAMP WHERE id=?', [id]);

    return res.status(201).json({
      attachment: {
        id: ins.insertId,
        ticket_id: parseInt(id),
        message_id,
        file_name: filename,
        file_path: path,
        file_type: mimetype,
        file_size: size,
        uploaded_by,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Ошибка uploadAttachment:', error);
    return res.status(500).json({ error: 'Ошибка загрузки вложения' });
  }
};

/**
 * Получение аналитики по заявкам
 * @param {Object} req - HTTP запрос
 * @param {Object} res - HTTP ответ
 * @returns {Object} Статистика по заявкам
 */
exports.getTicketsAnalytics = async (req, res) => {
  try {
    // Проверяем роль пользователя - только модераторы и админы имеют доступ
    if (!req.user || !['admin', 'moderator'].includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        error: 'У вас нет доступа к этой функции'
      });
    }

    // Получаем общее количество заявок
    const [totalResult] = await pool.query('SELECT COUNT(*) as total FROM tickets');
    const totalTickets = totalResult[0].total;

    // Получаем количество заявок по статусам
    const [statusResult] = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM tickets 
      GROUP BY status
    `);

    // Преобразуем результат в объект
    const byStatus = {};
    statusResult.forEach(row => {
      byStatus[row.status] = row.count;
    });

    // Получаем количество заявок, назначенных текущему пользователю
    const [assignedResult] = await pool.query(
      'SELECT COUNT(*) as count FROM tickets WHERE assigned_to = ?',
      [req.user.id]
    );
    const assignedToCurrentUser = assignedResult[0].count;

    // Получаем среднее время ответа (разница между временем создания и первым ответом)
    // Это сложный запрос, поэтому сделаем простую заглушку
    const averageResponseTime = 24; // 24 часа в среднем

    // Отправляем результат
    return res.json({
      status: 'success',
      totalTickets,
      byStatus,
      assignedToCurrentUser,
      averageResponseTime
    });
  } catch (error) {
    console.error('Ошибка getTicketsAnalytics:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Ошибка при получении аналитики по заявкам',
      details: error.message
    });
  }
};

// Удаление заявки
exports.deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем, существует ли заявка
    const [checkResult] = await pool.query('SELECT id FROM tickets WHERE id = ?', [id]);
    if (checkResult.length === 0) {
      return res.status(404).json({ 
        status: 'error',
        error: 'Өтініш табылмады' // Заявка не найдена
      });
    }

    // Удаляем заявку
    const [deleteResult] = await pool.query('DELETE FROM tickets WHERE id = ?', [id]);
    
    if (deleteResult.affectedRows === 0) {
      return res.status(500).json({ 
        status: 'error',
        error: 'Өтінішті жою мүмкін болмады' // Не удалось удалить заявку
      });
    }

    // Пробуем удалить связанные сообщения и вложения (если такие таблицы существуют)
    try {
      await pool.query('DELETE FROM ticket_messages WHERE ticket_id = ?', [id]);
    } catch (error) {
      console.log('Не удалось удалить сообщения:', error.message);
    }

    try {
      await pool.query('DELETE FROM ticket_attachments WHERE ticket_id = ?', [id]);
    } catch (error) {
      console.log('Не удалось удалить вложения:', error.message);
    }

    return res.json({
      status: 'success',
      message: 'Өтініш сәтті жойылды' // Заявка успешно удалена
    });
  } catch (error) {
    console.error('Ошибка deleteTicket:', error);
    return res.status(500).json({ 
      status: 'error',
      error: 'Өтінішті жою кезінде қате пайда болды', // Ошибка при удалении заявки
      details: error.message
    });
  }
};

/**
 * Обновляет статус заявки (без аутентификации)
 * @param {Object} req - HTTP запрос
 * @param {Object} res - HTTP ответ
 * @returns {Object} Результат операции
 */
exports.updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id, 10);
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    // Проверяем существование заявки
    const [tickets] = await pool.query('SELECT * FROM tickets WHERE id = ?', [numericId]);
    if (!tickets.length) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const [upd] = await pool.query(
      'UPDATE tickets SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, numericId]
    );
    
    if (!upd.affectedRows) {
      return res.status(404).json({ 
        status: 'error',
        error: 'Заявка не найдена или статус не изменен'
      });
    }

    // Возвращаем обновленную заявку
    const [updated] = await pool.query('SELECT * FROM tickets WHERE id = ?', [numericId]);
    
    return res.json({
      status: 'success',
      message: 'Статус заявки успешно обновлен',
      ticket: updated[0]
    });
    
  } catch (error) {
    console.error('Error updateTicketStatus:', error);
    return res.status(500).json({ 
      status: 'error',
      error: 'Ошибка сервера при обновлении статуса'
    });
  }
};