// server.js
require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const app = require('./src/index');
const pool = require('./src/config/database');
const net = require('net');

const PORT = process.env.PORT || 5000;

// Проверка доступности порта
function isPortAvailable(port) {
    return new Promise((resolve) => {
        const tester = net.createServer()
            .once('error', () => {
                // Порт занят
                resolve(false);
            })
            .once('listening', () => {
                // Порт свободен
                tester.close(() => resolve(true));
            })
            .listen(port, '0.0.0.0');
    });
}

// Функция для поиска свободного порта
async function findAvailablePort(startPort) {
    let port = startPort;
    while (!(await isPortAvailable(port))) {
        console.log(`Порт ${port} занят, пробуем следующий...`);
        port++;
        if (port > startPort + 100) {
            throw new Error('Не удалось найти свободный порт после 100 попыток');
        }
    }
    return port;
}

// Обработчики WebSocket сообщений
async function handleMessageStatus(data) {
    try {
        const { message_id, status } = data;
        
        if (!message_id || !status) return;
        
        // Обновляем статус в БД
        if (status === 'delivered') {
            await pool.query(
                'UPDATE ticket_messages SET status = ?, delivered_at = CURRENT_TIMESTAMP WHERE id = ? AND delivered_at IS NULL',
                [status, message_id]
            );
        } else if (status === 'read') {
            await pool.query(
                'UPDATE ticket_messages SET status = ?, read_at = CURRENT_TIMESTAMP, delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP) WHERE id = ? AND read_at IS NULL',
                [status, message_id]
            );
        }
        
        // Получаем информацию о сообщении
        const [messages] = await pool.query(
            'SELECT * FROM ticket_messages WHERE id = ?',
            [message_id]
        );
        
        if (messages.length > 0) {
            const message = messages[0];
            
            // Оповещаем отправителя сообщения через WebSocket
            if (clients.has(message.sender_type)) {
                const clientsMap = clients.get(message.sender_type);
                if (clientsMap.has(message.sender_id)) {
                    const ws = clientsMap.get(message.sender_id);
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'status_update',
                            message_id: message_id,
                            ticket_id: message.ticket_id,
                            status: status,
                            timestamp: new Date().toISOString()
                        }));
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error handling message status:', error);
    }
}


