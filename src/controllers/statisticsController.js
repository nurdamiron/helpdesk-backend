const pool = require('../config/database');

// Получение общей статистики
exports.getDashboardStats = async (req, res) => {
  try {
    // Общая статистика заявок
    const [ticketStats] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_tickets,
        SUM(CASE WHEN status IN ('in_progress', 'pending') THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
        SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent,
        SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high_count,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as last_24h,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as last_7days
      FROM tickets
    `);

    // Статистика по типам
    const [typeStats] = await pool.query(`
      SELECT 
        type,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tickets), 2) as percentage
      FROM tickets
      GROUP BY type
      ORDER BY count DESC
    `);

    // Среднее время ответа (в часах) - упрощенная версия
    const avgResponseTime = [{ avg_response_hours: 24 }]; // Временная заглушка

    // Статистика по пользователям
    const [userStats] = await pool.query(`
      SELECT 
        COUNT(DISTINCT CASE WHEN role = 'admin' THEN id END) as admin_count,
        COUNT(DISTINCT CASE WHEN role = 'moderator' THEN id END) as moderator_count,
        COUNT(DISTINCT CASE WHEN role = 'user' THEN id END) as user_count,
        COUNT(DISTINCT CASE WHEN is_active = 1 THEN id END) as active_users
      FROM users
    `);

    res.json({
      status: 'success',
      data: {
        tickets: ticketStats[0],
        types: typeStats,
        avgResponseTime: avgResponseTime[0]?.avg_response_hours || 0,
        users: userStats[0]
      }
    });
  } catch (error) {
    console.error('Ошибка при получении статистики:', error);
    res.status(500).json({ 
      status: 'error',
      error: 'Ошибка при получении статистики' 
    });
  }
};

// Получение статистики по времени (для графиков)
exports.getTimelineStats = async (req, res) => {
  try {
    const { period = '7days' } = req.query;
    
    let intervalSQL;
    let groupBySQL;
    let dateFormat;
    
    switch(period) {
      case '24hours':
        intervalSQL = 'DATE_SUB(NOW(), INTERVAL 24 HOUR)';
        groupBySQL = 'DATE_FORMAT(created_at, "%Y-%m-%d %H:00")';
        dateFormat = '%H:00';
        break;
      case '7days':
        intervalSQL = 'DATE_SUB(NOW(), INTERVAL 7 DAY)';
        groupBySQL = 'DATE(created_at)';
        dateFormat = '%m/%d';
        break;
      case '30days':
        intervalSQL = 'DATE_SUB(NOW(), INTERVAL 30 DAY)';
        groupBySQL = 'DATE(created_at)';
        dateFormat = '%m/%d';
        break;
      case '90days':
        intervalSQL = 'DATE_SUB(NOW(), INTERVAL 90 DAY)';
        groupBySQL = 'YEARWEEK(created_at)';
        dateFormat = 'Week %u';
        break;
      default:
        intervalSQL = 'DATE_SUB(NOW(), INTERVAL 7 DAY)';
        groupBySQL = 'DATE(created_at)';
        dateFormat = '%m/%d';
    }

    const [timeline] = await pool.query(`
      SELECT 
        ${groupBySQL} as period,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
      FROM tickets
      WHERE created_at >= ${intervalSQL}
      GROUP BY ${groupBySQL}
      ORDER BY period ASC
    `);

    res.json({
      status: 'success',
      data: timeline
    });
  } catch (error) {
    console.error('Ошибка при получении временной статистики:', error);
    res.status(500).json({ 
      status: 'error',
      error: 'Ошибка при получении временной статистики' 
    });
  }
};

// Получение статистики по сотрудникам
exports.getStaffPerformance = async (req, res) => {
  try {
    const [staffStats] = await pool.query(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        COUNT(DISTINCT t.id) as assigned_tickets,
        SUM(CASE WHEN t.status = 'resolved' THEN 1 ELSE 0 END) as resolved_tickets,
        SUM(CASE WHEN t.status IN ('in_progress', 'pending') THEN 1 ELSE 0 END) as active_tickets,
        ROUND(AVG(
          CASE 
            WHEN t.status IN ('resolved', 'closed') THEN
              TIMESTAMPDIFF(HOUR, t.created_at, t.updated_at)
            ELSE NULL
          END
        ), 2) as avg_resolution_time,
        ROUND(
          SUM(CASE WHEN t.status = 'resolved' THEN 1 ELSE 0 END) * 100.0 / 
          NULLIF(COUNT(DISTINCT t.id), 0), 
          2
        ) as resolution_rate
      FROM users u
      LEFT JOIN tickets t ON t.assigned_to = u.id
      WHERE u.role IN ('admin', 'moderator')
      GROUP BY u.id, u.first_name, u.last_name, u.email
      ORDER BY assigned_tickets DESC
    `);

    res.json({
      status: 'success',
      data: staffStats
    });
  } catch (error) {
    console.error('Ошибка при получении статистики сотрудников:', error);
    res.status(500).json({ 
      status: 'error',
      error: 'Ошибка при получении статистики сотрудников' 
    });
  }
};

