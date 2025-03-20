// src/services/emailService.js
const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Настройка транспорта для отправки email-уведомлений
 * Email хабарландыруларын жіберу үшін транспорт параметрлерін орнату
 */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

/**
 * Отправка уведомления по email о новом сообщении
 * Жаңа хабарлама туралы email арқылы хабарландыру жіберу
 * 
 * @param {Object} ticket - Данные заявки
 * @param {Object} message - Данные сообщения
 * @param {Array} attachments - Вложения сообщения
 * @returns {Promise} - Результат отправки email
 */
exports.sendMessageNotification = async (ticket, message, attachments = []) => {
  // Проверка наличия email получателя
  // Email алушының бар-жоғын тексеру
  if (!ticket.requester_email) {
    throw new Error('Email получателя не указан (Email алушы көрсетілмеген)');
  }

  // Формируем URL для перехода к заявке
  // Өтінімге өту үшін URL жасаймыз
  const ticketUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${ticket.id}`;
  
  // Формируем HTML письма
  // Email-дің HTML мазмұнын жасаймыз
  const html = generateEmailHtml(ticket, message, attachments, ticketUrl);
  
  // Настройки письма
  // Email параметрлері
  const mailOptions = {
    from: `"Служба поддержки" <${process.env.EMAIL_USER}>`,
    to: ticket.requester_email,
    subject: `Новое сообщение в заявке #${ticket.id}`,
    html: html
  };
  
  // Отправляем письмо
  // Email жіберу
  return await transporter.sendMail(mailOptions);
};

/**
 * Генерирует HTML-содержимое для email-уведомления
 * Email-хабарландыру үшін HTML мазмұнын жасайды
 * 
 * @param {Object} ticket - Данные заявки
 * @param {Object} message - Данные сообщения
 * @param {Array} attachments - Вложения сообщения
 * @param {string} ticketUrl - URL для перехода к заявке
 * @returns {string} - HTML-содержимое письма
 */
function generateEmailHtml(ticket, message, attachments, ticketUrl) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f8f9fa;
        }
        .header {
          background: linear-gradient(135deg, #0066cc, #004d99);
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
        .message {
          background-color: #f5f5f5;
          border-left: 4px solid #0066cc;
          padding: 15px;
          margin: 15px 0;
        }
        .button {
          display: inline-block;
          padding: 12px 25px;
          background: #0066cc;
          color: white;
          text-decoration: none;
          border-radius: 4px;
          font-weight: 600;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #666;
          font-size: 12px;
        }
        .attachment {
          background-color: #f8f9fa;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          padding: 10px;
          margin: 10px 0;
          display: inline-block;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Helpdesk</h1>
          <p>Система поддержки клиентов</p>
        </div>
        <div class="content">
          <h2>Новое сообщение в вашей заявке</h2>
          <p>Здравствуйте, ${ticket.requester_name || 'уважаемый клиент'}!</p>
          <p>Вы получили новое сообщение в вашей заявке <strong>#${ticket.id}: ${ticket.subject}</strong>.</p>
          
          <div class="message">
            <p><strong>Сообщение от ${message.sender.name || 'сотрудника службы поддержки'}:</strong></p>
            <p>${message.content || 'Прикреплены файлы. Смотрите раздел вложений.'}</p>
            
            ${attachments.length > 0 ? 
              `<p><strong>Вложения:</strong></p>
              <div>
                ${attachments.map(attachment => `
                  <div class="attachment">
                    <span>📎 ${attachment.file_name}</span>
                  </div>
                `).join('')}
              </div>` : 
              ''
            }
          </div>
          
          <p>Для просмотра полной истории обращения или ответа на сообщение, пожалуйста, перейдите по ссылке:</p>
          <p style="text-align: center;">
            <a href="${ticketUrl}" class="button">Перейти к заявке</a>
          </p>
          
          <p>Если у вас возникли вопросы, вы можете ответить на это письмо или связаться с нами по указанным на сайте контактам.</p>
          
          <p>С уважением,<br>Служба поддержки</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Helpdesk. Все права защищены.</p>
          <p>Это автоматическое уведомление. Пожалуйста, не отвечайте на него напрямую.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}