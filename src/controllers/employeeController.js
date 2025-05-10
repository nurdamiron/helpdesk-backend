// src/controllers/employeeController.js
const pool = require('../config/database');

/**
 * Контроллер для работы с сотрудниками (employees).
 */
exports.createEmployee = async (req, res) => {
  try {
    const { email, full_name, phone, department, position, preferred_contact } = req.body;
    if (!email || !full_name) {
      return res.status(400).json({ error: 'Email и полное имя обязательны' });
    }

    const [existing] = await pool.query('SELECT * FROM employees WHERE email=?', [email]);
    if (existing.length) {
      // Обновим
      await pool.query(
        `UPDATE employees
         SET full_name=?, phone=?, department=?, position=?, preferred_contact=?, updated_at=CURRENT_TIMESTAMP
         WHERE email=?`,
        [full_name, phone || null, department || null, position || null, preferred_contact || 'email', email]
      );
      return res.json({
        message: 'Сотрудник обновлён',
        employee: existing[0]
      });
    }

    // Создаём
    const [ins] = await pool.query(
      `INSERT INTO employees (email, full_name, phone, department, position, preferred_contact)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [email, full_name, phone || null, department || null, position || null, preferred_contact || 'email']
    );
    const [rows] = await pool.query('SELECT * FROM employees WHERE id=?', [ins.insertId]);
    return res.status(201).json({
      message: 'Сотрудник создан',
      employee: rows[0]
    });
  } catch (error) {
    console.error('Error createEmployee:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

exports.getEmployees = async (req, res) => {
  try {
    let query = 'SELECT * FROM employees';
    const params = [];
    if (req.query.email) {
      query += ' WHERE email LIKE ?';
      params.push(`%${req.query.email}%`);
    }
    if (req.query.department) {
      query += params.length ? ' AND department = ?' : ' WHERE department = ?';
      params.push(req.query.department);
    }
    
    // Дополнительные фильтры
    if (req.query.position) {
      query += params.length ? ' AND position = ?' : ' WHERE position = ?';
      params.push(req.query.position);
    }
    
    if (req.query.search) {
      const searchTerm = `%${req.query.search}%`;
      query += params.length ? ' AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)' : ' WHERE (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    // Сортировка
    if (req.query.sort && ['full_name', 'email', 'department', 'position', 'created_at'].includes(req.query.sort)) {
      const sortField = req.query.sort;
      const sortOrder = req.query.order === 'ASC' ? 'ASC' : 'DESC';
      query += ` ORDER BY ${sortField} ${sortOrder}`;
    } else {
    query += ' ORDER BY created_at DESC';
    }
    
    // Пагинация
    if (req.query.limit && !isNaN(req.query.limit)) {
      const limit = parseInt(req.query.limit);
      const page = req.query.page && !isNaN(req.query.page) ? parseInt(req.query.page) : 1;
      const offset = (page - 1) * limit;
      
      // Получаем общее количество для пагинации
      let countQuery = 'SELECT COUNT(*) as total FROM employees';
      if (params.length) {
        countQuery += ' WHERE ' + query.split('WHERE')[1].split('ORDER BY')[0];
      }
      
      const [countResult] = await pool.query(countQuery, params);
      const totalEmployees = countResult[0].total;
      
      query += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      const [rows] = await pool.query(query, params);
      
      return res.json({
        employees: rows,
        page: page,
        limit: limit,
        total: totalEmployees,
        totalPages: Math.ceil(totalEmployees / limit)
      });
    } else {
      // Без пагинации
    const [rows] = await pool.query(query, params);
    return res.json({ employees: rows });
    }
  } catch (error) {
    console.error('Error getEmployees:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

exports.getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM employees WHERE id=?', [id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Сотрудник не найден' });
    }
    return res.json({ employee: rows[0] });
  } catch (error) {
    console.error('Error getEmployeeById:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

/**
 * Обновление сотрудника по ID
 */
exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, full_name, phone, department, position, preferred_contact } = req.body;
    
    // Проверка существования сотрудника
    const [existing] = await pool.query('SELECT * FROM employees WHERE id=?', [id]);
    if (!existing.length) {
      return res.status(404).json({ error: 'Сотрудник не найден' });
    }
    
    // Если передан email, проверяем уникальность
    if (email && email !== existing[0].email) {
      const [emailCheck] = await pool.query('SELECT id FROM employees WHERE email=? AND id<>?', [email, id]);
      if (emailCheck.length) {
        return res.status(400).json({ error: 'Email уже используется другим сотрудником' });
      }
    }
    
    // Обновляем данные
    const updateQuery = `
      UPDATE employees
      SET 
        email = ?,
        full_name = ?,
        phone = ?,
        department = ?,
        position = ?,
        preferred_contact = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    await pool.query(updateQuery, [
      email || existing[0].email,
      full_name || existing[0].full_name,
      phone || existing[0].phone,
      department || existing[0].department,
      position || existing[0].position,
      preferred_contact || existing[0].preferred_contact,
      id
    ]);
    
    // Получаем обновленные данные
    const [updated] = await pool.query('SELECT * FROM employees WHERE id=?', [id]);
    
    return res.json({
      message: 'Сотрудник успешно обновлен',
      employee: updated[0]
    });
  } catch (error) {
    console.error('Error updateEmployee:', error);
    res.status(500).json({ error: 'Ошибка сервера при обновлении сотрудника' });
  }
};

/**
 * Удаление сотрудника
 */
exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Проверка существования сотрудника
    const [existing] = await pool.query('SELECT * FROM employees WHERE id=?', [id]);
    if (!existing.length) {
      return res.status(404).json({ error: 'Сотрудник не найден' });
    }
    
    // Проверка связанных заявок
    const [tickets] = await pool.query('SELECT id FROM tickets WHERE employee_id=?', [id]);
    if (tickets.length) {
      return res.status(400).json({ 
        error: 'Невозможно удалить сотрудника, так как с ним связаны заявки', 
        ticketsCount: tickets.length 
      });
    }
    
    // Удаляем сотрудника
    await pool.query('DELETE FROM employees WHERE id=?', [id]);
    
    return res.json({
      message: 'Сотрудник успешно удален',
      deletedEmployee: existing[0]
    });
  } catch (error) {
    console.error('Error deleteEmployee:', error);
    res.status(500).json({ error: 'Ошибка сервера при удалении сотрудника' });
  }
};