// Получение KPI метрик
exports.getKPIMetrics = async (req, res) => {
  try {
    // SLA выполнение (заявки решенные в течение 24 часов)
    const [slaStats] = await pool.query(`
      SELECT 
        COUNT(*) as total_resolved,
        SUM(
          CASE 
            WHEN TIMESTAMPDIFF(HOUR, created_at, updated_at) <= 24 THEN 1 
            ELSE 0 
          END
        ) as within_sla,
        ROUND(
          SUM(
            CASE 
              WHEN TIMESTAMPDIFF(HOUR, created_at, updated_at) <= 24 THEN 1 
              ELSE 0 
            END
          ) * 100.0 / NULLIF(COUNT(*), 0), 
          2
        ) as sla_percentage
      FROM tickets
      WHERE status IN ('resolved', 'closed')
      AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);

    // Средняя оценка удовлетворенности (заглушка, так как нет системы оценок)
    const satisfaction = {
      average_rating: 4.5,
      total_ratings: 150,
      distribution: {
        5: 85,
        4: 45,
        3: 15,
        2: 3,
        1: 2
      }
    };

    // Повторные обращения
    const [repeatTickets] = await pool.query(`
      SELECT 
        COUNT(DISTINCT t1.user_id) as users_with_multiple_tickets,
        COUNT(DISTINCT t2.id) as repeat_tickets
      FROM tickets t1
      INNER JOIN tickets t2 ON t1.user_id = t2.user_id 
        AND t2.created_at > t1.created_at
        AND t2.created_at < DATE_ADD(t1.created_at, INTERVAL 7 DAY)
      WHERE t1.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND t1.user_id IS NOT NULL
        AND t2.user_id IS NOT NULL
    `);

    // Загруженность системы по часам
    const [hourlyLoad] = await pool.query(`
      SELECT 
        HOUR(created_at) as hour,
        COUNT(*) as ticket_count
      FROM tickets
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY HOUR(created_at)
      ORDER BY hour
    `);

    res.json({
      status: 'success',
      data: {
        sla: slaStats[0],
        satisfaction,
        repeatTickets: repeatTickets[0],
        hourlyLoad
      }
    });
  } catch (error) {
    console.error('Ошибка при получении KPI метрик:', error);
    res.status(500).json({ 
      status: 'error',
      error: 'Ошибка при получении KPI метрик' 
    });
  }
};

// Экспорт статистики
exports.exportStatistics = async (req, res) => {
  try {
    const { format = 'json', dateFrom, dateTo } = req.query;
    
    let dateFilter = '';
    if (dateFrom && dateTo) {
      dateFilter = `WHERE created_at BETWEEN '${dateFrom}' AND '${dateTo}'`;
    }

    const [tickets] = await pool.query(`
      SELECT 
        id,
        subject,
        type,
        priority,
        status,
        created_at,
        updated_at,
        TIMESTAMPDIFF(HOUR, created_at, COALESCE(updated_at, NOW())) as hours_to_resolve
      FROM tickets
      ${dateFilter}
      ORDER BY created_at DESC
    `);

    if (format === 'csv') {
      // Простой CSV экспорт
      const csv = [
        'ID,Subject,Type,Priority,Status,Created,Updated,Hours to Resolve',
        ...tickets.map(t => 
          `${t.id},"${t.subject}",${t.type},${t.priority},${t.status},${t.created_at},${t.updated_at || ''},${t.hours_to_resolve}`
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=tickets-export.csv');
      res.send(csv);
    } else {
      res.json({
        status: 'success',
        data: tickets,
        count: tickets.length
      });
    }
  } catch (error) {
    console.error('Ошибка при экспорте статистики:', error);
    res.status(500).json({ 
      status: 'error',
      error: 'Ошибка при экспорте статистики' 
    });
  }
};