const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, formatTask } = require('./db');
const { ALLOWED_STATUSES, validateTaskInput } = require('./validators');

const app = express();
const PORT = process.env.PORT || 3000;

// Убеждаемся, что директория для файлов существует
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Настройка хранилища Multer для загрузки файлов multipart/form-data
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 15 * 1024 * 1024 // ограничение 15 МБ
    }
});

// Middleware для обработки JSON и URL-encoded данных
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Раздача статических файлов SPA и загруженных вложений
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// ============================================================================
// REST API МАРШРУТЫ ДЛЯ CRUD ОПЕРАЦИЙ НАД ЗАДАЧАМИ (/api/tasks)
// ============================================================================

/**
 * 1. GET /api/tasks - Получение списка задач
 * Поддерживает фильтрацию по статусу (?status=pending|in_progress|completed|all)
 * и текстовый поиск (?search=...)
 */
app.get('/api/tasks', (req, res) => {
    try {
        const { status = 'all', search } = req.query;

        let query = 'SELECT * FROM tasks';
        const conditions = [];
        const params = [];

        if (status && status !== 'all') {
            if (!ALLOWED_STATUSES.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: `Недопустимый параметр фильтрации статуса '${status}'.`
                });
            }
            conditions.push('status = ?');
            params.push(status);
        }

        if (search && search.trim() !== '') {
            conditions.push('title LIKE ?');
            params.push(`%${search.trim()}%`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY id DESC';

        const stmt = db.prepare(query);
        const rows = stmt.all(...params);
        const tasks = rows.map(formatTask);

        res.status(200).json({
            success: true,
            count: tasks.length,
            data: tasks
        });
    } catch (err) {
        console.error('Ошибка при получении списка задач:', err);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера при получении задач.'
        });
    }
});

/**
 * 2. GET /api/tasks/:id - Получение одной задачи по ID
 */
app.get('/api/tasks/:id', (req, res) => {
    try {
        const taskId = Number(req.params.id);
        if (isNaN(taskId)) {
            return res.status(400).json({
                success: false,
                message: 'Некорректный идентификатор задачи (ID должен быть числом).'
            });
        }

        const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
        const task = stmt.get(taskId);

        if (!task) {
            return res.status(404).json({
                success: false,
                message: `Задача с ID ${taskId} не найдена.`
            });
        }

        res.status(200).json({
            success: true,
            data: formatTask(task)
        });
    } catch (err) {
        console.error('Ошибка при получении задачи:', err);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера при получении задачи.'
        });
    }
});

/**
 * 3. POST /api/tasks - Создание новой задачи
 * Поддерживает как application/json, так и multipart/form-data (с файлом)
 */
