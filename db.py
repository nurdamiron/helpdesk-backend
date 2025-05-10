import mysql.connector
import os
import time
from dotenv import load_dotenv
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

# Загрузка переменных окружения
load_dotenv()

# Подключение к MySQL
conn = mysql.connector.connect(
    host="biz360.czwiyugwum02.eu-north-1.rds.amazonaws.com",
    user="root",
    password="nurda0101",
    database="helpdesk",
)
cursor = conn.cursor()

# Получение всех таблиц
cursor.execute("SHOW TABLES")
tables = [row[0] for row in cursor.fetchall()]

# Создание текстового файла
output_file = "database_structure.txt"
with open(output_file, "w", encoding="utf-8") as f:
    f.write("СТРУКТУРА БАЗЫ ДАННЫХ\n")
    f.write("=" * 50 + "\n\n")

    for table in tables:
        f.write(f"ТАБЛИЦА: {table}\n")
        f.write("-" * 50 + "\n\n")

        # Получение структуры таблицы
        cursor.execute(f"DESCRIBE `{table}`")
        columns = cursor.fetchall()

        f.write("Колонки:\n")
        for column in columns:
            column_name = column[0]
            column_type = column[1]
            column_null = "NOT NULL" if column[2] == "NO" else "NULL"
            column_key = column[3] if column[3] else ""
            column_default = f"DEFAULT {column[4]}" if column[4] is not None else ""
            column_extra = column[5] if column[5] else ""

            f.write(
                f"  {column_name} {column_type} {column_null} {column_key} {column_default} {column_extra}\n"
            )

        f.write("\n")

        # Получение внешних ключей
        cursor.execute(
            f"""
            SELECT COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_NAME = '{table}' AND TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
        """
        )
        foreign_keys = cursor.fetchall()

        if foreign_keys:
            f.write("Внешние ключи:\n")
            for fk in foreign_keys:
                f.write(f"  {fk[1]}: {table}.{fk[0]} -> {fk[2]}.{fk[3]}\n")

            f.write("\n")

        # Получение индексов
        cursor.execute(f"SHOW INDEX FROM `{table}`")
        indexes = cursor.fetchall()

        if indexes:
            # Группировка индексов по имени
            index_groups = {}
            for index in indexes:
                index_name = index[2]
                if index_name not in index_groups:
                    index_groups[index_name] = []
                index_groups[index_name].append(index)

            f.write("Индексы:\n")
            for index_name, index_columns in index_groups.items():
                is_unique = "UNIQUE" if not bool(index_columns[0][1]) else ""
                columns = ", ".join([idx[4] for idx in index_columns])
                f.write(f"  {index_name} {is_unique}: ({columns})\n")

            f.write("\n")

        # Получение CREATE TABLE
        cursor.execute(f"SHOW CREATE TABLE `{table}`")
        create_table_sql = cursor.fetchone()[1]
        f.write("SQL создания таблицы:\n")
        f.write(f"{create_table_sql};\n\n")

        f.write("=" * 50 + "\n\n")

print(f"Файл {output_file} успешно создан!")

# Закрытие соединения
cursor.close()
conn.close()

# Попытка подключения к MySQL с повторными попытками
max_retries = 5
retry_delay = 3  # секунды

for attempt in range(max_retries):
    try:
        # Подключение к MySQL
        db = mysql.connector.connect(
            host=os.getenv("DB_HOST", "biz360.czwiyugwum02.eu-north-1.rds.amazonaws.com"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", "nurda0101"),
            port=int(os.getenv("DB_PORT", "3306")),
        )
        cursor = db.cursor()
        logger.info("Успешное подключение к MySQL")
        break
    except Exception as e:
        logger.error(
            f"Ошибка подключения к MySQL (попытка {attempt+1}/{max_retries}): {e}"
        )
        if attempt < max_retries - 1:
            logger.info(f"Повторная попытка через {retry_delay} секунд...")
            time.sleep(retry_delay)
        else:
            logger.error("Все попытки подключения к MySQL не удались.")
            raise

# Создание базы данных, если она не существует
cursor.execute("CREATE DATABASE IF NOT EXISTS helpdesk")
logger.info("База данных helpdesk создана или уже существует")

# Использование базы данных
cursor.execute("USE helpdesk")

# Создание таблицы пользователей
cursor.execute(
    """
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(100) UNIQUE NOT NULL,
    role ENUM('admin', 'agent', 'supervisor') DEFAULT 'agent',
    department VARCHAR(50),
    phone VARCHAR(20),
    avatar_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)
"""
)
logger.info("Таблица users создана или уже существует")

# Создание таблицы билетов
cursor.execute(
    """
CREATE TABLE IF NOT EXISTS tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    status ENUM('new', 'open', 'in_progress', 'pending', 'resolved', 'closed') DEFAULT 'new',
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    category VARCHAR(50) DEFAULT 'other',
    requester_id INT,
    assigned_to INT,
    property_type VARCHAR(50),
    property_address TEXT,
    property_area DECIMAL(10,2),
    deadline DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
)
"""
)
logger.info("Таблица tickets создана или уже существует")

# Добавление новых столбцов в таблицу tickets
try:
    cursor.execute("SHOW COLUMNS FROM tickets LIKE 'requester_metadata'")
    requester_metadata_exists = cursor.fetchone() is not None

    cursor.execute("SHOW COLUMNS FROM tickets LIKE 'metadata'")
    metadata_exists = cursor.fetchone() is not None

    if not requester_metadata_exists:
        cursor.execute(
            "ALTER TABLE tickets ADD COLUMN requester_metadata JSON DEFAULT NULL"
        )
        logger.info("Столбец requester_metadata добавлен в таблицу tickets")
    else:
        logger.info("Столбец requester_metadata уже существует в таблице tickets")

    if not metadata_exists:
        cursor.execute("ALTER TABLE tickets ADD COLUMN metadata JSON DEFAULT NULL")
        logger.info("Столбец metadata добавлен в таблицу tickets")
    else:
        logger.info("Столбец metadata уже существует в таблице tickets")
except Exception as e:
    logger.error(f"Ошибка при добавлении столбцов в таблицу tickets: {e}")

# Создание таблицы сообщений к билетам
cursor.execute(
    """
CREATE TABLE IF NOT EXISTS ticket_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    sender_type ENUM('requester', 'agent', 'system') NOT NULL,
    sender_id INT,
    content TEXT NOT NULL,
    content_type ENUM('text', 'html', 'markdown') DEFAULT 'text',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
)
"""
)
logger.info("Таблица ticket_messages создана или уже существует")

# Создание таблицы вложений
cursor.execute(
    """
CREATE TABLE IF NOT EXISTS ticket_attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    message_id INT,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_size INT,
    uploaded_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES ticket_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
)
"""
)
logger.info("Таблица ticket_attachments создана или уже существует")

# Закрытие соединения
cursor.close()
db.close()
logger.info("Скрипт инициализации базы данных успешно выполнен")
