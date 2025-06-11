const express = require('express');
const router = express.Router();
const statisticsController = require('../controllers/statisticsController');
const { authenticateJWT } = require('../middleware/auth');

// Все маршруты статистики требуют авторизации
router.use(authenticateJWT);

// Получение общей статистики для дашборда
router.get('/dashboard', statisticsController.getDashboardStats);

// Получение статистики по времени для графиков
router.get('/timeline', statisticsController.getTimelineStats);

// Получение статистики производительности сотрудников
router.get('/staff-performance', statisticsController.getStaffPerformance);

// Получение KPI метрик
router.get('/kpi', statisticsController.getKPIMetrics);

// Экспорт статистики
router.get('/export', statisticsController.exportStatistics);

module.exports = router;