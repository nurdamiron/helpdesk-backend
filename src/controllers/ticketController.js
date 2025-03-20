// src/controllers/ticketController.js
const pool = require('../config/database');
const nodemailer = require('nodemailer');

// Маппинги для локализации — при желании можно убрать
const CATEGORY_MAP = {
  'repair': 'Ремонтные работы',
  'plumbing': 'Сантехника',
  'electrical': 'Электрика',
  'construction': 'Строительство',
  'design': 'Проектирование',
  'consultation': 'Консультация',
  'estimate': 'Смета и расчеты',
  'materials': 'Материалы',
  'warranty': 'Гарантийный случай',
  'other': 'Другое'
};

const PRIORITY_MAP = {
  'low': 'Низкий',
  'medium': 'Средний',
  'high': 'Высокий',
  'urgent': 'Срочный'
};

const STATUS_MAP = {
  'new': 'Новый',
  'in_progress': 'В работе',
  'pending': 'Ожидает ответа',
  'resolved': 'Решен',
  'closed': 'Закрыт'
};

const PROPERTY_TYPE_MAP = {
  'apartment': 'Квартира',
  'house': 'Частный дом',
  'office': 'Офис',
  'commercial': 'Коммерческое помещение',
  'land': 'Земельный участок',
  'other': 'Другое'
};

// Настраиваем transporter для отправки почты
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Создание тикета
exports.createTicket = async (req, res) => {
  try {
    const {
      subject,
      description,
      priority = 'medium',
      category = 'other',
      metadata = {}
    } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ error: 'Тема и описание обязательны' });
    }

    // Проверяем/создаём requesters (заявителя)
    let requesterId = null;
    const requesterData = metadata.requester || {};
    if (requesterData.email) {
      // Ищем в requesters
      const [existing] = await pool.query('SELECT id FROM requesters WHERE email = ?', [requesterData.email]);
      if (existing.length) {
        requesterId = existing[0].id;
        // Обновим
        await pool.query(
          `UPDATE requesters SET full_name = ?, phone = ?, preferred_contact = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            requesterData.full_name || null,
            requesterData.phone || null,
            requesterData.preferred_contact || 'email',
            requesterId
          ]
        );
      } else {
        // Создадим
        const [ins] = await pool.query(
          `INSERT INTO requesters (email, full_name, phone, preferred_contact)
           VALUES (?, ?, ?, ?)`,
          [
            requesterData.email,
            requesterData.full_name || null,
            requesterData.phone || null,
            requesterData.preferred_contact || 'email'
          ]
        );
        requesterId = ins.insertId;
      }
    }

    // Информация об объекте
    const propertyData = metadata.property || {};

    // Создаём запись в tickets
    const [result] = await pool.query(
      `INSERT INTO tickets
       (subject, description, status, priority, category, requester_id,
        property_type, property_address, property_area)
       VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?)`,
      [
        subject,
        description,
        priority,
        category,
        requesterId,
        propertyData.type || 'apartment',
        propertyData.address || null,
        propertyData.area ? parseFloat(propertyData.area) : null
      ]
    );
    const ticketId = result.insertId;

    // Если есть requesterId — добавим первое сообщение от него в ticket_messages
    if (requesterId) {
      await pool.query(
        `INSERT INTO ticket_messages
         (ticket_id, sender_type, sender_id, content, content_type)
         VALUES (?, 'requester', ?, ?, 'text')`,
        [ticketId, requesterId, description]
      );
    }

    // Отправка почтового уведомления — можно оставить или убрать
    if (requesterData.email) {
      try {
        await sendTicketConfirmationEmail({
          id: ticketId,
          subject,
          description,
          status: 'new',
          priority,
          category,
          created_at: new Date()
        }, {
          email: requesterData.email,
          full_name: requesterData.full_name || 'Клиент',
          phone: requesterData.phone || null,
          property: {
            type: propertyData.type,
            address: propertyData.address,
            area: propertyData.area
          }
        });
      } catch (emailErr) {
        console.error('Ошибка отправки уведомления по email:', emailErr);
      }
    }

    return res.status(201).json({
      ticket: {
        id: ticketId,
        subject,
        description,
        status: 'new',
        priority,
        category,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Ошибка createTicket:', error);
    return res.status(500).json({ error: 'Ошибка при создании заявки' });
  }
};

// Получение списка заявок
exports.getTickets = async (req, res) => {
  try {
    const {
      status,
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

    let query = `
      SELECT
        t.*,
        r.email as requester_email,
        r.full_name as requester_name,
        r.phone as requester_phone
      FROM tickets t
      LEFT JOIN requesters r ON t.requester_id = r.id
    `;
    const whereConditions = [];
    const params = [];

    if (status) {
      whereConditions.push('t.status = ?');
      params.push(status);
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
      whereConditions.push('(t.subject LIKE ? OR t.description LIKE ? OR r.full_name LIKE ? OR r.email LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    if (whereConditions.length) {
      query += ' WHERE ' + whereConditions.join(' AND ');
    }

    // Считаем общее кол-во
    const countQuery = `
      SELECT COUNT(*) as total
      FROM tickets t
      LEFT JOIN requesters r ON t.requester_id = r.id
      ${whereConditions.length ? ' WHERE ' + whereConditions.join(' AND ') : ''}
    `;
    const [countResult] = await pool.query(countQuery, params);
    const totalTickets = countResult[0].total;

    // Добавляем сортировку и лимит
    query += ` ORDER BY t.${sortField} ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(query, params);

    // Форматируем
    const tickets = rows.map(t => ({
      ...t,
      requester: t.requester_id
        ? {
          id: t.requester_id,
          email: t.requester_email,
          full_name: t.requester_name,
          phone: t.requester_phone
        }
        : null
    }));

    return res.json({
      data: tickets,
      total: totalTickets,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(totalTickets / limit)
    });
  } catch (error) {
    console.error('Ошибка получения списка заявок:', error);
    return res.status(500).json({ error: 'Ошибка при получении заявок' });
  }
};

