// PLV BookSwap - Request Management
class RequestManager {
    constructor() {
        this.currentTab = 'incoming';
        this.currentRequests = [];
        this.currentChats = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadRequests();
    }

    setupEventListeners() {
        // Tab switching
        const tabBtns = document.querySelectorAll('.tab-btn[data-tab]');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Chat form submission
        const chatForm = document.getElementById('chat-form');
        if (chatForm) {
            chatForm.addEventListener('submit', this.handleSendMessage.bind(this));
        }

        // Report form submission
        const reportForm = document.getElementById('report-form');
        if (reportForm) {
            reportForm.addEventListener('submit', this.handleSubmitReport.bind(this));
        }

        // Report button
        const reportBtn = document.getElementById('report-chat-btn');
        if (reportBtn) {
            reportBtn.addEventListener('click', this.openReportModal.bind(this));
        }

        // Cancel transaction button
        const cancelBtn = document.getElementById('cancel-transaction-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', this.openCancelModal.bind(this));
        }

        // Cancel transaction form
        const cancelForm = document.getElementById('cancel-transaction-form');
        if (cancelForm) {
            cancelForm.addEventListener('submit', this.handleCancelTransaction.bind(this));
        }
    }

    switchTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const tabBtn = document.querySelector(`[data-tab="${tab}"]`);
        if (tabBtn) {
            tabBtn.classList.add('active');
        }

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const tabContent = document.getElementById(`${tab}-tab`);
        if (tabContent) {
            tabContent.classList.add('active');
        }

        this.currentTab = tab;
        this.loadRequests();
    }

    async loadRequests() {
        try {
            // Check if user is authenticated
            if (!authManager.currentUser) {
                console.log('User not authenticated, skipping requests load');
                return;
            }

            if (this.currentTab === 'incoming' || this.currentTab === 'outgoing') {
                const response = await api.get('/transactions');
                const transactions = response.filter(t => {
                    if (this.currentTab === 'incoming') {
                        return t.lender_id === authManager.currentUser.id && t.status === 'pending';
                    } else {
                        return t.borrower_id === authManager.currentUser.id;
                    }
                });
                this.currentRequests = transactions;
                this.renderRequests();
            } else if (this.currentTab === 'active-chats') {
                try {
                    const chats = await api.get('/chats');
                    this.currentChats = chats || [];
                    this.renderChats();
                } catch (chatError) {
                    console.error('Failed to load chats:', chatError);
                    this.currentChats = [];
                    this.renderChats();
                    // Don't show error toast for chats, just log it
                }
            }
        } catch (error) {
            console.error('Failed to load requests:', error);
            this.showToast('Failed to load requests', 'error');
        }
    }

    renderRequests() {
        const container = document.getElementById(`${this.currentTab}-requests`);
        if (!container) return;

        if (this.currentRequests.length === 0) {
            const emptyStateContent = this.currentTab === 'incoming' ? {
                icon: 'fas fa-inbox',
                title: 'No Incoming Requests',
                message: 'When someone wants to borrow your books, their requests will appear here.',
                action: '<button class="btn" onclick="app.navigateToSection(\'books\')">View My Books</button>'
            } : {
                icon: 'fas fa-paper-plane',
                title: 'No Outgoing Requests',
                message: 'Browse available books and send borrow requests to get started.',
                action: '<button class="btn" onclick="app.navigateToSection(\'books\')">Browse Books</button>'
            };
            
            container.innerHTML = `
                <div class="no-requests">
                    <i class="${emptyStateContent.icon}"></i>
                    <h3>${emptyStateContent.title}</h3>
                    <p>${emptyStateContent.message}</p>
                    ${emptyStateContent.action}
                </div>
            `;
            return;
        }

        container.innerHTML = this.currentRequests.map(request => this.createRequestCard(request)).join('');
        
        // Update badge count
        if (this.currentTab === 'incoming') {
            const badge = document.getElementById('incoming-count');
            if (badge) badge.textContent = this.currentRequests.length;
            
            // Update navigation badge
            const navBadge = document.getElementById('requests-badge');
            if (navBadge) {
                navBadge.textContent = this.currentRequests.length;
                navBadge.style.display = this.currentRequests.length > 0 ? 'inline' : 'none';
            }
        }
    }

    createRequestCard(request) {
        const isIncoming = this.currentTab === 'incoming';
        const userInfo = isIncoming ? 
            { name: request.borrower_name, id: request.borrower_id } :
            { name: request.lender_name, id: request.lender_id };

        return `
            <div class="request-card" data-request-id="${request.id}">
                <div class="request-header">
                    <div class="request-info">
                        <h4>${request.book_title}</h4>
                        <p>${isIncoming ? 'Request from' : 'Request to'} ${userInfo.name}</p>
                    </div>
                    <div class="request-status ${request.status}">
                        ${this.getStatusIcon(request.status)}
                        ${this.formatStatus(request.status)}
                    </div>
                </div>
                
                <div class="request-details">
                    <div class="detail-row">
                        <span class="detail-label">Requested:</span>
                        <span class="detail-value">${this.formatDate(request.request_date)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Return Date:</span>
                        <span class="detail-value">${this.formatDate(request.expected_return_date)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Duration:</span>
                        <span class="detail-value">${request.borrow_duration || 'Not specified'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Pickup Method:</span>
                        <span class="detail-value">${this.formatPickupMethod(request.pickup_method)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Meeting Location:</span>
                        <span class="detail-value">${request.pickup_location || 'Not specified'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Contact:</span>
                        <span class="detail-value">${request.borrower_contact}</span>
                    </div>
                </div>
                
                ${request.request_message ? `
                    <div class="request-message">
                        "${request.request_message}"
                    </div>
                ` : ''}
                
                <div class="request-actions">
                    ${this.getRequestActions(request, isIncoming)}
                </div>
            </div>
        `;
    }

    getRequestActions(request, isIncoming) {
        if (request.status === 'pending' && isIncoming) {
            return `
                <button class="btn btn-success" onclick="requestManager.approveRequest(${request.id})">
                    <i class="fas fa-check"></i> Approve
                </button>
                <button class="btn btn-error" onclick="requestManager.rejectRequest(${request.id})">
                    <i class="fas fa-times"></i> Reject
                </button>
            `;
        } else if (request.status === 'approved') {
            return `
                <button class="btn btn-primary" onclick="requestManager.openChatByTransaction(${request.id})">
                    <i class="fas fa-comments"></i> Open Chat
                </button>
                <small class="text-muted">Chat with ${isIncoming ? 'borrower' : 'lender'} to discuss pickup details</small>
            `;
        } else if (request.status === 'rejected') {
            return `
                <span class="text-muted">Request was rejected</span>
                ${request.rejection_reason ? `<br><small>Reason: ${request.rejection_reason}</small>` : ''}
            `;
        } else if (request.status === 'cancelled') {
            return `
                <span class="text-muted">Transaction was cancelled</span>
                ${request.rejection_reason ? `<br><small>Reason: ${request.rejection_reason}</small>` : ''}
            `;
        }
        return '';
    }

    async approveRequest(requestId) {
        try {
            await api.put(`/transactions/${requestId}/approve`, {
                lender_notes: null,
                pickup_location: null
            });
            
            this.showToast('Request approved! You can now chat with the borrower to discuss details.', 'success');
            this.loadRequests();
            
            // Refresh books list to update availability status
            if (window.booksManager) {
                await window.booksManager.loadBooks(true);
            }
            
            // Switch to active chats tab to show the new chat
            setTimeout(() => {
                this.switchTab('active-chats');
            }, 1000);
        } catch (error) {
            console.error('Failed to approve request:', error);
            this.showToast(error.message || 'Failed to approve request', 'error');
        }
    }

    async rejectRequest(requestId) {
        try {
            const reason = prompt('Please provide a reason for rejection:');
            if (!reason) return;
            
            await api.put(`/transactions/${requestId}/reject`, {
                rejection_reason: reason
            });
            
            this.showToast('Request rejected', 'info');
            this.loadRequests();
            
            // Refresh books list to update availability status (book becomes available again)
            if (window.booksManager) {
                await window.booksManager.loadBooks(true);
            }
        } catch (error) {
            console.error('Failed to reject request:', error);
            this.showToast(error.message || 'Failed to reject request', 'error');
        }
    }

    async openChat(transactionId) {
        try {
            // Reload chats to get the latest data
            await this.loadRequests();
            
            // Find the chat for this transaction
            const chats = await api.get('/chats');
            const chat = chats.find(c => c.transaction_id === transactionId);
            
            if (!chat) {
                this.showToast('Chat is being created. Please wait a moment and try again.', 'warning');
                return;
            }
            
            this.openChatModal(chat);
        } catch (error) {
            console.error('Failed to open chat:', error);
            this.showToast('Failed to open chat', 'error');
        }
    }

    // Alias method for opening chat by transaction ID
    async openChatByTransaction(transactionId) {
        return this.openChat(transactionId);
    }

    // Open chat by chat ID (for chat cards)
    async openChatById(chatId) {
        try {
            const chat = this.currentChats.find(c => c.id === chatId);
            if (!chat) {
                this.showToast('Chat not found', 'error');
                return;
            }
            
            this.openChatModal(chat);
        } catch (error) {
            console.error('Failed to open chat:', error);
            this.showToast('Failed to open chat', 'error');
        }
    }

    renderChats() {
        const container = document.getElementById('active-chats');
        if (!container) return;

        if (this.currentChats.length === 0) {
            container.innerHTML = `
                <div class="no-chats">
                    <i class="fas fa-comments"></i>
                    <h3>No Active Chats</h3>
                    <p>When transactions are approved, you can chat here to discuss pickup details, terms, and conditions with the other party.</p>
                    <button class="btn" onclick="app.navigateToSection('books')">Browse Books</button>
                </div>
            `;
            return;
        }

        container.innerHTML = this.currentChats.map(chat => this.createChatCard(chat)).join('');
        
        // Update badge count
        const totalUnread = this.currentChats.reduce((sum, chat) => sum + (chat.unread_count || 0), 0);
        const badge = document.getElementById('chat-count');
        if (badge) badge.textContent = totalUnread;
    }

    createChatCard(chat) {
        return `
            <div class="chat-card" data-chat-id="${chat.id}" onclick="requestManager.openChatById(${chat.id})">
                <div class="chat-header">
                    <div class="chat-info">
                        <h4>${chat.other_user_name}</h4>
                        <p>About: ${chat.book_title}</p>
                    </div>
                    ${chat.unread_count > 0 ? `<div class="unread-badge">${chat.unread_count}</div>` : ''}
                </div>
                <div class="chat-preview">
                    <p>${chat.last_message || 'No messages yet'}</p>
                    <small>${chat.last_message_time ? this.formatDate(chat.last_message_time) : ''}</small>
                </div>
            </div>
        `;
    }

    async openChatModal(chat) {
        try {
            // Populate chat header
            const chatTitle = document.getElementById('chat-title');
            const chatBookInfo = document.getElementById('chat-book-info');
            const chatIdInput = document.getElementById('chat-id');
            
            if (chatTitle) chatTitle.textContent = `Chat with ${chat.other_user_name}`;
            if (chatBookInfo) chatBookInfo.textContent = `About: ${chat.book_title}`;
            if (chatIdInput) chatIdInput.value = chat.id;
            
            // Store chat info for reporting
            this.currentChatInfo = chat;
            
            // Load messages
            await this.loadChatMessages(chat.id);
            
            // Open modal
            const modal = document.getElementById('chat-modal');
            if (modal) {
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
                
                // Focus on input after a short delay
                setTimeout(() => {
                    const messageInput = document.getElementById('chat-message-input');
                    if (messageInput) messageInput.focus();
                }, 100);
            }
        } catch (error) {
            console.error('Failed to open chat:', error);
            this.showToast('Failed to open chat', 'error');
        }
    }

    async loadChatMessages(chatId) {
        try {
            const messages = await api.get(`/chats/${chatId}/messages`);
            this.renderChatMessages(messages);
        } catch (error) {
            console.error('Failed to load messages:', error);
            this.showToast('Failed to load messages', 'error');
        }
    }

    renderChatMessages(messages) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        container.innerHTML = messages.map(message => this.createMessageElement(message)).join('');
        container.scrollTop = container.scrollHeight;
    }

    createMessageElement(message) {
        const isOwn = message.sender_id === authManager.currentUser.id;
        const messageClass = message.message_type === 'system' ? 'system' : (isOwn ? 'own' : 'other');
        
        return `
            <div class="chat-message ${messageClass}">
                <div class="message-bubble">
                    ${message.message}
                    <div class="message-time">${this.formatTime(message.created_at)}</div>
                </div>
            </div>
        `;
    }

    async handleSendMessage(e) {
        e.preventDefault();
        
        const chatId = document.getElementById('chat-id').value;
        const messageInput = document.getElementById('chat-message-input');
        const message = messageInput.value.trim();
        
        if (!message) return;
        
        try {
            const newMessage = await api.post(`/chats/${chatId}/messages`, { message });
            
            // Add message to chat
            const container = document.getElementById('chat-messages');
            container.innerHTML += this.createMessageElement(newMessage);
            container.scrollTop = container.scrollHeight;
            
            // Clear input
            messageInput.value = '';
        } catch (error) {
            console.error('Failed to send message:', error);
            this.showToast('Failed to send message', 'error');
        }
    }

    openReportModal() {
        if (!this.currentChatInfo) return;
        
        document.getElementById('report-chat-id').value = this.currentChatInfo.id;
        document.getElementById('report-user-id').value = this.currentChatInfo.other_user_id;
        
        const reportModal = document.getElementById('report-modal');
        reportModal.classList.add('active');
    }

    openCancelModal() {
        if (!this.currentChatInfo) return;
        
        document.getElementById('cancel-transaction-id').value = this.currentChatInfo.transaction_id;
        
        const cancelModal = document.getElementById('cancel-transaction-modal');
        cancelModal.classList.add('active');
    }

    async handleCancelTransaction(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const transactionId = formData.get('transaction_id');
        const cancellationReason = formData.get('cancellation_reason');
        
        if (cancellationReason.length < 10) {
            this.showToast('Please provide a detailed reason (minimum 10 characters)', 'error');
            return;
        }
        
        try {
            const response = await api.put(`/transactions/${transactionId}/cancel`, {
                cancellation_reason: cancellationReason
            });
            
            // Close modals
            document.getElementById('cancel-transaction-modal').classList.remove('active');
            document.getElementById('chat-modal').classList.remove('active');
            document.body.style.overflow = '';
            
            // Reset form
            e.target.reset();
            
            // Show success message
            this.showToast(`Transaction cancelled successfully. ${response.other_party} has been notified.`, 'success');
            
            // Reload requests to update the UI
            this.loadRequests();
            
            // Refresh books list to update availability status (book becomes available again)
            if (window.booksManager) {
                await window.booksManager.loadBooks(true);
            }
            
        } catch (error) {
            console.error('Failed to cancel transaction:', error);
            this.showToast(error.message || 'Failed to cancel transaction', 'error');
        }
    }

    async handleSubmitReport(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const reportData = {
            reported_user_id: parseInt(formData.get('reported_user_id')),
            reason: formData.get('reason'),
            description: formData.get('description')
        };
        
        const chatId = formData.get('chat_id');
        
        try {
            await api.post(`/chats/${chatId}/report`, reportData);
            
            // Close modals
            document.getElementById('report-modal').classList.remove('active');
            document.getElementById('chat-modal').classList.remove('active');
            document.body.style.overflow = '';
            
            // Reset form
            e.target.reset();
            
            this.showToast('Report submitted successfully', 'success');
        } catch (error) {
            console.error('Failed to submit report:', error);
            this.showToast(error.message || 'Failed to submit report', 'error');
        }
    }

    // Utility methods
    getStatusIcon(status) {
        const icons = {
            'pending': '⏳',
            'approved': '✅',
            'rejected': '❌',
            'cancelled': '🚫',
            'borrowed': '📖',
            'returned': '📚',
            'completed': '🎉'
        };
        return icons[status] || '📋';
    }

    formatStatus(status) {
        const statuses = {
            'pending': 'Pending',
            'approved': 'Approved',
            'rejected': 'Rejected',
            'cancelled': 'Cancelled',
            'borrowed': 'Borrowed',
            'returned': 'Returned',
            'completed': 'Completed'
        };
        return statuses[status] || status;
    }

    formatPickupMethod(method) {
        const methods = {
            'pickup': 'Pickup from lender',
            'meetup': 'Meet at location',
            'delivery': 'Delivery'
        };
        return methods[method] || method;
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString();
    }

    formatTime(dateString) {
        return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            console.log(`Toast: ${message} (${type})`);
        }
    }
}

// Initialize request manager
const requestManager = new RequestManager();

// Global access
window.requestManager = requestManager;
