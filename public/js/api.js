// PLV BookSwap - API Client Utilities
class API {
    constructor() {
        const origin = window.location.origin || '';
        const isHttp = /^https?:\/\//i.test(origin);
        this.baseURL = (isHttp ? origin : 'http://localhost:3000') + '/api';
        this.token = localStorage.getItem('token');
    }

    // Set authentication token
    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('token', token);
        } else {
            localStorage.removeItem('token');
        }
    }

    // Get authentication headers
    getHeaders(includeAuth = true) {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (includeAuth && this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        return headers;
    }

    // Generic request method
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: this.getHeaders(options.auth !== false),
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    }

    // GET request
    async get(endpoint, options = {}) {
        return this.request(endpoint, { method: 'GET', ...options });
    }

    // POST request
    async post(endpoint, data = {}, options = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
            ...options
        });
    }

    // PUT request
    async put(endpoint, data = {}, options = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
            ...options
        });
    }

    // DELETE request
    async delete(endpoint, options = {}) {
        return this.request(endpoint, { method: 'DELETE', ...options });
    }

    // Upload file
    async upload(endpoint, formData, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const headers = {};
        
        if (this.token && options.auth !== false) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: formData,
                ...options
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('Upload failed:', error);
            throw error;
        }
    }

    // Authentication endpoints
    async register(userData) {
        return this.post('/auth/register', userData, { auth: false });
    }

    async verifyOTP(email, otp) {
        return this.post('/auth/verify-otp', { email, otp }, { auth: false });
    }

    async login(email, password) {
        return this.post('/auth/login', { email, password }, { auth: false });
    }

    async loginWithCaptcha(loginData) {
        return this.post('/auth/login', loginData, { auth: false });
    }

    async verifyToken() {
        return this.get('/auth/verify');
    }

    async logout() {
        this.setToken(null);
        return Promise.resolve();
    }

    // User endpoints
    async getProfile() {
        return this.get('/users/profile');
    }

    async updateProfile(profileData) {
        return this.put('/users/profile', profileData);
    }

    async getUserStats() {
        return this.get('/users/stats');
    }

    // Book endpoints
    async getBooks(filters = {}) {
        const params = new URLSearchParams(filters);
        return this.get(`/books?${params}`);
    }

    async searchBooks(query, filters = {}) {
        const params = new URLSearchParams({ query, ...filters });
        return this.get(`/books/search?${params}`);
    }

    async getBook(id) {
        return this.get(`/books/${id}`);
    }

    async addBook(bookData) {
        return this.post('/books', bookData);
    }

    async updateBook(id, bookData) {
        return this.put(`/books/${id}`, bookData);
    }

    async deleteBook(id) {
        return this.delete(`/books/${id}`);
    }

    async uploadBookImage(bookId, imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);
        return this.upload(`/books/${bookId}/image`, formData);
    }

    // Transaction endpoints
    async getTransactions(type = 'all') {
        return this.get(`/transactions?type=${type}`);
    }

    async createTransaction(bookId, message = '') {
        return this.post('/transactions', { book_id: bookId, message });
    }

    async updateTransactionStatus(id, status, message = '') {
        return this.put(`/transactions/${id}/status`, { status, message });
    }

    // Feedback endpoints
    async getFeedback(userId) {
        return this.get(`/feedback/${userId}`);
    }

    async submitFeedback(transactionId, rating, comment) {
        return this.post('/feedback', { transaction_id: transactionId, rating, comment });
    }

    // Notification endpoints
    async getNotifications() {
        return this.get('/notifications');
    }

    async markNotificationRead(id) {
        return this.put(`/notifications/${id}/read`);
    }

    async markAllNotificationsRead() {
        return this.put('/notifications/read-all');
    }

    // Statistics endpoints
    async getPlatformStats() {
        return this.get('/stats/platform');
    }
}

// Create global API instance
window.api = new API();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}
