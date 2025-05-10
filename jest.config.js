// jest.config.js
module.exports = {
  // Тесты будут искаться в директории __tests__
  testMatch: ['**/__tests__/**/*.test.js'],
  
  // Указываем директории, которые будут игнорироваться
  testPathIgnorePatterns: ['/node_modules/'],
  
  // Настройка окружения
  testEnvironment: 'node',
  
  // Настройка времени ожидания для тестов (в мс)
  testTimeout: 10000,
  
  // Настройка покрытия кода тестами
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/config/*.js',
    '!src/middleware/logger.js',
    '!**/*.test.js'
  ],
  
  // Минимальный порог покрытия кода тестами
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 50,
      functions: 60,
      lines: 60
    }
  },
  
  // Вывод подробного отчета о результатах тестов
  verbose: true
}; 