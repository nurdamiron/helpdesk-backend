#!/usr/bin/env node

const mysql = require('mysql2/promise');
const Table = require('cli-table3');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Простые цвета для консоли без chalk
const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    underline: '\x1b[4m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

const c = {
    red: (text) => `${colors.red}${text}${colors.reset}`,
    green: (text) => `${colors.green}${text}${colors.reset}`,
    yellow: (text) => `${colors.yellow}${text}${colors.reset}`,
    blue: (text) => `${colors.blue}${text}${colors.reset}`,
    magenta: (text) => `${colors.magenta}${text}${colors.reset}`,
    cyan: (text) => `${colors.cyan}${text}${colors.reset}`,
    gray: (text) => `${colors.gray}${text}${colors.reset}`,
    bold: (text) => `${colors.bold}${text}${colors.reset}`,
    underline: (text) => `${colors.underline}${text}${colors.reset}`
};

// Конфигурация базы данных
const dbConfig = {
    host: process.env.DB_HOST || 'biz360.czwiyugwum02.eu-north-1.rds.amazonaws.com',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'nurda0101',
    database: process.env.DB_NAME || 'helpdesk',
    port: process.env.DB_PORT || 3306
};

// Цвета для разных типов данных
const typeColors = {
    'INT': c.blue,
    'VARCHAR': c.green,
    'TEXT': c.yellow,
    'DATETIME': c.magenta,
    'TIMESTAMP': c.magenta,
    'BOOLEAN': c.cyan,
    'ENUM': c.red,
    'JSON': c.yellow,
    'DECIMAL': c.blue
};

