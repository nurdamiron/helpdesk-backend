// src/controllers/message/uploadAttachment.js
const pool = require('../../config/database');

/**
 * Загрузить вложение к заявке
 * Өтінімге тіркемені жүктеу
 * 
 * @param {Object} req - HTTP запрос
 * @param {Object} res - HTTP ответ
 */
module.exports = async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    console.log(`Запрос на загрузку вложения для заявки #${ticketId}`);
    console.log(`#${ticketId} өтініміне тіркемені жүктеу сұрауы`);
    
    if (!req.file) {
      console.log('Ошибка: файл не загружен');
      console.log('Қате: файл жүктелмеген');
      return res.status(400).json({
        status: 'error',
        error: 'Файл не загружен (Файл жүктелмеген)'
      });
    }
    
    // Проверяем существование заявки
    // Өтінімнің бар-жоғын тексереміз
    const [tickets] = await pool.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    if (tickets.length === 0) {
      console.log(`Заявка #${ticketId} не найдена`);
      console.log(`#${ticketId} өтінімі табылмады`);
      return res.status(404).json({
        status: 'error',
        error: 'Заявка не найдена (Өтінім табылмады)'
      });
    }
    
    const { filename, path, mimetype, size } = req.file;
    const userId = req.user?.id || null;
    
    console.log(`Загрузка файла: ${filename}, размер: ${size}, MIME: ${mimetype}`);
    console.log(`Файлды жүктеу: ${filename}, өлшемі: ${size}, MIME: ${mimetype}`);
    
    // Сохраняем вложение в БД
    // Тіркемені дерекқорға сақтаймыз
    const [result] = await pool.query(`
      INSERT INTO ticket_attachments (
        ticket_id,
        file_name,
        file_path,
        file_type,
        file_size,
        uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [ticketId, filename, path, mimetype, size, userId]);
    
    const attachmentId = result.insertId;
    console.log(`Создано вложение с ID ${attachmentId}`);
    console.log(`ID ${attachmentId} тіркеме жасалды`);
    
    // Получаем данные созданного вложения
    // Жасалған тіркеме туралы мәліметтерді аламыз
    const [attachment] = await pool.query('SELECT * FROM ticket_attachments WHERE id = ?', [attachmentId]);
    
    if (attachment.length === 0) {
      console.log(`Ошибка: не удалось найти созданное вложение ${attachmentId}`);
      console.log(`Қате: жасалған ${attachmentId} тіркемесін табу мүмкін болмады`);
      return res.status(500).json({
        status: 'error',
        error: 'Ошибка при сохранении вложения (Тіркемені сақтау кезіндегі қате)'
      });
    }
    
    // Обновляем дату обновления заявки
    // Өтінімнің жаңарту күнін жаңартамыз
    await pool.query(
      'UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [ticketId]
    );
    
    console.log(`Вложение успешно создано: ${attachment[0].file_name}`);
    console.log(`Тіркеме сәтті жасалды: ${attachment[0].file_name}`);
    
    return res.status(201).json({
      status: 'success',
      attachment: attachment[0]
    });
    
  } catch (error) {
    console.error('Ошибка загрузки вложения:', error);
    console.error('Тіркемені жүктеу қатесі:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Внутренняя ошибка сервера'
    });
  }
};