app.post('/api/tasks', upload.single('attachment'), (req, res) => {
    try {
        const validation = validateTaskInput(req.body);
        if (!validation.isValid) {
            // Если валидация не прошла и был загружен файл, удаляем его
            if (req.file) {
                const filePath = path.join(uploadDir, req.file.filename);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
            return res.status(400).json({
                success: false,
                message: 'Ошибка валидации входящих данных.',
                errors: validation.errors
            });
        }

        const { title, dueDate, status } = validation.sanitizedData;
        const filename = req.file ? req.file.filename : null;
        const originalName = req.file
            ? Buffer.from(req.file.originalname, 'latin1').toString('utf8')
            : null;

        const stmt = db.prepare(`
            INSERT INTO tasks (title, due_date, status, attachment_filename, attachment_original_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        const result = stmt.run(title, dueDate, status, filename, originalName);
        const newTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({
            success: true,
            message: 'Задача успешно создана.',
            data: formatTask(newTask)
        });
    } catch (err) {
        console.error('Ошибка при создании задачи:', err);
        if (req.file) {
            const filePath = path.join(uploadDir, req.file.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера при создании задачи.'
        });
    }
});

/**
 * 4. PUT /api/tasks/:id - Полное обновление задачи
 * Поддерживает multipart/form-data и application/json
 */
app.put('/api/tasks/:id', upload.single('attachment'), (req, res) => {
    try {
        const taskId = Number(req.params.id);
        if (isNaN(taskId)) {
            if (req.file) fs.unlinkSync(path.join(uploadDir, req.file.filename));
            return res.status(400).json({
                success: false,
                message: 'Некорректный ID задачи.'
            });
        }

        const existingTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        if (!existingTask) {
            if (req.file) fs.unlinkSync(path.join(uploadDir, req.file.filename));
            return res.status(404).json({
                success: false,
                message: `Задача с ID ${taskId} не найдена.`
            });
        }

        const validation = validateTaskInput(req.body);
        if (!validation.isValid) {
            if (req.file) fs.unlinkSync(path.join(uploadDir, req.file.filename));
            return res.status(400).json({
                success: false,
                message: 'Ошибка валидации входящих данных.',
                errors: validation.errors
            });
        }

        const { title, dueDate, status } = validation.sanitizedData;
        let filename = existingTask.attachment_filename;
        let originalName = existingTask.attachment_original_name;

        // Если передан флаг удаления текущего файла
        if (req.body.removeAttachment === 'true' || req.body.removeAttachment === true) {
            if (filename) {
                const oldPath = path.join(uploadDir, filename);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
            filename = null;
            originalName = null;
        }

        // Если прикреплен новый файл
        if (req.file) {
            if (existingTask.attachment_filename && existingTask.attachment_filename !== req.file.filename) {
                const oldPath = path.join(uploadDir, existingTask.attachment_filename);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
            filename = req.file.filename;
            originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        }

        const stmt = db.prepare(`
            UPDATE tasks 
            SET title = ?, due_date = ?, status = ?, attachment_filename = ?, attachment_original_name = ?, updated_at = datetime('now')
            WHERE id = ?
        `);
        stmt.run(title, dueDate, status, filename, originalName, taskId);

        const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

        res.status(200).json({
            success: true,
            message: 'Задача успешно обновлена.',
            data: formatTask(updatedTask)
        });
    } catch (err) {
        console.error('Ошибка при обновлении задачи:', err);
        if (req.file) {
            const filePath = path.join(uploadDir, req.file.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера при обновлении задачи.'
        });
    }
});

/**
 * 5. PATCH /api/tasks/:id - Частичное обновление задачи (например, быстрое изменение статуса)
 */
app.patch('/api/tasks/:id', (req, res) => {
    try {
        const taskId = Number(req.params.id);
        if (isNaN(taskId)) {
            return res.status(400).json({
                success: false,
                message: 'Некорректный ID задачи.'
            });
        }

        const existingTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        if (!existingTask) {
            return res.status(404).json({
                success: false,
                message: `Задача с ID ${taskId} не найдена.`
            });
        }

        const validation = validateTaskInput(req.body, true);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Ошибка валидации входящих данных.',
                errors: validation.errors
            });
        }

        const updates = [];
        const params = [];

        if (req.body.title !== undefined) {
            updates.push('title = ?');
            params.push(validation.sanitizedData.title);
        }
        if (req.body.status !== undefined) {
            updates.push('status = ?');
            params.push(validation.sanitizedData.status);
        }
        if (req.body.dueDate !== undefined) {
            updates.push('due_date = ?');
            params.push(validation.sanitizedData.dueDate);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Не переданы поля для обновления.'
            });
        }

        updates.push("updated_at = datetime('now')");
        params.push(taskId);

        const sql = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`;
        db.prepare(sql).run(...params);

        const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

        res.status(200).json({
            success: true,
            message: 'Статус задачи успешно обновлен.',
            data: formatTask(updatedTask)
        });
    } catch (err) {
        console.error('Ошибка при частичном обновлении задачи:', err);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера при обновлении задачи.'
        });
    }
});

/**
 * 6. DELETE /api/tasks/:id - Удаление задачи и связанного файла
 */
app.delete('/api/tasks/:id', (req, res) => {
    try {
        const taskId = Number(req.params.id);
        if (isNaN(taskId)) {
            return res.status(400).json({
                success: false,
                message: 'Некорректный ID задачи.'
            });
        }

        const existingTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        if (!existingTask) {
            return res.status(404).json({
                success: false,
                message: `Задача с ID ${taskId} не найдена.`
            });
        }

        // Удаление файла с диска
        if (existingTask.attachment_filename) {
            const filePath = path.join(uploadDir, existingTask.attachment_filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // Удаление записи из БД
        db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);

        res.status(200).json({
            success: true,
            message: `Задача #${taskId} успешно удалена.`,
            deletedId: taskId
        });
    } catch (err) {
        console.error('Ошибка при удалении задачи:', err);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера при удалении задачи.'
        });
    }
});

/**
 * 7. GET /api/tasks/:id/attachment - Скачивание файла задачи
 */
app.get('/api/tasks/:id/attachment', (req, res) => {
    try {
        const taskId = Number(req.params.id);
        const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

        if (!task || !task.attachment_filename) {
            return res.status(404).json({
                success: false,
                message: 'Прикрепленный файл не найден.'
            });
        }

        const filePath = path.join(uploadDir, task.attachment_filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'Файл отсутствует на диске сервера.'
            });
        }

        res.download(filePath, task.attachment_original_name || task.attachment_filename);
    } catch (err) {
        console.error('Ошибка при скачивании файла:', err);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка при отдаче файла.'
        });
    }
});

// Middleware обработки ошибок Multer и некорректного JSON
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'Размер файла превышает допустимый лимит (15 МБ).'
            });
        }
        return res.status(400).json({
            success: false,
            message: `Ошибка загрузки файла: ${err.message}`
        });
    }
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            message: 'Некорректный JSON в теле запроса.'
        });
    }
    console.error('Необработанная ошибка:', err);
    res.status(500).json({
        success: false,
        message: 'Произошла непредвиденная ошибка на сервере.'
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`[SPA REST API Server] Сервер запущен: http://localhost:${PORT}`);
});
