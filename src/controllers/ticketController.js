// src/controllers/ticketController.js
const pool = require('../config/database');
const nodemailer = require('nodemailer');

// Создаем транспорт для отправки писем
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Маппинг категорий на русский язык
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

// Маппинг приоритетов на русский язык
const PRIORITY_MAP = {
  'low': 'Низкий',
  'medium': 'Средний',
  'high': 'Высокий',
  'urgent': 'Срочный'
};

// Маппинг статусов на русский язык
const STATUS_MAP = {
  'new': 'Новый',
  'in_progress': 'В работе',
  'resolved': 'Решен',
  'closed': 'Закрыт'
};

// Маппинг типов объектов на русский язык
const PROPERTY_TYPE_MAP = {
  'apartment': 'Квартира',
  'house': 'Частный дом',
  'office': 'Офис',
  'commercial': 'Коммерческое помещение',
  'land': 'Земельный участок',
  'other': 'Другое'
};

// Создание нового тикета
exports.createTicket = async (req, res) => {
  try {
    const { subject, description, priority, category, metadata } = req.body;
    const status = 'new';
    
    console.log('Создание заявки:', { subject, category: category || 'other', priority: priority || 'medium' });
    
    // Проверяем наличие обязательных полей
    if (!subject || !description) {
      return res.status(400).json({ 
        error: 'Тема и описание заявки обязательны' 
      });
    }

    // Проверим, существует ли хотя бы одна компания в БД
    const [companies] = await pool.query('SELECT id FROM companies LIMIT 1');
    const companyId = companies.length > 0 ? companies[0].id : null;
    
    // Проверим, существует ли хотя бы один пользователь в БД
    const [users] = await pool.query('SELECT id FROM users LIMIT 1');
    const userId = users.length > 0 ? users[0].id : null;
    
    // Проверим поля на NULL для избежания ошибок с внешними ключами
    let query = '';
    let params = [];
    
    if (userId !== null && companyId !== null) {
      query = `INSERT INTO tickets (subject, description, status, priority, category, created_by, company_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)`;
      params = [subject, description, status, priority || 'medium', category || 'other', userId, companyId];
    } else if (userId !== null && companyId === null) {
      query = `INSERT INTO tickets (subject, description, status, priority, category, created_by)
               VALUES (?, ?, ?, ?, ?, ?)`;
      params = [subject, description, status, priority || 'medium', category || 'other', userId];
    } else if (userId === null && companyId !== null) {
      // Если в вашей БД created_by может быть NULL
      query = `INSERT INTO tickets (subject, description, status, priority, category, company_id)
               VALUES (?, ?, ?, ?, ?, ?)`;
      params = [subject, description, status, priority || 'medium', category || 'other', companyId];
    } else {
      // Если ваша БД позволяет created_by и company_id быть NULL
      query = `INSERT INTO tickets (subject, description, status, priority, category)
               VALUES (?, ?, ?, ?, ?)`;
      params = [subject, description, status, priority || 'medium', category || 'other'];
    }
    
    // Создаем запись о тикете
    const [ticketResult] = await pool.query(query, params);
    
    const ticketId = ticketResult.insertId;
    console.log(`Создан тикет с ID: ${ticketId}`);
    
    // Данные для email-уведомления
    let emailData = null;
    
    // Обрабатываем метаданные, если они есть
    if (metadata && metadata.requester && metadata.requester.email) {
      emailData = {
        email: metadata.requester.email,
        full_name: metadata.requester.full_name || 'Клиент',
        phone: metadata.requester.phone || null,
        property: metadata.property || null
      };
      
      // Отправляем email-уведомление
      try {
        await sendTicketConfirmationEmail({
          id: ticketId,
          subject,
          description,
          status,
          priority: priority || 'medium',
          category: category || 'other',
          created_at: new Date()
        }, emailData);
        
        console.log(`Email-уведомление отправлено на адрес: ${emailData.email}`);
      } catch (emailError) {
        console.error('Ошибка при отправке email-уведомления:', emailError);
        // Продолжаем выполнение даже в случае ошибки отправки
      }
    }
    
    // Если есть сообщения, добавляем их
    if (req.body.messages && req.body.messages.length) {
      for (const message of req.body.messages) {
        try {
          await pool.query(
            `INSERT INTO ticket_messages (ticket_id, body, content_type)
             VALUES (?, ?, ?)`,
            [ticketId, message.body, message.content_type || 'text']
          );
        } catch (messageError) {
          console.error('Не удалось добавить сообщение:', messageError);
          // Продолжаем даже если сообщение не добавлено
        }
      }
    }
    
    return res.status(201).json({
      ticket: {
        id: ticketId,
        subject,
        description,
        status,
        priority: priority || 'medium',
        category: category || 'other',
        created_at: new Date().toISOString(),
        email_sent: !!emailData
      }
    });
  } catch (error) {
    console.error('Ошибка при создании тикета:', error);
    return res.status(500).json({ error: 'Ошибка сервера при создании заявки' });
  }
};

// Получение списка тикетов
exports.getTickets = async (req, res) => {
  try {
    // Можно добавить фильтрацию по компании, статусу, автору и т.д.
    const [rows] = await pool.query(
      'SELECT * FROM tickets ORDER BY created_at DESC'
    );
    return res.json({ tickets: rows });
  } catch (error) {
    console.error('Error in getTickets:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Получение деталей конкретного тикета
exports.getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT * FROM tickets WHERE id = ?',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    return res.json({ ticket: rows[0] });
  } catch (error) {
    console.error('Error in getTicketById:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Обновление тикета
exports.updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, description, status, priority, assigned_to, company_id } = req.body;
    
    // Создаем базовый запрос
    let query = 'UPDATE tickets SET updated_at = CURRENT_TIMESTAMP';
    const params = [];
    
    // Добавляем параметры, которые нужно обновить
    if (subject) {
      query += ', subject = ?';
      params.push(subject);
    }
    
    if (description) {
      query += ', description = ?';
      params.push(description);
    }
    
    if (status) {
      query += ', status = ?';
      params.push(status);
    }
    
    if (priority) {
      query += ', priority = ?';
      params.push(priority);
    }
    
    if (assigned_to !== undefined) {
      query += ', assigned_to = ?';
      params.push(assigned_to === null ? null : assigned_to);
    }
    
    if (company_id !== undefined) {
      query += ', company_id = ?';
      params.push(company_id === null ? null : company_id);
    }
    
    // Добавляем условие WHERE
    query += ' WHERE id = ?';
    params.push(id);
    
    // Выполняем запрос
    const [result] = await pool.query(query, params);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Ticket not found or update failed' });
    }
    
    return res.json({ message: 'Ticket updated successfully' });
  } catch (error) {
    console.error('Error in updateTicket:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Удаление тикета
exports.deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      'DELETE FROM tickets WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Ticket not found or deletion failed' });
    }
    return res.json({ message: 'Ticket deleted successfully' });
  } catch (error) {
    console.error('Error in deleteTicket:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Отправка email-уведомления о создании тикета
 * @param {Object} ticketData - Данные тикета
 * @param {Object} userData - Данные пользователя
 * @returns {Promise<void>}
 */
async function sendTicketConfirmationEmail(ticketData, userData) {
  // Формируем URL для отслеживания заявки
  const trackingUrl = `${process.env.FRONTEND_URL || 'https://helpdesk-ten-omega.vercel.app'}/tickets/${ticketData.id}`;
  
  // Форматируем дату
  const formatDate = (date) => {
    return new Date(date).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // Формируем HTML-содержимое письма
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
          <p>© 2025 Строительная Помощь. Все права защищены.</p>
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