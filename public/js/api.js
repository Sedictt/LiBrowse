// API client for LiBrowse

const API_BASE_URL = '/api';

class ApiClient {
    constructor() {
        this.baseUrl = API_BASE_URL;
    }

    getAuthHeader() {
        const token = localStorage.getItem('token');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...this.getAuthHeader(),
            ...options.headers
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    // Auth endpoints
    async login(email, password) {
        return this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
    }

    async register(userData) {
        return this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    }

    async getProfile() {
        return this.request('/auth/profile');
    }

    async updateProfile(profileData) {
        return this.request('/auth/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
    }

    // Books endpoints
    async getBooks(filters = {}) {
        const queryString = new URLSearchParams(filters).toString();
        return this.request(`/books${queryString ? '?' + queryString : ''}`);
    }

    async getBook(bookId) {
        return this.request(`/books/${bookId}`);
    }

    async createBook(bookData) {
        return this.request('/books', {
            method: 'POST',
            body: JSON.stringify(bookData)
        });
    }

    async updateBook(bookId, bookData) {
        return this.request(`/books/${bookId}`, {
            method: 'PUT',
            body: JSON.stringify(bookData)
        });
    }

    async deleteBook(bookId) {
        return this.request(`/books/${bookId}`, {
            method: 'DELETE'
        });
    }

    // Transactions endpoints
    async getTransactions(filters = {}) {
        const queryString = new URLSearchParams(filters).toString();
        return this.request(`/transactions${queryString ? '?' + queryString : ''}`);
    }

    async createTransaction(transactionData) {
        return this.request('/transactions', {
            method: 'POST',
            body: JSON.stringify(transactionData)
        });
    }

    async updateTransactionStatus(transactionId, status) {
        return this.request(`/transactions/${transactionId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
    }

    // Notifications endpoints
    async getNotifications() {
        return this.request('/notifications');
    }

    async markNotificationRead(notificationId) {
        return this.request(`/notifications/${notificationId}/read`, {
            method: 'PUT'
        });
    }

    async markAllNotificationsRead() {
        return this.request('/notifications/read-all', {
            method: 'PUT'
        });
    }

    // Stats endpoints
    async getPlatformStats() {
        return this.request('/stats/platform');
    }

    async getUserStats() {
        return this.request('/stats/user');
    }

    // Generic GET request
    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    // Generic POST request
    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    // Generic PUT request
    async put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    // Generic DELETE request
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
}

// Create global API instance
const api = new ApiClient();
