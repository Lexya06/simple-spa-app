/**
 * Модуль валидации входящих данных для REST API
 */

const ALLOWED_STATUSES = ['pending', 'in_progress', 'completed'];

/**
 * Валидация данных при создании / обновлении задачи
 */
function validateTaskInput(data, isPartial = false) {
    const errors = [];

    // Валидация заголовка (title)
    if (!isPartial || data.title !== undefined) {
        if (typeof data.title !== 'string' || data.title.trim().length === 0) {
            errors.push({
                field: 'title',
                message: 'Название задачи не может быть пустым.'
            });
        } else if (data.title.trim().length > 255) {
            errors.push({
                field: 'title',
                message: 'Название задачи не должно превышать 255 символов.'
            });
        }
    }

    // Валидация статуса (status)
    if (data.status !== undefined && data.status !== null && data.status !== '') {
        if (!ALLOWED_STATUSES.includes(data.status)) {
            errors.push({
                field: 'status',
                message: `Недопустимый статус. Разрешенные значения: ${ALLOWED_STATUSES.join(', ')}.`
            });
        }
    }

    // Валидация срока (dueDate)
    if (data.dueDate !== undefined && data.dueDate !== null && data.dueDate !== '') {
        if (typeof data.dueDate !== 'string') {
            errors.push({
                field: 'dueDate',
                message: 'Срок выполнения должен быть строкой с датой.'
            });
        } else {
            // Проверяем валидность формата даты (например, YYYY-MM-DD или YYYY-MM-DD HH:mm)
            const parsed = Date.parse(data.dueDate.replace(' ', 'T'));
            if (isNaN(parsed) && !/^\d{4}-\d{2}-\d{2}(\s\d{2}:\d{2})?$/.test(data.dueDate.trim())) {
                errors.push({
                    field: 'dueDate',
                    message: 'Некорректный формат даты срока выполнения.'
                });
            }
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        sanitizedData: {
            title: data.title ? data.title.trim() : '',
            status: data.status || 'pending',
            dueDate: data.dueDate ? data.dueDate.trim() : ''
        }
    };
}

module.exports = {
    ALLOWED_STATUSES,
    validateTaskInput
};
