// routes/employeeRoutes.js
const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');

// Middleware для логирования запросов (по желанию)
const logEmployeeRequest = (req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log('=================================');
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  
  if (Object.keys(req.params).length) {
    console.log('Параметры:', req.params);
  }
  if (Object.keys(req.query).length) {
    console.log('Query:', req.query);
  }
  if (req.body && Object.keys(req.body).length) {
    const bodyToLog = { ...req.body };
    delete bodyToLog.password; // Удаляем чувствительные данные
    console.log('Body:', bodyToLog);
  }
  
  next();
};

// Валидация «Employee»
const validateEmployee = (req, res, next) => {
  const { email, fio } = req.body;
  if (!email || !fio) {
    return res.status(400).json({
      status: 'error',
      message: 'Отсутствуют обязательные поля: email и ФИО'
    });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      status: 'error',
      message: 'Неверный формат email'
    });
  }
  next();
};

// Валидация сортировки
const validateSortParams = (req, res, next) => {
  const { sort, order } = req.query;

  if (sort === 'name') {
    req.query.sort = 'fio';
  }
  
  const allowedSortFields = [
    'id',
    'fio',
    'email',
    'department',
    'name',                // Если нужно
    'overall_performance', // Эффективность
    'kpi',
    'work_volume',
    'activity',
    'quality',
    'status'
  ];
  const allowedOrders = ['ASC', 'DESC'];
  
  if (req.query.sort && !allowedSortFields.includes(req.query.sort)) {
    return res.status(400).json({
      status: 'error',
      message: 'Недопустимое поле для сортировки'
    });
  }
  
  if (order && !allowedOrders.includes(order.toUpperCase())) {
    return res.status(400).json({
      status: 'error',
      message: 'Недопустимый порядок сортировки'
    });
  }
  next();
};

// Подключаем лог
router.use(logEmployeeRequest);

// CRUD
router.get('/', validateSortParams, employeeController.getAllEmployees);
router.get('/:id', employeeController.getEmployeeById);
router.post('/', validateEmployee, employeeController.createEmployee);
router.put('/:id', validateEmployee, employeeController.updateEmployee);
router.delete('/:id', employeeController.deleteEmployee);

// Обработчик ошибок роутера
router.use((error, req, res, next) => {
  console.error('Ошибка в employeeRoutes:', error);

  // Можно передать управление в следующий error-handling middleware:
  next(error);
});

module.exports = router;
