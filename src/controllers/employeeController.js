// controllers/employeeController.js
const pool = require('../config/database');

const employeeController = {
  getAllEmployees: async (req, res, next) => {
    console.log('=== Получение списка сотрудников ===');
    try {
      const {
        sort = 'id',
        order = 'DESC',
        department,
        role,
        status,
        search,
        company_id // Передаём через query: ?company_id=...
      } = req.query;

      // Если не пришёл company_id, возьмём 1 (или любой дефолт)
      const userCompanyId = Number(company_id) || 1;

      let query = `
        SELECT
          e.*,
          c.name AS company_name,
          em.overall_performance,
          em.kpi,
          em.work_volume,
          em.activity,
          em.quality
        FROM employees e
        LEFT JOIN companies c ON e.company_id = c.id
        LEFT JOIN employee_metrics em ON e.id = em.user_id
        WHERE e.company_id = ?
      `;
      const params = [userCompanyId];

      if (department) {
        query += ' AND e.department = ?';
        params.push(department);
      }

      if (role) {
        query += ' AND e.role = ?';
        params.push(role);
      }

      if (status) {
        query += ' AND e.status = ?';
        params.push(status);
      }

      // Поиск (fio / email / phoneNumber)
      if (search) {
        query += ' AND (e.fio LIKE ? OR e.email LIKE ? OR e.phoneNumber LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      // Сортировка
      query += ` ORDER BY e.${sort} ${order}`;

      console.log('SQL Query:', query);
      console.log('Params:', params);

      // Без пагинации
      const [rows] = await pool.query(query, params);

      return res.json({
        data: rows
      });

    } catch (error) {
      console.error('Ошибка при получении списка сотрудников:', error);
      return next(error);
    }
  },

  getEmployeeById: async (req, res, next) => {
    try {
      console.log(`=== Получение информации о сотруднике (ID: ${req.params.id}) ===`);

      // Берём companyId из query
      const companyId = Number(req.query.company_id) || 1;
      const { id } = req.params;

      const [rows] = await pool.query(`
        SELECT
          e.*,
          c.name AS company_name,
          em.overall_performance,
          em.kpi,
          em.work_volume,
          em.activity,
          em.quality
        FROM employees e
        LEFT JOIN companies c ON e.company_id = c.id
        LEFT JOIN employee_metrics em ON e.id = em.user_id
        WHERE e.id = ?
          AND e.company_id = ?
      `, [id, companyId]);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Сотрудник не найден' });
      }

      return res.json(rows[0]);
    } catch (error) {
      console.error('Ошибка при получении сотрудника:', error);
      return next(error);
    }
  },

  createEmployee: async (req, res, next) => {
    console.log('=== Создание нового сотрудника ===');
    console.log('Данные:', req.body);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // company_id также берём из query
      const companyId = Number(req.query.company_id) || 1;

      const {
        fio,
        email,
        phoneNumber,
        department,
        role,
        address,
        status = 'active',
        isVerified = false,
        hireDate,
        birthday,
        metrics = {}
      } = req.body;

      // Простая валидация (на всякий случай, если нет validateEmployee)
      if (!fio || !email) {
        return res.status(400).json({
          status: 'error',
          message: 'ФИО и Email обязательны!'
        });
      }

      // Вставляем в employees
      const [result] = await connection.query(`
        INSERT INTO employees (
          fio, email, phoneNumber, department, role,
          address, status, isVerified, hireDate, birthday,
          company_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        fio.trim(),
        email.toLowerCase().trim(),
        phoneNumber?.trim() || null,
        department?.trim() || null,
        role?.trim() || null,
        address?.trim() || null,
        status,
        isVerified ? 1 : 0,
        hireDate ? new Date(hireDate).toISOString().split('T')[0] : null,
        birthday ? new Date(birthday).toISOString().split('T')[0] : null,
        companyId
      ]);

      // Если есть метрики, добавляем
      if (Object.keys(metrics).length > 0) {
        await connection.query(`
          INSERT INTO employee_metrics (
            user_id, overall_performance, kpi,
            work_volume, activity, quality
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          result.insertId,
          metrics.overall_performance || 0,
          metrics.kpi || 0,
          metrics.work_volume || 0,
          metrics.activity || 0,
          metrics.quality || 0
        ]);
      }

      await connection.commit();

      // Выбираем свежесозданную запись
      const [newEmployee] = await connection.query(`
        SELECT
          e.*,
          c.name as company_name,
          em.overall_performance,
          em.kpi,
          em.work_volume,
          em.activity,
          em.quality
        FROM employees e
        LEFT JOIN companies c ON e.company_id = c.id
        LEFT JOIN employee_metrics em ON e.id = em.user_id
        WHERE e.id = ? AND e.company_id = ?
      `, [result.insertId, companyId]);

      console.log('Сотрудник успешно создан');
      return res.status(201).json({
        status: 'success',
        message: 'Сотрудник успешно создан',
        data: newEmployee[0]
      });

    } catch (error) {
      await connection.rollback();
      console.error('Ошибка при создании сотрудника:', error);

      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          status: 'error',
          message: 'Сотрудник с таким email уже существует'
        });
      }

      return next(error);
    } finally {
      connection.release();
    }
  },

  updateEmployee: async (req, res, next) => {
    const { id } = req.params;
    console.log(`=== Обновление сотрудника (ID: ${id}) ===`);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Берём companyId из query
      const companyId = Number(req.query.company_id) || 1;

      const {
        fio,
        email,
        phoneNumber,
        department,
        role,
        address,
        status,
        isVerified,
        hireDate,
        birthday,
        metrics = {}
      } = req.body;

      // Проверяем, есть ли сотрудник
      const [employee] = await connection.query(
        'SELECT id FROM employees WHERE id = ? AND company_id = ?',
        [id, companyId]
      );

      if (employee.length === 0) {
        return res.status(404).json({ error: 'Сотрудник не найден' });
      }

      // Обновляем в employees
      await connection.query(`
        UPDATE employees
        SET
          fio = COALESCE(?, fio),
          email = COALESCE(?, email),
          phoneNumber = ?,
          department = ?,
          role = ?,
          address = ?,
          status = COALESCE(?, status),
          isVerified = COALESCE(?, isVerified),
          hireDate = ?,
          birthday = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND company_id = ?
      `, [
        fio,
        email?.toLowerCase(),
        phoneNumber || null,
        department || null,
        role || null,
        address || null,
        status,
        isVerified,
        hireDate ? new Date(hireDate).toISOString().split('T')[0] : null,
        birthday ? new Date(birthday).toISOString().split('T')[0] : null,
        id,
        companyId
      ]);

      // Обновляем/вставляем метрики
      if (Object.keys(metrics).length > 0) {
        await connection.query(`
          INSERT INTO employee_metrics (
            user_id, overall_performance, kpi,
            work_volume, activity, quality
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            overall_performance = VALUES(overall_performance),
            kpi = VALUES(kpi),
            work_volume = VALUES(work_volume),
            activity = VALUES(activity),
            quality = VALUES(quality),
            updated_at = CURRENT_TIMESTAMP
        `, [
          id,
          metrics.overall_performance || 0,
          metrics.kpi || 0,
          metrics.work_volume || 0,
          metrics.activity || 0,
          metrics.quality || 0
        ]);
      }

      await connection.commit();

      // Получаем обновлённые данные
      const [updatedEmployee] = await connection.query(`
        SELECT
          e.*,
          c.name as company_name,
          em.overall_performance,
          em.kpi,
          em.work_volume,
          em.activity,
          em.quality
        FROM employees e
        LEFT JOIN companies c ON e.company_id = c.id
        LEFT JOIN employee_metrics em ON e.id = em.user_id
        WHERE e.id = ? AND e.company_id = ?
      `, [id, companyId]);

      console.log('Данные сотрудника обновлены');
      return res.json({
        status: 'success',
        message: 'Данные сотрудника успешно обновлены',
        data: updatedEmployee[0]
      });

    } catch (error) {
      await connection.rollback();
      console.error('Ошибка при обновлении сотрудника:', error);

      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          status: 'error',
          message: 'Сотрудник с таким email уже существует'
        });
      }

      return next(error);
    } finally {
      connection.release();
    }
  },

  deleteEmployee: async (req, res, next) => {
    const { id } = req.params;
    console.log(`=== Удаление сотрудника (ID: ${id}) ===`);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // companyId
      const companyId = Number(req.query.company_id) || 1;

      // Проверяем сотрудника
      const [employee] = await connection.query(
        'SELECT id, fio FROM employees WHERE id = ? AND company_id = ?',
        [id, companyId]
      );
      if (employee.length === 0) {
        return res.status(404).json({ error: 'Сотрудник не найден' });
      }

      // Удаляем метрики
      const [metricResult] = await connection.query(
        'DELETE FROM employee_metrics WHERE user_id = ?',
        [id]
      );

      // Удаляем самого сотрудника
      const [employeeResult] = await connection.query(
        'DELETE FROM employees WHERE id = ? AND company_id = ?',
        [id, companyId]
      );

      if (employeeResult.affectedRows === 0) {
        throw new Error('Ошибка при удалении сотрудника');
      }

      await connection.commit();

      console.log('Сотрудник успешно удален');
      return res.json({
        status: 'success',
        message: 'Сотрудник и связанные данные успешно удалены',
        data: {
          employeeId: id,
          metrics_removed: metricResult.affectedRows,
          employee_name: employee[0].fio
        }
      });

    } catch (error) {
      await connection.rollback();
      console.error('Ошибка при удалении сотрудника:', error);

      if (error.code === 'ER_ROW_IS_REFERENCED') {
        return res.status(400).json({
          status: 'error',
          message: 'Невозможно удалить сотрудника, так как существуют связанные записи'
        });
      }

      return next(error);
    } finally {
      connection.release();
    }
  },
};

module.exports = employeeController;
