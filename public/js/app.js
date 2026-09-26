/**
 * Главный контроллер SPA приложения
 */

// --- Глобальное состояние приложения ---
const state = {
    tasks: [],
    currentFilter: 'all',
    searchQuery: '',
    isLoading: false,
    deleteCandidateId: null
};

// --- DOM Элементы ---
const elements = {
    // Форма создания
    createForm: document.getElementById('create-task-form'),
    createTitle: document.getElementById('task-title'),
    createDueDate: document.getElementById('task-dueDate'),
    createTimeToggle: document.getElementById('task-includeTimeToggle'),
    createStatus: document.getElementById('task-status'),
    createAttachment: document.getElementById('task-attachment'),
    createFileBadge: document.getElementById('create-file-badge'),
    btnClearDate: document.getElementById('btn-clear-date'),
    btnResetForm: document.getElementById('btn-reset-form'),
    createValidationErrors: document.getElementById('form-validation-errors'),

    // Панель управления
    searchInput: document.getElementById('search-input'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    filterTabs: document.querySelectorAll('.filter-tab'),

    // Счетчики
    countAll: document.getElementById('count-all'),
    countPending: document.getElementById('count-pending'),
    countInProgress: document.getElementById('count-in_progress'),
    countCompleted: document.getElementById('count-completed'),

    // Список и состояния
    taskList: document.getElementById('task-list'),
    loadingSpinner: document.getElementById('loading-spinner'),
    emptyState: document.getElementById('empty-state'),
    globalAlert: document.getElementById('global-alert'),
    globalAlertText: document.getElementById('global-alert-text'),
    toastContainer: document.getElementById('toast-container'),

    // Модальное окно редактирования
    editModal: document.getElementById('edit-modal'),
    editForm: document.getElementById('edit-task-form'),
    editId: document.getElementById('edit-task-id'),
    editTitle: document.getElementById('edit-title'),
    editDueDate: document.getElementById('edit-dueDate'),
    editTimeToggle: document.getElementById('edit-includeTimeToggle'),
    editStatus: document.getElementById('edit-status'),
    editAttachment: document.getElementById('edit-attachment'),
    editRemoveAttachment: document.getElementById('edit-removeAttachment'),
    currentAttachmentBox: document.getElementById('current-attachment-box'),
    currentFilename: document.getElementById('current-filename'),
    btnClearEditDate: document.getElementById('btn-clear-edit-date'),
    editValidationErrors: document.getElementById('edit-validation-errors'),

    // Модальное окно удаления
    deleteModal: document.getElementById('delete-modal'),
    deleteTaskTitle: document.getElementById('delete-task-title'),
    btnConfirmDelete: document.getElementById('btn-confirm-delete')
};

// Инстансы Flatpickr
let createPickerInstance = null;
let editPickerInstance = null;

// ============================================================================
// СИСТЕМА УВЕДОМЛЕНИЙ (TOASTS) И ОШИБОК
// ============================================================================

function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `
        <span>${icon}</span>
        <div class="toast-content">${escapeHtml(message)}</div>
        <button type="button" class="toast-close" title="Закрыть">✕</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => removeToast(toast));

    elements.toastContainer.appendChild(toast);

    if (duration > 0) {
        setTimeout(() => removeToast(toast), duration);
    }
}

function removeToast(toast) {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    setTimeout(() => {
        if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
        }
    }, 200);
}

function showGlobalAlert(message) {
    elements.globalAlertText.textContent = message;
    elements.globalAlert.style.display = 'flex';
}

function hideGlobalAlert() {
    elements.globalAlert.style.display = 'none';
}

// Отображение ошибок валидации на формах
function displayFormErrors(errorBoxElement, formElement, errors, generalMessage) {
    errorBoxElement.innerHTML = '';
    
    // Сброс подсветки предыдущих ошибок
    formElement.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    formElement.querySelectorAll('.field-error-msg').forEach(el => el.textContent = '');

    if (!errors || errors.length === 0) {
        if (generalMessage) {
            errorBoxElement.textContent = generalMessage;
            errorBoxElement.style.display = 'block';
        }
        return;
    }

    let html = `<strong>${escapeHtml(generalMessage || 'Пожалуйста, исправьте ошибки:')}</strong><ul>`;
    errors.forEach(err => {
        html += `<li>${escapeHtml(err.message)}</li>`;
        
        // Подсвечиваем конкретное поле
        if (err.field) {
            const input = formElement.querySelector(`[name="${err.field}"]`);
            if (input) {
                input.classList.add('is-invalid');
            }
            const fieldError = formElement.querySelector(`#error-${formElement.id.replace('-form', '')}-${err.field}`) 
                || formElement.querySelector(`#error-${err.field}`);
            if (fieldError) {
                fieldError.textContent = err.message;
            }
        }
    });
    html += '</ul>';

    errorBoxElement.innerHTML = html;
    errorBoxElement.style.display = 'block';
}

