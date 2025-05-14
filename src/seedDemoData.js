// Скрипт для добавления демо-данных в базу данных
const pool = require('./config/database');

// Демо пользователи
const mockUsers = [
    { id: 1, email: 'admin@example.com', first_name: 'Админ', last_name: 'Системы', role: 'admin', is_active: 1 },
    { id: 2, email: 'moderator@example.com', first_name: 'Модератор', last_name: 'Поддержки', role: 'moderator', is_active: 1 },
    { id: 3, email: 'user@example.com', first_name: 'Обычный', last_name: 'Пользователь', role: 'user', is_active: 1 }
];

// Демо тикеты
const demoTickets = [
    // Тикеты для admin
    {
        subject: 'Проблема с отоплением',
        description: 'В квартире холодно, батареи едва теплые',
        status: 'new',
        priority: 'high',
        category: 'repair',
        requester_id: mockUsers[0].id,
        property_type: 'apartment',
        property_address: 'ул. Пушкина, д. 10, кв. 5',
        property_area: '75',
        user_id: mockUsers[0].id
    },
    {
        subject: 'Не работает лифт',
        description: 'Лифт застревает между этажами',
        status: 'in_progress',
        priority: 'high',
        category: 'electrical',
        requester_id: mockUsers[0].id,
        assigned_to: mockUsers[1].id,
        property_type: 'apartment',
        property_address: 'ул. Ленина, д. 5, кв. 12',
        property_area: '60',
        user_id: mockUsers[0].id
    },
    
    // Тикеты для moderator
    {
        subject: 'Течет крыша',
        description: 'После дождя на потолке появляются подтеки',
        status: 'pending',
        priority: 'medium',
        category: 'repair',
        requester_id: mockUsers[1].id,
        assigned_to: mockUsers[1].id,
        property_type: 'house',
        property_address: 'ул. Садовая, д. 3',
        property_area: '120',
        user_id: mockUsers[1].id
    },
    {
        subject: 'Замена электропроводки',
        description: 'Требуется полная замена проводки в доме',
        status: 'resolved',
        priority: 'low',
        category: 'electrical',
        requester_id: mockUsers[1].id,
        assigned_to: mockUsers[1].id,
        property_type: 'house',
        property_address: 'ул. Цветочная, д. 7',
        property_area: '90',
        user_id: mockUsers[1].id
    },
    
    // Тикеты для user
    {
        subject: 'Замена сантехники',
        description: 'Необходимо заменить унитаз и раковину',
        status: 'new',
        priority: 'medium',
        category: 'plumbing',
        requester_id: mockUsers[2].id,
        property_type: 'apartment',
        property_address: 'пр. Мира, д. 15, кв. 7',
        property_area: '50',
        user_id: mockUsers[2].id
    },
    {
        subject: 'Консультация по материалам',
        description: 'Нужна консультация по выбору материалов для отделки',
        status: 'resolved',
        priority: 'low',
        category: 'consultation',
        requester_id: mockUsers[2].id,
        assigned_to: mockUsers[1].id,
        property_type: 'apartment',
        property_address: 'ул. Спортивная, д. 8, кв. 3',
        property_area: '65',
        user_id: mockUsers[2].id
    }
];

// Функция для добавления демо-тикетов
async function addDemoTickets() {
    try {
        console.log('Adding demo tickets...');
        
        // Проверяем, есть ли уже тикеты в базе
        const [ticketsCount] = await pool.query('SELECT COUNT(*) as count FROM tickets');
        
        if (ticketsCount[0].count > 0) {
            console.log(`Database already has ${ticketsCount[0].count} tickets. Skipping seed.`);
            return;
        }
        
        // Добавляем демо-тикеты
        for (const ticket of demoTickets) {
            await pool.query(`
                INSERT INTO tickets 
                (subject, description, status, priority, category, requester_id, assigned_to, 
                property_type, property_address, property_area, user_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                ticket.subject,
                ticket.description,
                ticket.status,
                ticket.priority,
                ticket.category,
                ticket.requester_id,
                ticket.assigned_to || null,
                ticket.property_type,
                ticket.property_address,
                ticket.property_area,
                ticket.user_id
            ]);
        }
        
        console.log('Demo tickets added successfully!');
    } catch (error) {
        console.error('Error adding demo tickets:', error);
    }
}

// Функция для добавления демо-пользователей
async function addDemoUsers() {
    try {
        console.log('Adding demo users...');
        
        // Проверяем, есть ли уже пользователи в базе
        const [usersCount] = await pool.query('SELECT COUNT(*) as count FROM users');
        
        if (usersCount[0].count > 0) {
            console.log(`Database already has ${usersCount[0].count} users. Checking if we need to update is_active...`);
            
            // Обновляем is_active для существующих пользователей
            await pool.query('UPDATE users SET is_active = 1');
            console.log('Updated all existing users to active status.');
            
            // Не добавляем новых пользователей
            return;
        }
        
        // Добавляем демо-пользователей
        for (const user of mockUsers) {
            await pool.query(`
                INSERT INTO users 
                (id, email, first_name, last_name, role, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                user.id,
                user.email,
                user.first_name,
                user.last_name,
                user.role,
                user.is_active
            ]);
        }
        
        console.log('Demo users added successfully!');
    } catch (error) {
        console.error('Error adding demo users:', error);
    }
}

// Выполняем функции добавления демо-данных
async function seedAllDemoData() {
    await addDemoUsers();
    await addDemoTickets();
}

seedAllDemoData();