/**
 * REST API Client для взаимодействия с сервером без перезагрузки страницы
 */
const API_BASE = '/api/tasks';

class ApiClient {
    /**
     * Вспомогательный метод выполнения fetch-запросов и стандартизации ответов/ошибок
     */
    static async request(url, options = {}) {
        try {
            const response = await fetch(url, options);
            const contentType = response.headers.get('content-type');
            let data = null;

            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = { message: await response.text() };
            }

            if (!response.ok) {
                const error = new Error(data.message || `Ошибка сервера (HTTP ${response.status})`);
                error.status = response.status;
                error.errors = data.errors || [];
                error.data = data;
                throw error;
            }

            return data;
        } catch (err) {
            // Если ошибка уже обработана (HTTP статус != 2xx)
            if (err.status) {
                throw err;
            }
            // Сетевая ошибка (сервер недоступен)
            const networkError = new Error('Не удалось подключиться к серверу. Проверьте сетевое соединение.');
            networkError.status = 0;
            networkError.errors = [];
            throw networkError;
        }
    }

    /**
     * GET /api/tasks?status=...&search=...
     * Получить список всех задач с возможностью фильтрации
     */
    static async getTasks(status = 'all', search = '') {
        const params = new URLSearchParams();
        if (status && status !== 'all') {
            params.append('status', status);
        }
        if (search && search.trim() !== '') {
            params.append('search', search.trim());
        }

        const queryStr = params.toString() ? `?${params.toString()}` : '';
        const res = await this.request(`${API_BASE}${queryStr}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        return res.data || [];
    }

    /**
     * GET /api/tasks/:id
     * Получить одну задачу по ID
     */
    static async getTaskById(id) {
        const res = await this.request(`${API_BASE}/${id}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        return res.data;
    }

    /**
     * POST /api/tasks
     * Создать новую задачу (поддерживает FormData для multipart/form-data и обычный JSON)
     */
    static async createTask(formDataOrObject) {
        const isFormData = formDataOrObject instanceof FormData;
        const options = {
            method: 'POST',
            body: isFormData ? formDataOrObject : JSON.stringify(formDataOrObject)
        };

        if (!isFormData) {
            options.headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
        } else {
            options.headers = {
                'Accept': 'application/json'
            };
        }

        const res = await this.request(API_BASE, options);
        return res.data;
    }

    /**
     * PUT /api/tasks/:id
     * Полное обновление задачи
     */
    static async updateTask(id, formDataOrObject) {
        const isFormData = formDataOrObject instanceof FormData;
        const options = {
            method: 'PUT',
            body: isFormData ? formDataOrObject : JSON.stringify(formDataOrObject)
        };

        if (!isFormData) {
            options.headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
        } else {
            options.headers = {
                'Accept': 'application/json'
            };
        }

        const res = await this.request(`${API_BASE}/${id}`, options);
        return res.data;
    }

    /**
     * PATCH /api/tasks/:id
     * Частичное обновление задачи (например, статуса)
     */
    static async patchTask(id, partialData) {
        const res = await this.request(`${API_BASE}/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(partialData)
        });
        return res.data;
    }

    /**
     * DELETE /api/tasks/:id
     * Удалить задачу
     */
    static async deleteTask(id) {
        const res = await this.request(`${API_BASE}/${id}`, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json'
            }
        });
        return res;
    }
}

// Экспортируем глобально для использования в app.js
window.api = ApiClient;