function clearFormErrors(errorBoxElement, formElement) {
    errorBoxElement.innerHTML = '';
    errorBoxElement.style.display = 'none';
    formElement.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    formElement.querySelectorAll('.field-error-msg').forEach(el => el.textContent = '');
}

// ============================================================================
// РАБОТА С СЕТЬЮ И ЗАДАЧАМИ (CRUD)
// ============================================================================

/**
 * Загрузить задачи с сервера и отрендерить список
 */
async function loadTasks(isInitial = false) {
    state.isLoading = true;

    // Спиннер показываем только при первой инициализации приложения, если список пуст
    if (isInitial && state.tasks.length === 0) {
        elements.loadingSpinner.style.display = 'flex';
        elements.taskList.style.display = 'none';
        elements.emptyState.style.display = 'none';
    }
    hideGlobalAlert();

    try {
        const tasks = await window.api.getTasks(state.currentFilter, state.searchQuery);
        state.tasks = tasks;
        renderTaskList();
        await updateCounters();
    } catch (err) {
        console.error('Ошибка загрузки задач:', err);
        showGlobalAlert(err.message || 'Ошибка загрузки задач с сервера.');
        showToast(err.message || 'Ошибка загрузки задач', 'error');
    } finally {
        state.isLoading = false;
        elements.loadingSpinner.style.display = 'none';
    }
}

/**
 * Обновление счетчиков на вкладках
 */
async function updateCounters() {
    try {
        // Получаем все задачи для подсчета точного количества в каждой категории
        const allTasks = await window.api.getTasks('all', state.searchQuery);
        const counts = {
            all: allTasks.length,
            pending: 0,
            in_progress: 0,
            completed: 0
        };

        allTasks.forEach(task => {
            if (counts[task.status] !== undefined) {
                counts[task.status]++;
            }
        });

        elements.countAll.textContent = counts.all;
        elements.countPending.textContent = counts.pending;
        elements.countInProgress.textContent = counts.in_progress;
        elements.countCompleted.textContent = counts.completed;
    } catch (err) {
        console.warn('Не удалось обновить счетчики', err);
    }
}

/**
 * Создание DOM-элемента карточки задачи
 */
function createTaskElement(task) {
    const statusLabels = {
        pending: 'Ожидает',
        in_progress: 'В процессе',
        completed: 'Завершено'
    };

    const li = document.createElement('li');
    li.className = `task-item ${task.status}`;
    li.dataset.id = task.id;
    li.dataset.rawJson = JSON.stringify(task);

    const formattedDueDate = task.dueDate ? formatDisplayDate(task.dueDate) : 'Без срока';

    let attachmentHtml = '';
    if (task.attachment) {
        attachmentHtml = `
            <div class="task-attachment-info">
                📎 Вложение: 
                <a href="${task.attachment.downloadUrl}" target="_blank" rel="noopener noreferrer" download="${escapeHtml(task.attachment.originalName)}">
                    ${escapeHtml(task.attachment.originalName)}
                </a>
            </div>
        `;
    }

    li.innerHTML = `
        <div class="task-info">
            <div class="task-title">${escapeHtml(task.title)}</div>
            <div class="task-meta">
                <span>⏰ Срок: <strong>${formattedDueDate}</strong></span>
                <span>•</span>
                <span>Статус: <span class="badge badge-${task.status}">${statusLabels[task.status] || task.status}</span></span>
            </div>
            ${attachmentHtml}
        </div>

        <div class="task-actions">
            <!-- Быстрое изменение статуса через REST API PATCH -->
            <select class="status-select" data-action="quick-status" title="Изменить статус">
                <option value="pending" ${task.status === 'pending' ? 'selected' : ''}>Ожидает</option>
                <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>В процессе</option>
                <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>Завершено</option>
            </select>

            <!-- Кнопка редактирования (открывает модалку PUT) -->
            <button type="button" class="btn btn-sm btn-secondary" data-action="edit" title="Редактировать">
                ✏️
            </button>

            <!-- Кнопка удаления (открывает диалог DELETE) -->
            <button type="button" class="btn btn-sm btn-danger" data-action="delete" title="Удалить">
                🗑️
            </button>
        </div>
    `;

    // Слушатели действий внутри карточки задачи
    const selectStatus = li.querySelector('[data-action="quick-status"]');
    selectStatus.addEventListener('change', async (e) => {
        const newStatus = e.target.value;
        await handleQuickStatusChange(task.id, newStatus, selectStatus);
    });

    const btnEdit = li.querySelector('[data-action="edit"]');
    btnEdit.addEventListener('click', () => openEditModal(task));

    const btnDelete = li.querySelector('[data-action="delete"]');
    btnDelete.addEventListener('click', () => openDeleteModal(task));

    return li;
}