/**
 * Получение статистики по сотрудникам
 */
exports.getEmployeeStats = async (req, res) => {
  try {
    // Статистика по отделам
    const [departmentStats] = await pool.query(`
      SELECT 
        department, 
        COUNT(*) as count 
      FROM employees 
      WHERE department IS NOT NULL 
      GROUP BY department 
      ORDER BY count DESC
    `);
    
    // Статистика по должностям
    const [positionStats] = await pool.query(`
      SELECT 
        position, 
        COUNT(*) as count 
      FROM employees 
      WHERE position IS NOT NULL 
      GROUP BY position 
      ORDER BY count DESC
    `);
    
    // Общее количество сотрудников
    const [totalCount] = await pool.query('SELECT COUNT(*) as total FROM employees');
    
    // Количество заявок по сотрудникам (топ-5)
    const [ticketsByEmployee] = await pool.query(`
      SELECT 
        e.id, 
        e.full_name, 
        e.email, 
        COUNT(t.id) as tickets_count 
      FROM employees e
      LEFT JOIN tickets t ON e.id = t.employee_id
      GROUP BY e.id
      ORDER BY tickets_count DESC
      LIMIT 5
    `);
    
    return res.json({
      total: totalCount[0].total,
      departmentStats,
      positionStats,
      topEmployeesByTickets: ticketsByEmployee
    });
  } catch (error) {
    console.error('Error getEmployeeStats:', error);
    res.status(500).json({ error: 'Ошибка сервера при получении статистики' });
  }
};
