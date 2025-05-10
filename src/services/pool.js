// src/services/pool.js
const isTestEnvironment = process.env.NODE_ENV === 'test';

let poolModule;

if (isTestEnvironment) {
  // Мок для тестов
  poolModule = {
    query: jest.fn().mockImplementation(() => Promise.resolve([[{}, {}], null])),
    getConnection: jest.fn().mockImplementation(() => {
      return Promise.resolve({
        query: jest.fn().mockImplementation(() => Promise.resolve([[{}, {}], null])),
        release: jest.fn()
      });
    }),
    testConnection: jest.fn().mockImplementation(() => Promise.resolve(true))
  };
} else {
  // Реальное соединение для продакшена
  poolModule = require('../config/database');
}

module.exports = poolModule;
