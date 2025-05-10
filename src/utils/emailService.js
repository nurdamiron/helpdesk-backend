// src/utils/emailService.js
const nodemailer = require('nodemailer');

// Создаем транспорт для отправки email, используя SMTP настройки
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true' ? true : false,
    auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD
    }
});

const sendVerificationEmail = async (email, verificationToken) => {
    const verificationUrl = `${process.env.FRONTEND_URL}/auth/jwt/verify-email/${verificationToken}`;
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Подтвердите ваш email для Helpdesk',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
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
                        border-radius: 10px 10px 0 0;
                    }
                    .content {
                        background: white;
                        padding: 30px;
                        border-radius: 0 0 10px 10px;
                        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                    }
                    .button {
                        display: inline-block;
                        padding: 12px 30px;
                        background: linear-gradient(135deg, #0066cc, #004d99);
                        color: white;
                        text-decoration: none;
                        border-radius: 25px;
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
                    .logo {
                        font-size: 24px;
                        font-weight: bold;
                        color: white;
                        margin-bottom: 10px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="logo">Helpdesk</div>
                        <h1>Добро пожаловать!</h1>
                    </div>
                    <div class="content">
                        <h2>Подтвердите ваш email</h2>
                        <p>Спасибо за регистрацию в Helpdesk - вашей интеллектуальной платформе для службы поддержки.</p>
                        <p>Для завершения регистрации и активации вашего аккаунта, пожалуйста, нажмите на кнопку ниже:</p>
                        
                        <a href="${verificationUrl}" class="button">Подтвердить email</a>
                        
                        <p>Если кнопка не работает, вы можете скопировать и вставить следующую ссылку в ваш браузер:</p>
                        <p style="color:rgb(117, 182, 248);">${verificationUrl}</p>
                        
                        <p>Если вы не регистрировались на Helpdesk, просто проигнорируйте это письмо.</p>
                        <p>Обратите внимание, что ссылка действительна в течение 24 часов.</p>

                    </div>
                    <div class="footer">
                        <p>Это автоматическое сообщение, пожалуйста, не отвечайте на него.</p>
                        <p>© 2025 Helpdesk. Все права защищены.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Verification email sent successfully');
    } catch (error) {
        console.error('Error sending verification email:', error);
        throw error;
    }
};

/**
 * Отправляет уведомление о созданной заявке на указанный email
 * Жасалған өтініш туралы хабарландыруды көрсетілген email-ге жібереді
 * 
 * @param {string} email - Email получателя
 * @param {Object} ticket - Данные заявки
 * @returns {Promise} - Результат отправки
 */
const sendTicketCreationNotification = async (email, ticket) => {
    if (!email || !ticket) {
        console.error('Email немесе өтініш деректері көрсетілмеген');
        return;
    }
    
    const ticketNumber = ticket.id || 'N/A';
    const ticketSubject = ticket.subject || 'Көрсетілмеген';
    const customerName = ticket.metadata?.requester?.full_name || email;
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `Өтініш #${ticketNumber} қабылданды - HelpDesk`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
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
                        border-radius: 10px 10px 0 0;
                    }
                    .content {
                        background: white;
                        padding: 30px;
                        border-radius: 0 0 10px 10px;
                        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                    }
                    .button {
                        display: inline-block;
                        padding: 12px 30px;
                        background: linear-gradient(135deg, #0066cc, #004d99);
                        color: white;
                        text-decoration: none;
                        border-radius: 25px;
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
                    .ticket-info {
                        background-color: #f0f7ff;
                        padding: 15px;
                        border-radius: 5px;
                        margin: 15px 0;
                    }
                    .ticket-info p {
                        margin: 5px 0;
                    }
                    .logo {
                        font-size: 24px;
                        font-weight: bold;
                        color: white;
                        margin-bottom: 10px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="logo">HelpDesk</div>
                        <h1>Сіздің өтінішіңіз қабылданды!</h1>
                    </div>
                    <div class="content">
                        <h2>Құрметті ${customerName},</h2>
                        <p>Сіздің өтінішіңіз сәтті тіркелді. Біздің командамыз оны қарап, мүмкіндігінше тезірек жауап береді.</p>
                        
                        <div class="ticket-info">
                            <h3>Өтініш туралы ақпарат:</h3>
                            <p><strong>Нөмірі:</strong> #${ticketNumber}</p>
                            <p><strong>Тақырыбы:</strong> ${ticketSubject}</p>
                            <p><strong>Күні:</strong> ${new Date().toLocaleDateString('kk-KZ')}</p>
                        </div>
                        
                        <p>Өтінішіңіздің барысын бақылау үшін, төмендегі сілтемені басыңыз:</p>
                        
                        <a href="${process.env.FRONTEND_URL}/tickets/${ticketNumber}" class="button">Өтініш барысын тексеру</a>
                        
                        <p>Қосымша сұрақтарыңыз болса, осы хатқа жауап беріңіз немесе біздің қолдау қызметіне хабарласыңыз.</p>
                        
                        <p>Құрметпен,<br>HelpDesk командасы</p>
                    </div>
                    <div class="footer">
                        <p>Бұл автоматты хабарлама, оған жауап бермеңіз.</p>
                        <p>© 2025 HelpDesk. Барлық құқықтар қорғалған.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Ticket creation notification sent to: ${email}`);
        return true;
    } catch (error) {
        console.error('Error sending ticket notification email:', error);
        throw error;
    }
};

module.exports = {
    sendVerificationEmail,
    sendTicketCreationNotification
};