async function showDatabaseStructure() {
    let connection;
    
    try {
        // Подключение к БД
        console.log(c.bold('\n🔌 Подключение к базе данных...'));
        connection = await mysql.createConnection(dbConfig);
        console.log(c.green('✅ Подключение установлено!\n'));

        // Получение списка таблиц
        const [tables] = await connection.execute('SHOW TABLES');
        const tableNames = tables.map(row => Object.values(row)[0]);
        
        console.log(c.bold(c.underline(`📊 База данных: ${dbConfig.database}`)));
        console.log(c.gray(`🏠 Хост: ${dbConfig.host}`));
        console.log(c.gray(`📋 Всего таблиц: ${tableNames.length}\n`));

        // Создание отчета
        let report = `# Структура базы данных ${dbConfig.database}\n\n`;
        report += `**Дата создания отчета:** ${new Date().toLocaleString('ru-RU')}\n`;
        report += `**Хост:** ${dbConfig.host}\n`;
        report += `**Всего таблиц:** ${tableNames.length}\n\n`;

        // Обработка каждой таблицы
        for (const tableName of tableNames) {
            console.log(chalk.bold.blue(`\n📑 Таблица: ${tableName}`));
            report += `## Таблица: ${tableName}\n\n`;

            // Получение структуры таблицы
            const [columns] = await connection.execute(`DESCRIBE ${tableName}`);
            
            // Создание таблицы для консоли
            const table = new Table({
                head: ['Поле', 'Тип', 'Null', 'Key', 'Default', 'Extra'],
                style: {
                    head: ['cyan'],
                    border: ['gray']
                }
            });

            // Markdown таблица для отчета
            report += '| Поле | Тип | Null | Key | Default | Extra |\n';
            report += '|------|-----|------|-----|---------|-------|\n';

            columns.forEach(column => {
                const [field, type, nullAllowed, key, defaultValue, extra] = column;
                
                // Определение цвета для типа
                let coloredType = type;
                for (const [typeKey, colorFn] of Object.entries(typeColors)) {
                    if (type.toUpperCase().includes(typeKey)) {
                        coloredType = colorFn(type);
                        break;
                    }
                }

                // Форматирование ключей
                let keyDisplay = '';
                if (key === 'PRI') keyDisplay = chalk.yellow('🔑 PRI');
                else if (key === 'MUL') keyDisplay = chalk.blue('🔗 MUL');
                else if (key === 'UNI') keyDisplay = chalk.green('🆔 UNI');
                else keyDisplay = key;

                // Добавление в таблицу консоли
                table.push([
                    chalk.bold(field),
                    coloredType,
                    nullAllowed === 'YES' ? chalk.gray('YES') : chalk.red('NO'),
                    keyDisplay,
                    defaultValue || chalk.gray('NULL'),
                    extra || ''
                ]);

                // Добавление в отчет
                report += `| ${field} | ${type} | ${nullAllowed} | ${key} | ${defaultValue || 'NULL'} | ${extra} |\n`;
            });

            console.log(table.toString());
            report += '\n';

            // Получение внешних ключей
            const [foreignKeys] = await connection.execute(`
                SELECT 
                    COLUMN_NAME,
                    CONSTRAINT_NAME,
                    REFERENCED_TABLE_NAME,
                    REFERENCED_COLUMN_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_NAME = ? 
                    AND TABLE_SCHEMA = ? 
                    AND REFERENCED_TABLE_NAME IS NOT NULL
            `, [tableName, dbConfig.database]);

            if (foreignKeys.length > 0) {
                console.log(chalk.yellow('\n  🔗 Внешние ключи:'));
                report += '### Внешние ключи:\n\n';
                
                foreignKeys.forEach(fk => {
                    const constraint = `${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`;
                    console.log(`    • ${chalk.blue(constraint)}`);
                    report += `- ${constraint}\n`;
                });
                report += '\n';
            }

            // Получение количества записей
            const [[countResult]] = await connection.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
            console.log(chalk.gray(`\n  📊 Записей в таблице: ${countResult.count}`));
            report += `**Количество записей:** ${countResult.count}\n\n`;

            // Получение индексов
            const [indexes] = await connection.execute(`SHOW INDEX FROM ${tableName}`);
            const uniqueIndexes = {};
            
            indexes.forEach(index => {
                if (!uniqueIndexes[index.Key_name]) {
                    uniqueIndexes[index.Key_name] = {
                        unique: !index.Non_unique,
                        columns: []
                    };
                }
                uniqueIndexes[index.Key_name].columns.push(index.Column_name);
            });

            if (Object.keys(uniqueIndexes).length > 1) { // Исключаем только PRIMARY
                console.log(chalk.yellow('\n  🔍 Индексы:'));
                report += '### Индексы:\n\n';
                
                for (const [indexName, indexInfo] of Object.entries(uniqueIndexes)) {
                    if (indexName !== 'PRIMARY') {
                        const uniqueLabel = indexInfo.unique ? chalk.green('UNIQUE') : '';
                        console.log(`    • ${chalk.blue(indexName)} ${uniqueLabel}: (${indexInfo.columns.join(', ')})`);
                        report += `- ${indexName} ${indexInfo.unique ? 'UNIQUE' : ''}: (${indexInfo.columns.join(', ')})\n`;
                    }
                }
                report += '\n';
            }

            report += '---\n\n';
        }

        // Статистика
        console.log(chalk.bold.green('\n\n📈 Статистика базы данных:'));
        
        const statsTable = new Table({
            style: { border: ['gray'] }
        });

        // Общее количество записей
        let totalRecords = 0;
        for (const tableName of tableNames) {
            const [[result]] = await connection.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
            totalRecords += result.count;
            statsTable.push([tableName, chalk.yellow(result.count.toLocaleString())]);
        }

        statsTable.push([chalk.bold('ВСЕГО'), chalk.bold.green(totalRecords.toLocaleString())]);
        console.log(statsTable.toString());

        // Добавление статистики в отчет
        report += '## Статистика\n\n';
        report += '| Таблица | Количество записей |\n';
        report += '|---------|-------------------|\n';
        
        for (const tableName of tableNames) {
            const [[result]] = await connection.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
            report += `| ${tableName} | ${result.count.toLocaleString()} |\n`;
        }
        report += `| **ВСЕГО** | **${totalRecords.toLocaleString()}** |\n`;

        // Сохранение отчета
        const reportPath = path.join(__dirname, 'database_structure_detailed.md');
        await fs.writeFile(reportPath, report, 'utf8');
        
        console.log(chalk.green(`\n✅ Отчет сохранен в: ${chalk.bold(reportPath)}`));

        // Проверка связей между таблицами
        console.log(chalk.bold.magenta('\n\n🕸️  Граф связей между таблицами:'));
        
        const relationships = new Map();
        
        for (const tableName of tableNames) {
            const [fks] = await connection.execute(`
                SELECT 
                    REFERENCED_TABLE_NAME,
                    COUNT(*) as count
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_NAME = ? 
                    AND TABLE_SCHEMA = ? 
                    AND REFERENCED_TABLE_NAME IS NOT NULL
                GROUP BY REFERENCED_TABLE_NAME
            `, [tableName, dbConfig.database]);
            
            if (fks.length > 0) {
                fks.forEach(fk => {
                    console.log(`  ${chalk.blue(tableName)} ➜ ${chalk.green(fk.REFERENCED_TABLE_NAME)} ${chalk.gray(`(${fk.count} связей)`)}`);
                });
            }
        }

    } catch (error) {
        console.error(chalk.red('\n❌ Ошибка:'), error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log(chalk.gray('\n\n🔌 Соединение закрыто'));
        }
    }
}

// Запуск
console.log(chalk.bold.cyan(`
╔═══════════════════════════════════════╗
║     📊 HelpDesk Database Explorer     ║
╚═══════════════════════════════════════╝
`));

showDatabaseStructure();