// Получение заявки по ID
exports.getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const [tickets] = await pool.query(`
      SELECT
        t.*,
        r.email as requester_email,
        r.full_name as requester_name,
        r.phone as requester_phone
      FROM tickets t
      LEFT JOIN requesters r ON t.requester_id = r.id
      WHERE t.id = ?
    `, [id]);

    if (!tickets.length) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }
    const ticket = tickets[0];

    // Сообщения
    const [messages] = await pool.query(`
      SELECT
        tm.*,
        CASE WHEN tm.sender_type='requester' THEN r.full_name
             WHEN tm.sender_type='staff' THEN u.first_name
             ELSE 'Unknown'
        END as sender_name
      FROM ticket_messages tm
      LEFT JOIN requesters r ON (tm.sender_type='requester' AND tm.sender_id = r.id)
      LEFT JOIN users u ON (tm.sender_type='staff' AND tm.sender_id = u.id)
      WHERE tm.ticket_id = ?
      ORDER BY tm.created_at ASC
    `, [id]);

    // Вложения
    const [attachments] = await pool.query(`
      SELECT * FROM ticket_attachments
      WHERE ticket_id = ?
      ORDER BY created_at DESC
    `, [id]);

    return res.json({
      ticket: {
        ...ticket,
        requester: ticket.requester_id
          ? {
            id: ticket.requester_id,
            email: ticket.requester_email,
            full_name: ticket.requester_name,
            phone: ticket.requester_phone
          }
          : null,
        messages: messages.map(m => ({
          ...m,
          sender: {
            id: m.sender_id,
            name: m.sender_name,
            type: m.sender_type
          }
        })),
        attachments
      }
    });
  } catch (error) {
    console.error('Ошибка getTicketById:', error);
    return res.status(500).json({ error: 'Ошибка при получении заявки' });
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
      assigned_to,
      property_type,
      property_address,
      property_area
    } = req.body;

    // Проверяем, что заявка есть
    const [existing] = await pool.query('SELECT * FROM tickets WHERE id = ?', [id]);
    if (!existing.length) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }

    let updateQuery = 'UPDATE tickets SET updated_at=CURRENT_TIMESTAMP';
    const params = [];

    if (subject !== undefined) {
      updateQuery += ', subject=?';
      params.push(subject);
    }
    if (description !== undefined) {
      updateQuery += ', description=?';
      params.push(description);
    }
    if (status !== undefined) {
      updateQuery += ', status=?';
      params.push(status);
    }
    if (priority !== undefined) {
      updateQuery += ', priority=?';
      params.push(priority);
    }
    if (category !== undefined) {
      updateQuery += ', category=?';
      params.push(category);
    }
    // Поле assigned_to можно удалять или оставить, если нужно, но у нас нет сотрудников
    if (property_type !== undefined) {
      updateQuery += ', property_type=?';
      params.push(property_type);
    }
    if (property_address !== undefined) {
      updateQuery += ', property_address=?';
      params.push(property_address);
    }
    if (property_area !== undefined) {
      updateQuery += ', property_area=?';
      params.push(property_area !== null ? parseFloat(property_area) : null);
    }

    updateQuery += ' WHERE id=?';
    params.push(id);

    if (params.length > 1) {
      const [upd] = await pool.query(updateQuery, params);
      if (!upd.affectedRows) {
        return res.status(404).json({ error: 'Обновление не выполнено' });
      }
    }

    // Возвращаем свежую версию
    const [updatedTicket] = await pool.query('SELECT * FROM tickets WHERE id=?', [id]);
    return res.json({
      message: 'Заявка успешно обновлена',
      ticket: updatedTicket[0]
    });
  } catch (error) {
    console.error('Ошибка updateTicket:', error);
    return res.status(500).json({ error: 'Ошибка при обновлении заявки' });
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
    const [result] = await pool.query('DELETE FROM tickets WHERE id=?', [id]);
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }
    return res.json({ message: 'Заявка удалена' });
  } catch (error) {
    console.error('Ошибка deleteTicket:', error);
    return res.status(500).json({ error: 'Ошибка при удалении заявки' });
  }
};

