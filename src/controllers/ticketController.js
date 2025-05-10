// src/controllers/ticketController.js
const nodemailer = require('nodemailer');
const pool = require('../config/database');
const { sendTicketCreationNotification } = require('../utils/emailService');

// Маппинги для локализации
const CATEGORY_MAP = {
  'repair': 'Жөндеу жұмыстары',
  'plumbing': 'Сантехника',
  'electrical': 'Электрика',
  'construction': 'Құрылыс',
  'design': 'Жобалау',
  'consultation': 'Кеңес беру',
  'estimate': 'Смета және есептеулер',
  'materials': 'Материалдар',
  'warranty': 'Кепілдік жағдайы',
  'other': 'Басқа'
};

const PRIORITY_MAP = {
  'low': 'Төмен',
  'medium': 'Орташа',
  'high': 'Жоғары',
  'urgent': 'Шұғыл'
};

const STATUS_MAP = {
  'new': 'Жаңа', // Новый
  'in_review': 'Қарастыру үстінде', // На рассмотрении
  'in_progress': 'Жұмыс істеуде', // В работе
  'pending': 'Жауап күтілуде', // Ожидает ответа
  'resolved': 'Шешілген', // Решен
  'closed': 'Жабылған' // Закрыт
};

const TYPE_MAP = {
  'complaint': 'Шағым', // Жалоба
  'suggestion': 'Ұсыныс', // Предложение
  'request': 'Сұраныс', // Запрос
  'other': 'Басқа' // Другое
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
      type = 'request', 
      priority = 'medium', 
      category = 'general',
      metadata = {}
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
    
    // Получаем данные сотрудника из metadata, если есть
    let requesterMetadataJSON = '{}';
    if (metadata.employee) {
      requesterMetadataJSON = JSON.stringify(metadata.employee);
    }

    // Вставка заявки
    const [result] = await pool.query(
      `INSERT INTO tickets (subject, description, priority, category, status, metadata, requester_metadata) 
       VALUES (?, ?, ?, ?, 'new', ?, ?)`,
      [subject, description, priority, category, metadataJSON, requesterMetadataJSON]
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

    // Отправляем письмо-подтверждение, если есть email
    let emailSent = false;
    if (userData.email) {
      try {
        // Используем новую функцию отправки уведомлений
        await sendTicketCreationNotification(userData.email, ticket);
        console.log(`Өтініш туралы хабарлама ${userData.email} адресіне жіберілді`);
        emailSent = true;
      } catch (emailError) {
        console.error('Email жіберу кезінде қате:', emailError);
        // Продолжаем выполнение, даже если не удалось отправить письмо
      }
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
      category,
      search,
      page = 1,
      limit = 10,
      sort = 'created_at',
      order = 'DESC'
    } = req.query;

    const allowedSortFields = ['id', 'subject', 'created_at', 'updated_at', 'status', 'priority', 'category'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    // Изменяем запрос, чтобы не требовалась таблица employees
    let query = `
      SELECT
        t.*,
        COALESCE(u.first_name, '') as assigned_first_name,
        COALESCE(u.last_name, '') as assigned_last_name
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE 1=1
    `;
    const whereConditions = [];
    const params = [];

    if (status) {
      whereConditions.push('t.status = ?');
      params.push(status);
    }
    // Для фильтрации по типу нужно использовать JSON_EXTRACT, если тип хранится в metadata
    if (type) {
      whereConditions.push("JSON_EXTRACT(t.metadata, '$.type') = ?");
      params.push(type);
    }
    if (priority) {
      whereConditions.push('t.priority = ?');
      params.push(priority);
    }
    if (category) {
      whereConditions.push('t.category = ?');
      params.push(category);
    }
    if (search) {
      whereConditions.push('(t.subject LIKE ? OR t.description LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s);
    }

    if (whereConditions.length) {
      query += ' AND ' + whereConditions.join(' AND ');
    }

    // Считаем общее кол-во без использования таблицы employees
    const countQuery = `
      SELECT COUNT(*) as total
      FROM tickets t
      ${whereConditions.length ? ' WHERE ' + whereConditions.join(' AND ') : ''}
    `;

    const [totalRows] = await pool.query(countQuery, params);
    const total = totalRows[0].total;

    query += ` ORDER BY t.${sortField} ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const [rows] = await pool.query(query, params);

    // Преобразуем результаты для включения локализованных текстов
    const result = rows.map(ticket => {
      let ticketType = 'request'; // Тип по умолчанию
      
      // Извлекаем тип из metadata, если он там есть
      if (ticket.metadata) {
        try {
          const metadata = JSON.parse(ticket.metadata);
          if (metadata.type) {
            ticketType = metadata.type;
          }
        } catch (e) {
          console.error('Ошибка при парсинге metadata:', e);
        }
      }
      
      return {
        ...ticket,
        type: ticketType,
        status_text: STATUS_MAP[ticket.status] || ticket.status,
        priority_text: PRIORITY_MAP[ticket.priority] || ticket.priority,
        category_text: CATEGORY_MAP[ticket.category] || ticket.category,
        type_text: TYPE_MAP[ticketType] || ticketType,
        property_type_text: PROPERTY_TYPE_MAP[ticket.property_type] || ticket.property_type,
      };
    });

    return res.json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      tickets: result
    });
  } catch (error) {
    console.error('Ошибка получения списка заявок:', error);
    return res.status(500).json({ 
      error: 'Ошибка при получении списка заявок',
      details: error.message
    });
  }
};

// Получение заявки по ID
exports.getTicketById = async (req, res) => {
  try {
    const { id } = req.params;

    // Получаем данные заявки без JOIN с таблицей employees
    const [tickets] = await pool.query(
      `SELECT * FROM tickets WHERE id = ?`,
      [id]
    );

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
        const metadata = JSON.parse(ticket.metadata);
        if (metadata.type) {
          ticketType = metadata.type;
        }
      } catch (e) {
        console.error('Ошибка парсинга metadata:', e);
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

    // Попробуем получить сообщения заявки
    try {
      const [messages] = await pool.query(
        `SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC`,
        [id]
      );
      ticket.messages = messages;
    } catch (error) {
      // Если таблицы нет или другая ошибка, просто вернем пустой массив
      console.log('Не удалось получить сообщения:', error.message);
      ticket.messages = [];
    }

    // Добавляем локализованные тексты
    ticket.status_text = STATUS_MAP[ticket.status] || ticket.status;
    ticket.priority_text = PRIORITY_MAP[ticket.priority] || ticket.priority;
    ticket.category_text = CATEGORY_MAP[ticket.category] || ticket.category;
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
      category,
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
      ...(metadata.additional || {}),
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
    if (category !== undefined) {
      updateFields.push('category = ?');
      updateValues.push(category);
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
    if (metadata.requester || metadata.employee) {
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
        const metadata = JSON.parse(ticket.metadata);
        if (metadata.type) {
          ticketType = metadata.type;
        }
      } catch (e) {
        console.error('Ошибка парсинга metadata:', e);
      }
    }
    ticket.type = ticketType;

    // Добавляем локализованные тексты
    ticket.status_text = STATUS_MAP[ticket.status] || ticket.status;
    ticket.priority_text = PRIORITY_MAP[ticket.priority] || ticket.priority;
    ticket.category_text = CATEGORY_MAP[ticket.category] || ticket.category;
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
    const { content, sender_type = 'staff', content_type = 'text', sender_id } = req.body;

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