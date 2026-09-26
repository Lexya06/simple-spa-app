const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Папка для хранения БД (позволяет легко монтировать том в Docker при необходимости)
const dbDir = process.env.DB_DIR || __dirname;
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'todo.db');
const db = new Database(dbPath);

// Включаем WAL режим для лучшей производительности и конкурентности
db.pragma('journal_mode = WAL');

// Инициализация таблицы tasks
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    due_date TEXT,
    status TEXT DEFAULT 'pending',
    attachment_filename TEXT,
    attachment_original_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Вспомогательная функция приведения строки из БД к формату API (camelCase)
function formatTask(row) {
    if (!row) return null;
    return {
        id: row.id,
        title: row.title,
        dueDate: row.due_date || '',
        status: row.status,
        attachment: row.attachment_filename ? {
            filename: row.attachment_filename,
            originalName: row.attachment_original_name,
            url: `/uploads/${row.attachment_filename}`,
            downloadUrl: `/api/tasks/${row.id}/attachment`
        } : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

module.exports = {
    db,
    formatTask
};
