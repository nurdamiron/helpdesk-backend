const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

const sendVerificationEmail = async (email, verificationToken) => {
    const verificationUrl = `${process.env.FRONTEND_URL}/auth/jwt/verify-email/${verificationToken}`;
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Подтвердите ваш email для Biz360',
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
                        <div class="logo">Biz360</div>
                        <h1>Добро пожаловать!</h1>
                    </div>
                    <div class="content">
                        <h2>Подтвердите ваш email</h2>
                        <p>Спасибо за регистрацию в Biz360 - вашей интеллектуальной платформе для анализа бизнеса.</p>
                        <p>Для завершения регистрации и активации вашего аккаунта, пожалуйста, нажмите на кнопку ниже:</p>
                        
                        <a href="${verificationUrl}" class="button">Подтвердить email</a>
                        
                        <p>Если кнопка не работает, вы можете скопировать и вставить следующую ссылку в ваш браузер:</p>
                        <p style="color:rgb(117, 182, 248);">${verificationUrl}</p>
                        
                        <p>Если вы не регистрировались на Biz360, просто проигнорируйте это письмо.</p>
                        <p>Обратите внимание, что ссылка действительна в течение 24 часов.</p>

                    </div>
                    <div class="footer">
                        <p>Это автоматическое сообщение, пожалуйста, не отвечайте на него.</p>
                        <p>© 2025 Biz360. Все права защищены.</p>
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

module.exports = {
    sendVerificationEmail
};