/**
 * Отправка письма-подтверждения о создании заявки
 * @param {Object} ticketData - Данные заявки
 * @param {Object} userData - Данные пользователя
 */
async function sendTicketConfirmationEmail(ticketData, userData) {
  // Формируем URL для отслеживания заявки
  const trackingUrl = `${process.env.FRONTEND_URL || 'https://helpdesk-client-iota.vercel.app'}/tickets/${ticketData.id}`;
  
  // Форматирование даты
  const formatDate = (date) => {
    return new Date(date).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // HTML-содержимое письма
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: Arial, Helvetica, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 0;
        }
        
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f9f9f9;
        }
        
        .header {
          background: linear-gradient(135deg, #ff6600, #cc5200);
          color: white;
          padding: 30px;
          text-align: center;
          border-radius: 5px 5px 0 0;
        }
        
        .content {
          background: white;
          padding: 30px;
          border-radius: 0 0 5px 5px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        
        .ticket-info {
          background-color: #f5f5f5;
          border-left: 4px solid #ff6600;
          padding: 15px;
          margin: 20px 0;
        }
        
        .button {
          display: inline-block;
          padding: 12px 30px;
          background: #ff6600;
          color: white;
          text-decoration: none;
          border-radius: 5px;
          margin: 20px 0;
          font-weight: bold;
          text-align: center;
        }
        
        .footer {
          text-align: center;
          margin-top: 20px;
          color: #666;
          font-size: 12px;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
        }
        
        th, td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
        
        th {
          background-color: #f2f2f2;
          font-weight: bold;
          width: 30%;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Строительная Помощь</h1>
          <p>Портал клиентской поддержки</p>
        </div>
        <div class="content">
          <h2>Спасибо за вашу заявку!</h2>
          <p>Уважаемый(ая) <strong>${userData.full_name || 'Клиент'}</strong>,</p>
          <p>Ваша заявка успешно создана и принята в обработку. Наши специалисты свяжутся с вами в ближайшее время.</p>
          
          <div class="ticket-info">
            <h3>Информация о заявке</h3>
            <table>
              <tr>
                <th>Номер заявки:</th>
                <td>#${ticketData.id}</td>
              </tr>
              <tr>
                <th>Тема:</th>
                <td>${ticketData.subject}</td>
              </tr>
              <tr>
                <th>Категория:</th>
                <td>${CATEGORY_MAP[ticketData.category] || ticketData.category}</td>
              </tr>
              <tr>
                <th>Приоритет:</th>
                <td>${PRIORITY_MAP[ticketData.priority] || ticketData.priority}</td>
              </tr>
              <tr>
                <th>Дата создания:</th>
                <td>${formatDate(ticketData.created_at)}</td>
              </tr>
            </table>
            
            <h3>Описание заявки:</h3>
            <p>${ticketData.description}</p>
            
            <h3>Ваши контактные данные:</h3>
            <table>
              <tr>
                <th>ФИО:</th>
                <td>${userData.full_name || '-'}</td>
              </tr>
              <tr>
                <th>Email:</th>
                <td>${userData.email}</td>
              </tr>
              ${userData.phone ? `
              <tr>
                <th>Телефон:</th>
                <td>${userData.phone}</td>
              </tr>` : ''}
            </table>
            
            ${userData.property ? `
            <h3>Информация об объекте:</h3>
            <table>
              ${userData.property.type ? `
              <tr>
                <th>Тип объекта:</th>
                <td>${PROPERTY_TYPE_MAP[userData.property.type] || userData.property.type}</td>
              </tr>` : ''}
              ${userData.property.address ? `
              <tr>
                <th>Адрес:</th>
                <td>${userData.property.address}</td>
              </tr>` : ''}
              ${userData.property.area ? `
              <tr>
                <th>Площадь:</th>
                <td>${userData.property.area} м²</td>
              </tr>` : ''}
            </table>` : ''}
          </div>
          
          <p>Для отслеживания статуса вашей заявки, вы можете перейти по ссылке ниже:</p>
          <div style="text-align: center;">
            <a href="${trackingUrl}" class="button">Отслеживать заявку</a>
          </div>
          
          <p>Ожидаемые сроки обработки заявок:</p>
          <ul>
            <li>Первичная обработка: до 24 часов</li>
            <li>Консультации: 1-2 рабочих дня</li>
            <li>Сложные запросы: до 5 рабочих дней</li>
          </ul>
          
          <p>Если у вас возникнут вопросы, вы можете связаться с нами по указанным на сайте контактам.</p>
          
          <p>С уважением,<br>Команда Строительной Помощи</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Строительная Помощь. Все права защищены.</p>
          <p>Это автоматическое уведомление. Пожалуйста, не отвечайте на это письмо.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  // Настройки письма
  const mailOptions = {
    from: `"Строительная Помощь" <${process.env.EMAIL_USER}>`,
    to: userData.email,
    subject: `Заявка #${ticketData.id} успешно создана - Строительная Помощь`,
    html: htmlContent
  };
  
  // Отправляем письмо
  return await transporter.sendMail(mailOptions);
}