// Функция для обработки нового сообщения чата
async function handleChatMessage(data) {
    try {
        const { ticket_id, content, sender_id, sender_type, attachments = [] } = data;
        
        if (!ticket_id || !content || !sender_id || !sender_type) {
            return;
        }
        
        // Сохраняем сообщение в БД
        const [result] = await pool.query(
            `INSERT INTO ticket_messages (
                ticket_id, sender_type, sender_id, content, content_type, status
            ) VALUES (?, ?, ?, ?, ?, 'sent')`,
            [ticket_id, sender_type, sender_id, content, 'text']
        );
        
        const message_id = result.insertId;
        
        // Привязываем вложения к сообщению, если есть
        if (attachments.length > 0) {
            for (const attachmentId of attachments) {
                await pool.query(
                    'UPDATE ticket_attachments SET message_id = ? WHERE id = ? AND ticket_id = ?',
                    [message_id, attachmentId, ticket_id]
                );
            }
        }
        
        // Обновляем дату изменения заявки
        await pool.query(
            'UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [ticket_id]
        );
        
        // Получаем созданное сообщение для отправки
        const [messages] = await pool.query(
            `SELECT 
                tm.*,
                CASE 
                    WHEN tm.sender_type='requester' THEN r.full_name
                    WHEN tm.sender_type='staff' THEN u.first_name
                    ELSE 'Unknown'
                END as sender_name,
                CASE
                    WHEN tm.sender_type='requester' THEN r.email
                    WHEN tm.sender_type='staff' THEN u.email
                    ELSE NULL
                END as sender_email
            FROM ticket_messages tm
            LEFT JOIN requesters r ON (tm.sender_type='requester' AND tm.sender_id = r.id)
            LEFT JOIN users u ON (tm.sender_type='staff' AND tm.sender_id = u.id)
            WHERE tm.id = ?`,
            [message_id]
        );
        
        if (messages.length > 0) {
            const message = messages[0];
            
            // Получаем ID получателя
            let recipientId;
            let recipientType;
            
            if (sender_type === 'requester') {
                recipientType = 'staff';
                recipientId = '1'; // Дефолтный ID для сотрудника
            } else {
                recipientType = 'requester';
                // Получаем ID клиента из заявки
                const [tickets] = await pool.query(
                    'SELECT requester_id FROM tickets WHERE id = ?',
                    [ticket_id]
                );
                recipientId = tickets.length > 0 ? tickets[0].requester_id : null;
            }
            
            // Оповещаем получателя о новом сообщении
            sendToSpecificClient(recipientType, recipientId, {
                type: 'new_message',
                message: {
                    id: message.id,
                    ticket_id: message.ticket_id,
                    content: message.content,
                    content_type: message.content_type,
                    created_at: message.created_at,
                    sender: {
                        id: message.sender_id,
                        type: message.sender_type,
                        name: message.sender_name,
                        email: message.sender_email
                    },
                    status: 'sent'
                }
            });
            
            // Оповещаем отправителя о успешной отправке
            sendToSpecificClient(sender_type, sender_id, {
                type: 'message_sent',
                message_id: message.id,
                ticket_id: message.ticket_id,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('Error handling chat message:', error);
    }
}

function sendToClient(userType, userId, data) {
    if (clients.has(userType)) {
        const clientsMap = clients.get(userType);
        if (clientsMap.has(userId)) {
            const ws = clientsMap.get(userId);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(data));
                return true;
            }
        }
    }
    return false;
}
// Функция для обработки индикатора набора текста
function handleTypingIndicator(data) {
    try {
        const { ticket_id, sender_id, sender_type, isTyping } = data;
        
        // Определяем получателя
        const recipientType = sender_type === 'requester' ? 'staff' : 'requester';
        
        // Широковещательно отправляем всем сотрудникам, если отправитель - клиент
        if (recipientType === 'staff') {
            broadcastToType('staff', {
                type: 'typing_indicator',
                ticket_id: ticket_id,
                user_id: sender_id,
                user_type: sender_type,
                isTyping: isTyping
            });
        } else {
            // Если нужно отправить конкретному клиенту, нужно найти ID клиента
            // из заявки ticket_id
            pool.query('SELECT requester_id FROM tickets WHERE id = ?', [ticket_id])
                .then(([tickets]) => {
                    if (tickets.length > 0 && tickets[0].requester_id) {
                        sendToSpecificClient('requester', tickets[0].requester_id, {
                            type: 'typing_indicator',
                            ticket_id: ticket_id,
                            user_id: sender_id,
                            user_type: sender_type,
                            isTyping: isTyping
                        });
                    }
                })
                .catch(err => console.error('Error getting requester_id:', err));
        }
    } catch (error) {
        console.error('Error handling typing indicator:', error);
    }
}

// Функция для отправки сообщения определенному клиенту
function sendToSpecificClient(userType, userId, data) {
    if (clients.has(userType) && clients.get(userType).has(userId)) {
        const ws = clients.get(userType).get(userId);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
            return true;
        }
    }
    return false;
}

// Функция для отправки всем клиентам определенного типа
function broadcastToType(userType, data) {
    if (clients.has(userType)) {
        clients.get(userType).forEach((ws, userId) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(data));
            }
        });
    }
}