/**
 * Отрисовка списка задач в DOM без мерцания и с сохранением неизмененных нод
 */
function renderTaskList() {
    if (!state.tasks || state.tasks.length === 0) {
        elements.taskList.innerHTML = '';
        elements.taskList.style.display = 'none';
        elements.emptyState.style.display = 'block';
        return;
    }

    elements.emptyState.style.display = 'none';
    elements.taskList.style.display = 'flex';

    // Индексируем существующие карточки по ID
    const existingMap = new Map();
    elements.taskList.querySelectorAll('.task-item').forEach(el => {
        existingMap.set(Number(el.dataset.id), el);
    });

    // Переиспользуем неизмененные DOM-элементы или создаем новые
    const newNodes = state.tasks.map(task => {
        const existing = existingMap.get(task.id);
        if (existing && existing.dataset.rawJson === JSON.stringify(task)) {
            return existing;
        }
        return createTaskElement(task);
    });

    // Атомарное обновление списка без промежуточного белого экрана
    elements.taskList.replaceChildren(...newNodes);
}

/**
 * Быстрое обновление статуса задачи без перезагрузки (PATCH /api/tasks/:id)
 */
async function handleQuickStatusChange(taskId, newStatus, selectElement) {
    const originalValue = selectElement.getAttribute('data-prev-val') || selectElement.value;
    try {
        selectElement.disabled = true;
        const updatedTask = await window.api.patchTask(taskId, { status: newStatus });
        showToast(`Статус задачи #${taskId} изменен на "${getStatusLabel(newStatus)}"`, 'success');
        
        // Обновляем локальные данные и карточку
        const taskIdx = state.tasks.findIndex(t => t.id === taskId);
        if (taskIdx !== -1) {
            state.tasks[taskIdx] = updatedTask;
        }

        // Если активен фильтр и задача больше ему не соответствует — перезагружаем или удаляем из DOM
        if (state.currentFilter !== 'all' && state.currentFilter !== newStatus) {
            state.tasks = state.tasks.filter(t => t.id !== taskId);
        }
        
        renderTaskList();
        updateCounters();
    } catch (err) {
        console.error('Ошибка изменения статуса:', err);
        selectElement.value = originalValue;
        showToast(err.message || 'Не удалось обновить статус задачи.', 'error');
    } finally {
        selectElement.disabled = false;
    }
}

/**
 * Обработка отправки формы создания новой задачи (POST /api/tasks)
 */
elements.createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(elements.createValidationErrors, elements.createForm);

    const formData = new FormData(elements.createForm);
    const submitBtn = document.getElementById('btn-submit-task');

    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Сохранение...';

        const createdTask = await window.api.createTask(formData);
        showToast(`Задача "${createdTask.title}" успешно создана!`, 'success');

        // Сброс формы и очистка черновика
        resetCreateForm();
        clearDraft();

        // Обновляем список задач
        await loadTasks();
    } catch (err) {
        console.error('Ошибка создания задачи:', err);
        displayFormErrors(elements.createValidationErrors, elements.createForm, err.errors, err.message);
        showToast(err.message || 'Ошибка валидации или создания задачи.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="btn-icon">💾</span> Добавить задачу';
    }
});

/**
 * Обработка отправки формы редактирования (PUT /api/tasks/:id)
 */
elements.editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(elements.editValidationErrors, elements.editForm);

    const taskId = elements.editId.value;
    const formData = new FormData(elements.editForm);
    const saveBtn = document.getElementById('btn-save-edit');

    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = 'Сохранение...';

        const updatedTask = await window.api.updateTask(taskId, formData);
        showToast(`Задача #${taskId} успешно обновлена!`, 'success');

        closeEditModal();
        await loadTasks();
    } catch (err) {
        console.error('Ошибка обновления задачи:', err);
        displayFormErrors(elements.editValidationErrors, elements.editForm, err.errors, err.message);
        showToast(err.message || 'Не удалось обновить задачу.', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '💾 Сохранить изменения';
    }
});

/**
 * Обработка подтверждения удаления (DELETE /api/tasks/:id)
 */
