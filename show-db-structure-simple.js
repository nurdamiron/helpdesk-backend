#!/usr/bin/env node

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Конфигурация базы данных
const dbConfig = {
    host: process.env.DB_HOST || 'biz360.czwiyugwum02.eu-north-1.rds.amazonaws.com',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'nurda0101',
    database: process.env.DB_NAME || 'helpdesk',
    port: process.env.DB_PORT || 3306
};

async function showDatabaseStructure() {
    let connection;
    
    try {
        // Подключение к БД
        console.log('\n🔌 Подключение к базе данных...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Подключение установлено!\n');

        // Получение списка таблиц
        const [tables] = await connection.execute('SHOW TABLES');
        const tableNames = tables.map(row => Object.values(row)[0]);
        
        console.log(`📊 База данных: ${dbConfig.database}`);
        console.log(`🏠 Хост: ${dbConfig.host}`);
        console.log(`📋 Всего таблиц: ${tableNames.length}\n`);
        console.log('═'.repeat(80));

        // Создание отчета
        let report = `# Структура базы данных ${dbConfig.database}\n\n`;
        report += `**Дата создания отчета:** ${new Date().toLocaleString('ru-RU')}\n`;
        report += `**Хост:** ${dbConfig.host}\n`;
        report += `**Всего таблиц:** ${tableNames.length}\n\n`;

        // Обработка каждой таблицы
        for (const tableName of tableNames) {
            console.log(`\n📑 Таблица: ${tableName}`);
            console.log('─'.repeat(50));
            
            report += `## Таблица: ${tableName}\n\n`;

            // Получение структуры таблицы
            const [columns] = await connection.execute(`DESCRIBE ${tableName}`);
            
            // Вывод структуры в консоль
            console.log('\nСтруктура:');
            console.log('┌─────────────────────┬──────────────────────┬──────┬─────┬─────────┬────────────┐');
            console.log('│ Поле                │ Тип                  │ Null │ Key │ Default │ Extra      │');
            console.log('├─────────────────────┼──────────────────────┼──────┼─────┼─────────┼────────────┤');

            // Markdown таблица для отчета
            report += '| Поле | Тип | Null | Key | Default | Extra |\n';
            report += '|------|-----|------|-----|---------|-------|\n';

            columns.forEach(column => {
                const [field, type, nullAllowed, key, defaultValue, extra] = column;
                
                // Форматирование для консоли
                const fieldPad = field.padEnd(19);
                const typePad = type.padEnd(20);
                const nullPad = (nullAllowed === 'YES' ? 'YES' : 'NO').padEnd(4);
                const keyPad = (key || '').padEnd(3);
                const defaultPad = (defaultValue || 'NULL').toString().substring(0, 7).padEnd(7);
                const extraPad = (extra || '').padEnd(10);

                console.log(`│ ${fieldPad} │ ${typePad} │ ${nullPad} │ ${keyPad} │ ${defaultPad} │ ${extraPad} │`);

                // Добавление в отчет
                report += `| ${field} | ${type} | ${nullAllowed} | ${key} | ${defaultValue || 'NULL'} | ${extra} |\n`;
            });

            console.log('└─────────────────────┴──────────────────────┴──────┴─────┴─────────┴────────────┘');
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
                console.log('\n🔗 Внешние ключи:');
                report += '### Внешние ключи:\n\n';
                
                foreignKeys.forEach(fk => {
                    const constraint = `${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`;
                    console.log(`  • ${constraint}`);
                    report += `- ${constraint}\n`;
                });
                report += '\n';
            }

            // Получение количества записей
            const [[countResult]] = await connection.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
            console.log(`\n📊 Записей в таблице: ${countResult.count}`);
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

            const nonPrimaryIndexes = Object.entries(uniqueIndexes).filter(([name]) => name !== 'PRIMARY');
            if (nonPrimaryIndexes.length > 0) {
                console.log('\n🔍 Индексы:');
                report += '### Индексы:\n\n';
                
                nonPrimaryIndexes.forEach(([indexName, indexInfo]) => {
                    const uniqueLabel = indexInfo.unique ? 'UNIQUE' : '';
                    console.log(`  • ${indexName} ${uniqueLabel}: (${indexInfo.columns.join(', ')})`);
                    report += `- ${indexName} ${uniqueLabel}: (${indexInfo.columns.join(', ')})\n`;
                });
                report += '\n';
            }

            report += '---\n\n';
        }

        // Статистика
        console.log('\n\n📈 СТАТИСТИКА БАЗЫ ДАННЫХ:');
        console.log('═'.repeat(50));
        
        let totalRecords = 0;
        console.log('\n┌─────────────────────────┬───────────────┐');
        console.log('│ Таблица                 │ Записей       │');
        console.log('├─────────────────────────┼───────────────┤');

        // Добавление статистики в отчет
        report += '## Статистика\n\n';
        report += '| Таблица | Количество записей |\n';
        report += '|---------|-------------------|\n';
        
        for (const tableName of tableNames) {
            const [[result]] = await connection.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
            totalRecords += result.count;
            
            const tableNamePad = tableName.padEnd(23);
            const countPad = result.count.toLocaleString().padStart(13);
            console.log(`│ ${tableNamePad} │ ${countPad} │`);
            
            report += `| ${tableName} | ${result.count.toLocaleString()} |\n`;
        }
        
        console.log('├─────────────────────────┼───────────────┤');
        const totalPad = totalRecords.toLocaleString().padStart(13);
        console.log(`│ ВСЕГО                   │ ${totalPad} │`);
        console.log('└─────────────────────────┴───────────────┘');
        
        report += `| **ВСЕГО** | **${totalRecords.toLocaleString()}** |\n\n`;

        // Граф связей
        console.log('\n\n🕸️  ГРАФ СВЯЗЕЙ МЕЖДУ ТАБЛИЦАМИ:');
        console.log('═'.repeat(50));
        report += '## Граф связей\n\n';
        
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
                    console.log(`\n  ${tableName} ➜ ${fk.REFERENCED_TABLE_NAME} (${fk.count} связей)`);
                    report += `- ${tableName} ➜ ${fk.REFERENCED_TABLE_NAME} (${fk.count} связей)\n`;
                });
            }
        }

        // Сохранение отчета
        const reportPath = path.join(__dirname, 'database_structure_detailed.md');
        await fs.writeFile(reportPath, report, 'utf8');
        
        console.log(`\n\n✅ Отчет сохранен в: ${reportPath}`);

        // Сохранение SQL дампа структуры
        const sqlPath = path.join(__dirname, 'database_structure.sql');
        let sqlDump = `-- Структура базы данных ${dbConfig.database}\n`;
        sqlDump += `-- Дата: ${new Date().toLocaleString('ru-RU')}\n\n`;

        for (const tableName of tableNames) {
            const [[createTable]] = await connection.execute(`SHOW CREATE TABLE ${tableName}`);
            sqlDump += `-- Таблица ${tableName}\n`;
            sqlDump += createTable['Create Table'] + ';\n\n';
        }

        await fs.writeFile(sqlPath, sqlDump, 'utf8');
        console.log(`✅ SQL дамп сохранен в: ${sqlPath}`);

    } catch (error) {
        console.error('\n❌ Ошибка:', error.message);
        console.error('\nПроверьте:');
        console.error('1. Правильность данных подключения к БД');
        console.error('2. Доступность сервера БД');
        console.error('3. Наличие прав доступа к БД');
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('\n\n🔌 Соединение закрыто');
        }
    }
}

// Запуск
console.log(`
╔═══════════════════════════════════════╗
║     📊 HelpDesk Database Explorer     ║
╚═══════════════════════════════════════╝
`);

showDatabaseStructure();