// Запуск сервера с проверкой порта
async function startServer() {
    try {
        // Проверяем подключение к БД
        const isConnected = await pool.testConnection();
        if (!isConnected) {
            console.error('FATAL: Could not connect to database. Please check your configuration.');
            process.exit(1);
        }
        
        // Проверяем доступность порта
        const isPortFree = await isPortAvailable(PORT);
        const finalPort = isPortFree ? PORT : await findAvailablePort(PORT);
        
        if (finalPort !== PORT) {
            console.log(`Порт ${PORT} занят, используем порт ${finalPort}`);
        }
        
        // Создаем HTTP сервер
        const server = http.createServer(app);
        
        // Запускаем сервер на выбранном порту
        server.listen(finalPort, '0.0.0.0', () => {
            console.log('=================================');
            console.log(`Server started on port ${finalPort}`);
            console.log(`Environment: ${process.env.NODE_ENV}`);
            console.log(`Time: ${new Date().toISOString()}`);
            console.log('=================================');
        });
        
        // Настраиваем WebSocket сервер
        const wss = new WebSocket.Server({
            server,
            path: '/ws',
        });
        
        // Хранение соединений с привязкой к ID пользователя
        const clients = new Map();
        
        wss.on('connection', (ws, req) => {
            // Получаем параметры из URL
            const url = new URL(req.url, `http://localhost:${finalPort}`);
            const userId = url.searchParams.get('userId');
            const userType = url.searchParams.get('userType') || 'requester';
            
            console.log(`WebSocket client connected: userId=${userId}, type=${userType}`);
            
            if (userId) {
                // Сохраняем соединение с привязкой к ID
                if (!clients.has(userType)) {
                    clients.set(userType, new Map());
                }
                clients.get(userType).set(userId, ws);
                
                // Отправляем подтверждение соединения
                ws.send(JSON.stringify({
                    type: 'connection_established',
                    userId: userId,
                    userType: userType,
                    timestamp: new Date().toISOString()
                }));
            }
            
            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    console.log('Received WebSocket message:', data);
                    
                    // Обработка различных типов сообщений
                    switch (data.type) {
                        case 'message_status':
                            // Обновление статуса сообщения
                            await handleMessageStatus(data);
                            break;
                            
                        case 'chat_message':
                            // Сохранение нового сообщения
                            await handleChatMessage(data);
                            break;
                            
                        case 'typing':
                            // Индикатор набора текста
                            handleTypingIndicator(data);
                            break;
                            
                        case 'ping':
                            // Пинг для поддержания соединения
                            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
                            break;
                    }
                } catch (error) {
                    console.error('Error processing WebSocket message:', error);
                }
            });
            
            
            ws.on('close', () => {
                // Удаляем соединение при закрытии
                if (userId) {
                    if (clients.has(userType) && clients.get(userType).has(userId)) {
                        clients.get(userType).delete(userId);
                        console.log(`WebSocket client disconnected: userId=${userId}, type=${userType}`);
                    }
                }
            });
            
            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });
        });
        
        // Function to broadcast updates to all connected WebSocket clients
        const broadcastUpdate = (data, targetType = null, targetId = null) => {
            if (targetType && targetId) {
                // Отправка конкретному клиенту
                sendToClient(targetType, targetId, data);
            } else if (targetType) {
                // Отправка всем клиентам определенного типа
                if (clients.has(targetType)) {
                    clients.get(targetType).forEach((ws, id) => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify(data));
                        }
                    });
                }
            } else {
                // Отправка всем
                clients.forEach((typeClients, type) => {
                    typeClients.forEach((ws, id) => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify(data));
                        }
                    });
                });
            }
        };
        
        // Process event handlers
        process.on('SIGTERM', () => {
            console.log('SIGTERM received. Shutting down gracefully...');
            server.close(() => {
                console.log('Process terminated');
                process.exit(0);
            });
        });
        
        // Экспортируем объекты
        module.exports = { 
            server, 
            broadcastUpdate, 
            sendToClient,
            sendToSpecificClient, 
            broadcastToType,
            clients,
            handleMessageStatus,
            handleChatMessage,
            handleTypingIndicator
        };
        
        return { server, finalPort };
    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
}

// Запускаем сервер
startServer();

// Global error handlers
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Не закрываем процесс, если ошибка связана с занятым портом - функция startServer это обработает
    if (error.code !== 'EADDRINUSE') {
        setTimeout(() => {
            process.exit(1);
        }, 1000);
    }
});