elements.btnConfirmDelete.addEventListener('click', async () => {
    if (!state.deleteCandidateId) return;

    try {
        elements.btnConfirmDelete.disabled = true;
        elements.btnConfirmDelete.textContent = 'Удаление...';

        await window.api.deleteTask(state.deleteCandidateId);
        showToast('Задача успешно удалена.', 'success');

        closeDeleteModal();
        await loadTasks();
    } catch (err) {
        console.error('Ошибка при удалении задачи:', err);
        showToast(err.message || 'Не удалось удалить задачу.', 'error');
    } finally {
        elements.btnConfirmDelete.disabled = false;
        elements.btnConfirmDelete.textContent = 'Удалить';
    }
});

// ============================================================================
// УПРАВЛЕНИЕ МОДАЛЬНЫМИ ОКНАМИ
// ============================================================================

function openEditModal(task) {
    clearFormErrors(elements.editValidationErrors, elements.editForm);
    elements.editId.value = task.id;
    elements.editTitle.value = task.title;
    elements.editStatus.value = task.status;
    elements.editAttachment.value = '';
    elements.editRemoveAttachment.checked = false;

    // Проверяем наличие времени в дате
    const hasTime = task.dueDate && task.dueDate.includes(':');
    elements.editTimeToggle.checked = !!hasTime;
    initEditPicker(!!hasTime, task.dueDate || null);

    // Отображение текущего файла
    if (task.attachment) {
        elements.currentFilename.textContent = task.attachment.originalName;
        elements.currentAttachmentBox.style.display = 'flex';
    } else {
        elements.currentAttachmentBox.style.display = 'none';
    }

    elements.editModal.classList.add('open');
    elements.editModal.setAttribute('aria-hidden', 'false');
    elements.editTitle.focus();
}

function closeEditModal() {
    elements.editModal.classList.remove('open');
    elements.editModal.setAttribute('aria-hidden', 'true');
}

function openDeleteModal(task) {
    state.deleteCandidateId = task.id;
    elements.deleteTaskTitle.textContent = `#${task.id} - ${task.title}`;
    elements.deleteModal.classList.add('open');
    elements.deleteModal.setAttribute('aria-hidden', 'false');
}

function closeDeleteModal() {
    state.deleteCandidateId = null;
    elements.deleteModal.classList.remove('open');
    elements.deleteModal.setAttribute('aria-hidden', 'true');
}

// ============================================================================
// КАЛЕНДАРЬ FLATPICKR
// ============================================================================

function initCreatePicker(enableTime, defaultVal = null) {
    const previousValue = defaultVal || (createPickerInstance ? createPickerInstance.input.value : null);
    if (createPickerInstance) {
        createPickerInstance.destroy();
    }

    createPickerInstance = flatpickr("#task-dueDate", {
        locale: "ru",
        enableTime: enableTime,
        time_24hr: true,
        dateFormat: enableTime ? "Y-m-d H:i" : "Y-m-d",
        altInput: true,
        altFormat: enableTime ? "d.m.Y в H:i" : "d.m.Y",
        defaultDate: previousValue || null,
        allowInput: false,
        onChange: function(selectedDates, dateStr) {
            localStorage.setItem('draft_dueDate', dateStr);
        }
    });
}

function initEditPicker(enableTime, defaultVal = null) {
    if (editPickerInstance) {
        editPickerInstance.destroy();
    }

    editPickerInstance = flatpickr("#edit-dueDate", {
        locale: "ru",
        enableTime: enableTime,
        time_24hr: true,
        dateFormat: enableTime ? "Y-m-d H:i" : "Y-m-d",
        altInput: true,
        altFormat: enableTime ? "d.m.Y в H:i" : "d.m.Y",
        defaultDate: defaultVal || null,
        allowInput: false
    });
}

elements.createTimeToggle.addEventListener('change', (e) => {
    localStorage.setItem('draft_hasTime', e.target.checked ? 'true' : 'false');
    initCreatePicker(e.target.checked);
    createPickerInstance.open();
});

elements.editTimeToggle.addEventListener('change', (e) => {
    initEditPicker(e.target.checked, elements.editDueDate.value);
    editPickerInstance.open();
});

elements.btnClearDate.addEventListener('click', () => {
    if (createPickerInstance) {
        createPickerInstance.clear();
        localStorage.removeItem('draft_dueDate');
    }
});

elements.btnClearEditDate.addEventListener('click', () => {
    if (editPickerInstance) {
        editPickerInstance.clear();
    }
});

// ============================================================================
// СОХРАНЕНИЕ И ВОССТАНОВЛЕНИЕ ЧЕРНОВИКОВ (INDEXEDDB + LOCALSTORAGE)
// ============================================================================

function openIndexedDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('SpaDraftFilesDB', 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('files')) {
                db.createObjectStore('files');
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveFileDraft(file) {
    if (!file) return;
    try {
        const db = await openIndexedDb();
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(file, 'savedAttachment');
    } catch (e) {
        console.warn('Ошибка сохранения файла в IndexedDB', e);
    }
}

async function removeFileDraft() {
    try {
        const db = await openIndexedDb();
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').delete('savedAttachment');
    } catch (e) {
        console.warn('Ошибка удаления файла из IndexedDB', e);
    }
}

async function restoreFileDraft() {
    try {
        const db = await openIndexedDb();
        const tx = db.transaction('files', 'readonly');
        const req = tx.objectStore('files').get('savedAttachment');
        req.onsuccess = () => {
            const savedFile = req.result;
            if (savedFile) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(savedFile);
                elements.createAttachment.files = dataTransfer.files;

                elements.createFileBadge.textContent = `✓ Восстановлен черновик файла: ${savedFile.name}`;
                elements.createFileBadge.style.display = 'block';
            }
        };
    } catch (e) {
        console.warn('Не удалось восстановить файл из IndexedDB', e);
    }
}

function clearDraft() {
    localStorage.removeItem('draft_title');
    localStorage.removeItem('draft_status');
    localStorage.removeItem('draft_dueDate');
    localStorage.removeItem('draft_hasTime');
    removeFileDraft();
    elements.createFileBadge.style.display = 'none';
}

function resetCreateForm() {
    elements.createForm.reset();
    if (createPickerInstance) createPickerInstance.clear();
    elements.createTimeToggle.checked = false;
    elements.createFileBadge.style.display = 'none';
    clearFormErrors(elements.createValidationErrors, elements.createForm);
}

// Автосохранение черновика при вводе
elements.createTitle.addEventListener('input', () => {
    localStorage.setItem('draft_title', elements.createTitle.value);
});

elements.createStatus.addEventListener('change', () => {
    localStorage.setItem('draft_status', elements.createStatus.value);
});

elements.createAttachment.addEventListener('change', () => {
    if (elements.createAttachment.files.length > 0) {
        saveFileDraft(elements.createAttachment.files[0]);
        elements.createFileBadge.textContent = `✓ Файл выбран: ${elements.createAttachment.files[0].name}`;
        elements.createFileBadge.style.display = 'block';
    } else {
        removeFileDraft();
        elements.createFileBadge.style.display = 'none';
    }
});

elements.btnResetForm.addEventListener('click', () => {
    resetCreateForm();
    clearDraft();
    showToast('Форма и черновики очищены', 'info', 2000);
});

// ============================================================================
// ПОИСК И ФИЛЬТРАЦИЯ
// ============================================================================

// Переключение фильтра по вкладкам
elements.filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        elements.filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.currentFilter = tab.dataset.filter;
        loadTasks();
    });
});

// Поиск с debounce
let searchTimeout = null;
elements.searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    state.searchQuery = val;
    elements.btnClearSearch.style.display = val ? 'block' : 'none';

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadTasks();
    }, 300);
});

elements.btnClearSearch.addEventListener('click', () => {
    elements.searchInput.value = '';
    state.searchQuery = '';
    elements.btnClearSearch.style.display = 'none';
    loadTasks();
});

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function getStatusLabel(status) {
    const map = {
        pending: 'Ожидает',
        in_progress: 'В процессе',
        completed: 'Завершено'
    };
    return map[status] || status;
}

function formatDisplayDate(dateString) {
    if (!dateString) return '';
    const [y, m, d] = dateString.split('-');
    return `${d}.${m}.${y}`;
}

// Закрытие модалок по Escape
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeEditModal();
        closeDeleteModal();
    }
});

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ
// ============================================================================

window.addEventListener('DOMContentLoaded', async () => {
    // 1. Восстановление черновика создания
    const savedTitle = localStorage.getItem('draft_title');
    const savedStatus = localStorage.getItem('draft_status');
    const savedDueDate = localStorage.getItem('draft_dueDate');
    const savedHasTime = localStorage.getItem('draft_hasTime') === 'true';

    if (savedTitle) elements.createTitle.value = savedTitle;
    if (savedStatus) elements.createStatus.value = savedStatus;
    if (savedHasTime) elements.createTimeToggle.checked = true;

    initCreatePicker(savedHasTime, savedDueDate);
    restoreFileDraft();

    // 2. Первоначальная загрузка задач через REST API
    await loadTasks(true);
});
