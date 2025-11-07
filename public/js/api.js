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
            const fetchOptions = { ...options, headers };
            if (!('cache' in fetchOptions)) fetchOptions.cache = 'no-store';
            const response = await fetch(url, fetchOptions);
            let data = null;
            try {
                data = await response.json();
            } catch (_) {
                // Non-JSON response
                data = null;
            }

            if (!response.ok) {
                const message = (data && (data.error || data.message)) || 'Request failed';
                const err = new Error(message);
                // Attach additional context
                err.status = response.status;
                err.endpoint = endpoint;
                err.body = data;
                err.suppressLog = !!(options && (options.suppressErrorLog || (options.silent401 && (response.status === 401 || response.status === 403))));

                // Handle token expiration - clear auth and force re-login
                if (response.status === 401 || response.status === 403) {
                    // Check if it's a token expiration error
                    const isTokenExpired = message.toLowerCase().includes('token') &&
                        (message.toLowerCase().includes('expired') ||
                            message.toLowerCase().includes('invalid'));

                    if (isTokenExpired) {
                        console.warn('🔒 Token expired, clearing authentication...');
                        // Clear expired token
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');

                        // Dispatch event to notify auth manager
                        try {
                            window.dispatchEvent(new CustomEvent('auth:token-expired', {
                                detail: { status: response.status, endpoint, message }
                            }));
                        } catch (_) { /* noop for non-browser */ }
                    } else {
                        // Generic unauthorized error
                        try {
                            window.dispatchEvent(new CustomEvent('auth:unauthorized', {
                                detail: { status: response.status, endpoint }
                            }));
                        } catch (_) { /* noop for non-browser */ }
                    }
                }

                if (!err.suppressLog) {
                    console.error('API request failed:', err);
                }
                throw err;
            }

            return data;
        } catch (error) {
            if (!error || !error.suppressLog) {
                console.error('API request failed:', error);
            }
            throw error;
        }
    }

    // Auth endpoints
    async login(email, password, captchaToken) {
        const payload = { email, password };
        if (captchaToken) payload.captcha_token = captchaToken;
        return this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async register(userData, captchaToken) {
        const payload = {
            email: userData.email,
            student_no: userData.student_id,
            fname: userData.firstname,
            lname: userData.lastname,
            password: userData.password,
            course: userData.program,
            year: userData.year || 1
        };
        if (captchaToken) payload.captcha_token = captchaToken;
        return this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async uploadVerificationDocuments(formData) {
        const url = `${this.baseUrl}/verification/upload-documents`;
        const headers = {
            ...this.getAuthHeader()
            // Don't set Content-Type for FormData, browser will set it with boundary
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Upload failed');
            }

            return data;
        } catch (error) {
            console.error('Document upload failed:', error);
            throw error;
        }
    }

    async getProfile() {
        return this.request('/auth/profile');
    }

    async updateProfile(profileData) {
        return this.request('/users/profile', {  // ⬅️ Fixed leading slash
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
    }


    // =====================================
    // Email OTP Verification Endpoints
    // =====================================

    async sendOTP(email) {
        return this.request('/auth/send-otp', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    }

    async verifyOTP(email, otp) {
        return this.request('/auth/verify-otp', {
            method: 'POST',
            body: JSON.stringify({ email, otp })
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
    // Borrow request endpoint (aligned to backend contract)
    async createBorrowRequest(payload) {
        return this.request('/transactions/request', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

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
        return this.request('/stats/platform', { silent401: true });
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

    async forgotPassword(email) {
        return this.request('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    }

    async resetPassword(email, token, newPassword) {
        return this.request('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ email, token, newPassword })
        });
    }

    // --- Advanced book search ---
    async searchBooks(filters = {}) {
        const query = new URLSearchParams(filters).toString();
        return this.request(`/books/search?${query}`, { method: "GET" });
    }

    async getBookSuggestions(query) {
        if (!query || query.trim().length < 2) return { suggestions: [] };
        const encodedQuery = encodeURIComponent(query);
        return this.request(`/books/autocomplete?q=${encodedQuery}`, { method: "GET" });
    }


    // --- Save user’s search locally ---
    saveSearch(filters) {
        const searches = JSON.parse(localStorage.getItem("savedSearches") || "[]");
        searches.unshift(filters);
        localStorage.setItem("savedSearches", JSON.stringify(searches.slice(0, 5)));
    }

    getSavedSearches() {
        return JSON.parse(localStorage.getItem("savedSearches") || "[]");
    }

    // ========================================
    // SAVED SEARCHES API METHODS
    // ========================================

    async getSavedSearches() {
        return this.request('/books/saved-searches', {
            method: 'GET'
        });
    }

    async saveSearch(searchName, searchCriteria) {
        return this.request('/books/saved-searches', {
            method: 'POST',
            body: JSON.stringify({
                search_name: searchName,
                search_criteria: searchCriteria
            })
        });
    }

    async updateSavedSearch(searchId) {
        return this.request(`/books/saved-searches/${searchId}`, {
            method: 'PUT'
        });
    }

    async deleteSavedSearch(searchId) {
        return this.request(`/books/saved-searches/${searchId}`, {
            method: 'DELETE'
        });
    }

    // ========================================
    // RECENTLY VIEWED API METHODS
    // ========================================

    async trackBookView(bookId) {
        return this.request(`/books/${bookId}/view`, {
            method: 'POST'
        });
    }

    async getRecentlyViewed(limit = 10) {
        return this.request(`/books/recently-viewed?limit=${limit}`, {
            method: 'GET'
        });
    }

    // ========================================
    // RECOMMENDATIONS API METHODS
    // ========================================

    async getRecommendations(limit = 8) {
        return this.request(`/books/recommendations?limit=${limit}`, {
            method: 'GET'
        });
    }

    async getSimilarBooks(bookId) {
        return this.request(`/books/${bookId}/similar`, {
            method: 'GET'
        });
    }

    // Track book view for recently viewed
    async trackBookView(bookId) {
        return this.request(`/books/${bookId}/view`, {
            method: 'POST'
        });
    }

    // --- Borrowing and Lending History ---
    async getBorrowingHistory() {
        return this.request('/transactions/history/borrowed');
    }

    async getLendingHistory() {
        return this.request('/transactions/history/lent');
    }

    // ========================================
    // TRANSACTION STATUS MANAGEMENT METHODS
    // ========================================

    async approveTransaction(transactionId, data = {}) {
        return this.request(`/transactions/${transactionId}/approve`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async rejectTransaction(transactionId, rejectionReason) {
        return this.request(`/transactions/${transactionId}/reject`, {
            method: 'PUT',
            body: JSON.stringify({ rejection_reason: rejectionReason })
        });
    }

    async markAsBorrowed(transactionId, notes = '') {
        return this.request(`/transactions/${transactionId}/borrowed`, {
            method: 'PUT',
            body: JSON.stringify({ lender_notes: notes })
        });
    }

    async markAsReturned(transactionId, returnData) {
        return this.request(`/transactions/${transactionId}/return`, {
            method: 'PUT',
            body: JSON.stringify(returnData)
        });
    }


    async completeTransaction(transactionId) {
        return this.request(`/transactions/${transactionId}/complete`, {
            method: 'PUT'
        });
    }

    async cancelTransaction(transactionId, reason) {
        return this.request(`/transactions/${transactionId}/cancel`, {
            method: 'PUT',
            body: JSON.stringify({ cancellation_reason: reason })
        });
    }

    // ============================================
    // FEEDBACK & DISPUTES API METHODS
    // ============================================

    // Submit feedback for a transaction
    async submitFeedback(transactionId, feedbackData) {
        return this.request(`/feedback`, {
            method: 'POST',
            body: JSON.stringify({
                transaction_id: transactionId,
                rating: feedbackData.rating,
                comment: feedbackData.comment,
                book_condition_rating: feedbackData.book_condition_rating,
                return_timeliness: feedbackData.return_timeliness
            })
        });
    }

    // Get feedback for a transaction
    async getTransactionFeedback(transactionId) {
        return this.request(`/feedback/transaction/${transactionId}`);
    }

    // Get feedback received by user
    async getUserFeedback(userId) {
        return this.request(`/feedback/${userId}`);
    }

    // File a dispute
    async fileDispute(feedbackId, reason, description) {
        return this.request(`/disputes`, {  // But this SHOULD work if backend exists
            method: 'POST',
            body: JSON.stringify({
                feedback_id: feedbackId,
                reason: reason,
                description: description
            })
        });
    }


    // Get user's disputes
    async getMyDisputes() {
        return this.request(`/disputes/my`);
    }

    // Get dispute details
    async getDisputeDetails(disputeId) {
        return this.request(`/disputes/${disputeId}`);
    }

    // Get all notifications for current user
    async getNotifications(unreadOnly = false, limit = 20, offset = 0) {
        return this.request(`/notifications?unreadOnly=${unreadOnly}&limit=${limit}&offset=${offset}`);
    }

    // Mark a single notification as read
    async markNotificationAsRead(notificationId) {
        return this.request(`/notifications/${notificationId}/read`, {
            method: 'PUT'
        });
    }

    // Mark all notifications as read
    async markAllNotificationsAsRead() {
        return this.request(`/notifications/mark-all-read`, {
            method: 'PUT'
        });
    }

    // Delete a notification
    async deleteNotification(notificationId) {
        return this.request(`/notifications/${notificationId}`, {
            method: 'DELETE'
        });
    }


}

// Create global API instance
const api = new ApiClient();
