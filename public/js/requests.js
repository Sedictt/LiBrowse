// PLV BookSwap - Request Management
class RequestManager {
    constructor() {
        this.currentTab = 'incoming';
        this.currentRequests = [];
        this.currentChats = [];
        this.selectedRequests = new Set();
        this.filters = {
            status: '',
            dateFrom: '',
            dateTo: '',
            bookTitle: '',
            borrowerName: ''
        };
        this.init();
    }

    init() {
        console.log('RequestManager initialized');
        this.setupEventListeners();
        // Don't load requests on init - wait for section to be navigated to
        // this.loadRequests();
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

        // Filter inputs
        const filterInputs = document.querySelectorAll('.filter-input');
        filterInputs.forEach(input => {
            input.addEventListener('input', () => this.applyFilters());
        });

        // Bulk action buttons
        const bulkApproveBtn = document.getElementById('bulk-approve-btn');
        if (bulkApproveBtn) {
            bulkApproveBtn.addEventListener('click', () => this.bulkApprove());
        }

        const bulkRejectBtn = document.getElementById('bulk-reject-btn');
        if (bulkRejectBtn) {
            bulkRejectBtn.addEventListener('click', () => this.bulkReject());
        }

        // Select all checkbox
        const selectAllCheckbox = document.getElementById('select-all-requests');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
        }

        // Note: Chat-related event listeners are set up when chat modal is opened
        // since those elements are dynamically created
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

        // Show/hide filter bar based on tab
        const filterBar = document.getElementById('requests-filter-bar');
        if (filterBar) {
            filterBar.style.display = tab === 'incoming' ? 'block' : 'none';
        }

        this.currentTab = tab;
        this.selectedRequests.clear();

        // Set default filter to "pending" for incoming requests tab
        if (tab === 'incoming') {
            const statusFilter = document.getElementById('filter-status');
            if (statusFilter && !this.filters.status) {
                statusFilter.value = 'pending';
                this.filters.status = 'pending';
            }
        }

        this.loadRequests();
    }

    async loadRequests() {
        try {
            // Check if user is authenticated
            if (!authManager.currentUser) {
                console.log('User not authenticated, skipping requests load');
                return;
            }

            console.log('Loading requests for tab:', this.currentTab);

            if (this.currentTab === 'incoming' || this.currentTab === 'outgoing') {
                // Backend returns { transactions: [...] }
                const data = await api.getTransactions();
                const list = Array.isArray(data?.transactions) ? data.transactions : (Array.isArray(data) ? data : []);
                console.log('Transactions array:', list);
                console.log('Total transactions:', list.length);
                console.log('Current user ID:', authManager.currentUser.id);

                const transactions = list.filter(t => {
                    if (this.currentTab === 'incoming') {
                        // Show all incoming requests (where user is lender)
                        // Status filtering is handled by the status filter dropdown
                        const isLender = t.lender_id === authManager.currentUser.id;
                        console.log(`Transaction ${t.id}: lender_id=${t.lender_id}, status=${t.status}, isLender=${isLender}`);
                        return isLender;
                    } else {
                        // Show all outgoing requests (where user is borrower)
                        return t.borrower_id === authManager.currentUser.id;
                    }
                });

                console.log(`Filtered ${transactions.length} ${this.currentTab} requests`);
                this.currentRequests = transactions;
                this.renderRequests();
            } else if (this.currentTab === 'active-chats') {
                try {
                    const chats = await api.get(`/chats?_=${Date.now()}`);
                    this.currentChats = chats || [];
                    this.renderChats();
                } catch (chatError) {
                    console.error('Failed to load chats:', chatError);
                    this.currentChats = [];
                    this.renderChats();
                }
            }
        } catch (error) {
            console.error('Failed to load requests:', error);
            this.showToast('Failed to load requests', 'error');
        }
    }

    async refreshActiveChats() {
        try {
            if (!authManager || !authManager.isAuthenticated) return;
            const chats = await api.get(`/chats?_=${Date.now()}`);
            this.currentChats = chats || [];
            this.renderChats();
        } catch (error) {
            console.error('Failed to refresh active chats:', error);
        }
    }

    applyFilters() {
        // Get filter values
        this.filters.status = document.getElementById('filter-status')?.value || '';
        this.filters.dateFrom = document.getElementById('filter-date-from')?.value || '';
        this.filters.dateTo = document.getElementById('filter-date-to')?.value || '';
        this.filters.bookTitle = document.getElementById('filter-book-title')?.value.toLowerCase() || '';
        this.filters.borrowerName = document.getElementById('filter-borrower-name')?.value.toLowerCase() || '';

        this.renderRequests();
    }

    clearFilters() {
        // Reset all filters
        this.filters = {
            status: 'pending', // Default to pending for incoming requests
            dateFrom: '',
            dateTo: '',
            bookTitle: '',
            borrowerName: ''
        };

        // Reset filter inputs
        const statusFilter = document.getElementById('filter-status');
        const dateFromFilter = document.getElementById('filter-date-from');
        const dateToFilter = document.getElementById('filter-date-to');
        const bookTitleFilter = document.getElementById('filter-book-title');
        const borrowerNameFilter = document.getElementById('filter-borrower-name');

        if (statusFilter) statusFilter.value = 'pending';
        if (dateFromFilter) dateFromFilter.value = '';
        if (dateToFilter) dateToFilter.value = '';
        if (bookTitleFilter) bookTitleFilter.value = '';
        if (borrowerNameFilter) borrowerNameFilter.value = '';

        this.renderRequests();
    }

    getFilteredRequests() {
        return this.currentRequests.filter(request => {
            // Status filter
            if (this.filters.status && request.status !== this.filters.status) {
                return false;
            }

            // Date range filter
            if (this.filters.dateFrom) {
                const requestDate = new Date(request.date_req);
                const filterDate = new Date(this.filters.dateFrom);
                if (requestDate < filterDate) return false;
            }

            if (this.filters.dateTo) {
                const requestDate = new Date(request.date_req);
                const filterDate = new Date(this.filters.dateTo);
                if (requestDate > filterDate) return false;
            }

            // Book title filter
            if (this.filters.bookTitle && !request.book_title.toLowerCase().includes(this.filters.bookTitle)) {
                return false;
            }

            // Borrower name filter
            if (this.filters.borrowerName && !request.borrower_name.toLowerCase().includes(this.filters.borrowerName)) {
                return false;
            }

            return true;
        });
    }

    renderRequests() {
        console.log('=== RENDER REQUESTS ===');
        console.log('Current tab:', this.currentTab);
        console.log('Current requests array:', this.currentRequests);
        console.log('Current requests length:', this.currentRequests.length);

        const container = document.getElementById(`${this.currentTab}-requests`);
        console.log('Container ID:', `${this.currentTab}-requests`);
        console.log('Container element:', container);

        if (!container) {
            console.error('❌ Container not found for tab:', this.currentTab);
            return;
        }

        const filteredRequests = this.getFilteredRequests();
        console.log('Filtered requests count:', filteredRequests.length);
        console.log('Filtered requests:', filteredRequests);

        if (filteredRequests.length === 0) {
            // Dynamic empty state based on active filters
            let emptyStateContent;

            if (this.currentTab === 'incoming') {
                // Check if filters are active
                const hasActiveFilters = this.filters.status || this.filters.bookTitle ||
                                        this.filters.borrowerName || this.filters.dateFrom || this.filters.dateTo;

                if (hasActiveFilters) {
                    const statusText = this.filters.status ? ` with status "${this.filters.status}"` : '';
                    emptyStateContent = {
                        icon: 'fas fa-filter',
                        title: 'No Matching Requests',
                        message: `No incoming requests found${statusText}. Try adjusting your filters.`,
                        action: '<button class="btn btn-outline" onclick="requestManager.clearFilters()">Clear Filters</button>'
                    };
                } else {
                    emptyStateContent = {
                        icon: 'fas fa-inbox',
                        title: 'No Incoming Requests',
                        message: 'When someone wants to borrow your books, their requests will appear here.',
                        action: '<button class="btn" onclick="app.navigateToSection(\'books\')">View My Books</button>'
                    };
                }
            } else {
                emptyStateContent = {
                    icon: 'fas fa-paper-plane',
                    title: 'No Outgoing Requests',
                    message: 'Browse available books and send borrow requests to get started.',
                    action: '<button class="btn" onclick="app.navigateToSection(\'books\')">Browse Books</button>'
                };
            }

            console.log('Rendering empty state');
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

        // Show bulk actions for incoming requests
        const bulkActionsHtml = this.currentTab === 'incoming' ? `
            <div class="bulk-actions-bar">
                <div class="bulk-select">
                    <input type="checkbox" id="select-all-requests" ${this.selectedRequests.size === filteredRequests.length ? 'checked' : ''}>
                    <label for="select-all-requests">Select All</label>
                    <span class="selected-count">${this.selectedRequests.size} selected</span>
                </div>
                <div class="bulk-buttons">
                    <button class="btn btn-success btn-sm" id="bulk-approve-btn" ${this.selectedRequests.size === 0 ? 'disabled' : ''}>
                        <i class="fas fa-check"></i> Approve Selected (${this.selectedRequests.size})
                    </button>
                    <button class="btn btn-error btn-sm" id="bulk-reject-btn" ${this.selectedRequests.size === 0 ? 'disabled' : ''}>
                        <i class="fas fa-times"></i> Reject Selected (${this.selectedRequests.size})
                    </button>
                </div>
            </div>
        ` : '';

        console.log('Creating request cards...');
        try {
            const requestCards = filteredRequests.map((request, index) => {
                console.log(`Creating card ${index + 1} for request:`, request);
                const card = this.createRequestCard(request);
                console.log(`Card ${index + 1} HTML length:`, card.length);
                return card;
            }).join('');

            console.log('Total HTML length:', requestCards.length);
            console.log('Setting container innerHTML...');
            container.innerHTML = bulkActionsHtml + requestCards;
            console.log('✅ Container innerHTML set successfully');
        } catch (error) {
            console.error('❌ Error creating request cards:', error);
            console.error('Error stack:', error.stack);
        }

        // Re-attach event listeners for bulk actions
        if (this.currentTab === 'incoming') {
            const selectAllCheckbox = document.getElementById('select-all-requests');
            if (selectAllCheckbox) {
                selectAllCheckbox.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
            }

            const bulkApproveBtn = document.getElementById('bulk-approve-btn');
            if (bulkApproveBtn) {
                bulkApproveBtn.addEventListener('click', () => this.bulkApprove());
            }

            const bulkRejectBtn = document.getElementById('bulk-reject-btn');
            if (bulkRejectBtn) {
                bulkRejectBtn.addEventListener('click', () => this.bulkReject());
            }

            // Attach checkbox listeners
            document.querySelectorAll('.request-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', (e) => {
                    const requestId = parseInt(e.target.dataset.requestId);
                    if (e.target.checked) {
                        this.selectedRequests.add(requestId);
                    } else {
                        this.selectedRequests.delete(requestId);
                    }
                    this.updateBulkActionButtons();
                });
            });
        }

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

    toggleSelectAll(checked) {
        this.selectedRequests.clear();
        if (checked) {
            const filteredRequests = this.getFilteredRequests();
            filteredRequests.forEach(request => {
                this.selectedRequests.add(request.id);
            });
        }
        this.renderRequests();
    }

    updateBulkActionButtons() {
        const bulkApproveBtn = document.getElementById('bulk-approve-btn');
        const bulkRejectBtn = document.getElementById('bulk-reject-btn');
        const selectedCount = document.querySelector('.selected-count');

        if (bulkApproveBtn) bulkApproveBtn.disabled = this.selectedRequests.size === 0;
        if (bulkRejectBtn) bulkRejectBtn.disabled = this.selectedRequests.size === 0;
        if (selectedCount) selectedCount.textContent = `${this.selectedRequests.size} selected`;

        // Update button text
        if (bulkApproveBtn) {
            bulkApproveBtn.innerHTML = `<i class="fas fa-check"></i> Approve Selected (${this.selectedRequests.size})`;
        }
        if (bulkRejectBtn) {
            bulkRejectBtn.innerHTML = `<i class="fas fa-times"></i> Reject Selected (${this.selectedRequests.size})`;
        }
    }

    createRequestCard(request) {
        const isIncoming = this.currentTab === 'incoming';
        const userInfo = isIncoming ?
            { name: request.borrower_name, id: request.borrower_id, verified: request.borrower_verified, credits: request.borrower_credits, rating: request.borrower_rating, transactions: request.borrower_completed_transactions } :
            { name: request.lender_name, id: request.lender_id, verified: request.lender_verified, credits: request.lender_credits };

        // Generate borrower badges
        const badges = this.getBorrowerBadges(userInfo);

        // Checkbox for incoming requests
        const checkboxHtml = isIncoming && request.status === 'waiting' ? `
            <div class="request-select">
                <input type="checkbox" class="request-checkbox" data-request-id="${request.id}" ${this.selectedRequests.has(request.id) ? 'checked' : ''}>
            </div>
        ` : '';

        return `
            <div class="request-card ${this.selectedRequests.has(request.id) ? 'selected' : ''}" data-request-id="${request.id}">
                ${checkboxHtml}
                <div class="request-content">
                    <div class="request-header">
                        <div class="request-info">
                            <h4>${this.escapeHtml(request.book_title)}</h4>
                            <div class="request-user-info">
                                <p>${isIncoming ? 'Request from' : 'Request to'} <strong>${this.escapeHtml(userInfo.name)}</strong></p>
                                <div class="user-badges">
                                    ${badges}
                                </div>
                            </div>
                        </div>
                        <div class="request-status ${request.status}">
                            ${this.getStatusIcon(request.status)}
                            ${this.formatStatus(request.status)}
                        </div>
                    </div>

                    <div class="request-details">
                        <div class="detail-row">
                            <span class="detail-label"><i class="fas fa-calendar"></i> Requested:</span>
                            <span class="detail-value">${this.formatDate(request.request_date)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label"><i class="fas fa-calendar-check"></i> Return Date:</span>
                            <span class="detail-value">${this.formatDate(request.expected_return_date)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label"><i class="fas fa-clock"></i> Duration:</span>
                            <span class="detail-value">${request.borrow_duration || 'Not specified'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label"><i class="fas fa-map-marker-alt"></i> Pickup Method:</span>
                            <span class="detail-value">${this.formatPickupMethod(request.pickup_method)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label"><i class="fas fa-location-dot"></i> Meeting Location:</span>
                            <span class="detail-value">${this.escapeHtml(request.pickup_location) || 'Not specified'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label"><i class="fas fa-phone"></i> Contact:</span>
                            <span class="detail-value">${this.escapeHtml(request.borrower_contact)}</span>
                        </div>
                    </div>

                    ${request.request_message ? `
                        <div class="request-message">
                            <i class="fas fa-comment"></i>
                            <p>"${this.escapeHtml(request.request_message)}"</p>
                        </div>
                    ` : ''}

                    <div class="request-actions">
                        ${this.getRequestActions(request, isIncoming)}
                    </div>
                </div>
            </div>
        `;
    }

    getBorrowerBadges(userInfo) {
        const badges = [];

        // Verified badge
        if (userInfo.verified) {
            badges.push('<span class="badge badge-verified" title="Verified Student"><i class="fas fa-check-circle"></i> Verified</span>');
        }

        // Rating badge
        if (userInfo.rating && userInfo.rating >= 4.0) {
            badges.push(`<span class="badge badge-trusted" title="Highly Rated Borrower"><i class="fas fa-star"></i> ${userInfo.rating.toFixed(1)}</span>`);
        }

        // Experience badge
        if (userInfo.transactions && userInfo.transactions >= 5) {
            badges.push(`<span class="badge badge-experienced" title="Experienced Borrower"><i class="fas fa-book-reader"></i> ${userInfo.transactions} borrows</span>`);
        } else if (userInfo.transactions === 0) {
            badges.push('<span class="badge badge-new" title="New User"><i class="fas fa-user-plus"></i> New User</span>');
        }

        // Credits badge
        if (userInfo.credits && userInfo.credits >= 100) {
            badges.push(`<span class="badge badge-credits" title="High Credits"><i class="fas fa-coins"></i> ${userInfo.credits} credits</span>`);
        }

        return badges.join('');
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
                ${request.rejection_reason ? `<br><small>Reason: ${this.escapeHtml(request.rejection_reason)}</small>` : ''}
            `;
        } else if (request.status === 'cancelled') {
            return `
                <span class="text-muted">Transaction was cancelled</span>
                ${request.rejection_reason ? `<br><small>Reason: ${this.escapeHtml(request.rejection_reason)}</small>` : ''}
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
            this.selectedRequests.delete(requestId);
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
            this.selectedRequests.delete(requestId);
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

    async bulkApprove() {
        if (this.selectedRequests.size === 0) {
            this.showToast('Please select at least one request', 'warning');
            return;
        }

        const confirmed = confirm(`Are you sure you want to approve ${this.selectedRequests.size} request(s)?`);
        if (!confirmed) return;

        try {
            const transaction_ids = Array.from(this.selectedRequests);
            const response = await api.post('/transactions/bulk-approve', { transaction_ids });

            this.showToast(response.message, 'success');
            this.selectedRequests.clear();
            this.loadRequests();

            // Refresh books list
            if (window.booksManager) {
                await window.booksManager.loadBooks(true);
            }
        } catch (error) {
            console.error('Failed to bulk approve:', error);
            this.showToast(error.message || 'Failed to bulk approve requests', 'error');
        }
    }

    async bulkReject() {
        if (this.selectedRequests.size === 0) {
            this.showToast('Please select at least one request', 'warning');
            return;
        }

        const reason = prompt(`Please provide a reason for rejecting ${this.selectedRequests.size} request(s):`);
        if (!reason) return;

        try {
            const transaction_ids = Array.from(this.selectedRequests);
            const response = await api.post('/transactions/bulk-reject', {
                transaction_ids,
                rejection_reason: reason
            });

            this.showToast(response.message, 'success');
            this.selectedRequests.clear();
            this.loadRequests();

            // Refresh books list
            if (window.booksManager) {
                await window.booksManager.loadBooks(true);
            }
        } catch (error) {
            console.error('Failed to bulk reject:', error);
            this.showToast(error.message || 'Failed to bulk reject requests', 'error');
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
        const badge = document.getElementById('chat-count');
        if (badge) badge.textContent = this.currentChats.length;
    }

    createChatCard(chat) {
        // Get initials for avatar
        const initials = chat.other_user_name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);

        // Format time (e.g., "2:30 PM" or "Yesterday")
        const timeFormatted = chat.last_message_time ? this.formatTimeAgo(chat.last_message_time) : '';

        const previewText = this.getChatPreviewText(chat);

        return `
            <div class="chat-card" data-chat-id="${chat.id}" onclick="requestManager.openChatById(${chat.id})">
                <div class="chat-avatar">${initials}</div>
                <div class="chat-header">
                    <div class="chat-content">
                        <h4>${this.escapeHtml(chat.other_user_name)}</h4>
                        <p class="chat-last-message">${this.escapeHtml(previewText)}</p>
                    </div>
                    <div class="chat-meta">
                        ${timeFormatted ? `<span class="chat-time">${timeFormatted}</span>` : ''}
                        ${chat.unread_count > 0 ? `<div class="unread-badge">${chat.unread_count}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // Build a clean, human-friendly preview for the chat list
    getChatPreviewText(chat) {
        try {
            let previewText = chat.last_message || 'No messages yet';
            const type = chat.last_message_type;

            // Photos (single or bundle)
            if (type === 'img' || (typeof previewText === 'string' && previewText.includes('/api/chat-attachments/'))) {
                const count = (previewText || '').split('\n').filter(Boolean).length;
                return count > 1 ? `${count} Photos` : 'Photo';
            }

            // System messages may contain structured JSON payloads
            if (type === 'sys' || (typeof previewText === 'string' && /^\s*[\[{]/.test(previewText))) {
                try {
                    const payload = typeof previewText === 'string' ? JSON.parse(previewText) : previewText;
                    if (payload && typeof payload === 'object' && payload.type) {
                        switch (payload.type) {
                            case 'cancellation_request': {
                                const book = payload.book_title || '';
                                const reason = payload.reason === 'other' ? (payload.reason_details || payload.description || 'Other') : payload.reason;
                                const base = book ? `Cancellation request — "${book}"` : 'Cancellation request';
                                return reason ? `${base} — ${reason}` : base;
                            }
                            case 'cancellation_response': {
                                const book = payload.book_title || '';
                                const statusText = payload.status === 'approved' ? 'Cancellation approved' : 'Cancellation rejected';
                                return book ? `${statusText} — "${book}"` : statusText;
                            }
                            case 'cancellation_auto_approved': {
                                const book = payload.book_title || '';
                                return book ? `Cancellation auto‑approved — "${book}"` : 'Cancellation auto‑approved';
                            }
                            default:
                                return 'System update';
                        }
                    }
                } catch (_) {
                    // Fall through to truncation
                }
            }

            // Text message fallback (truncate)
            if (typeof previewText === 'string') {
                return previewText.length > 140 ? previewText.substring(0, 140) + '…' : previewText;
            }
            return 'Message';
        } catch (_) {
            return 'Message';
        }
    }

    formatTimeAgo(dateString) {
        if (!dateString) return '';
        
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d`;
        
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }


    // Chat modal methods - integrated with ChatManager
    openChatModal(chat) {
        console.log('Opening chat modal for:', chat);

        if (window.chatManager) {
            window.chatManager.openChat(chat.id);
        } else {
            console.error('ChatManager not initialized');
            this.showToast('Chat system not ready. Please refresh the page.', 'error');
        }
    }

    handleSendMessage(e) {
        e.preventDefault();
        console.log('Send message');
        // TODO: Implement message sending
    }

    handleSubmitReport(e) {
        e.preventDefault();
        console.log('Submit report');
        // TODO: Implement report submission
    }

    openReportModal() {
        console.log('Open report modal');
        // TODO: Implement report modal
    }

    openCancelModal() {
        console.log('Open cancel modal');
        // TODO: Implement cancel modal
    }

    handleCancelTransaction(e) {
        e.preventDefault();
        console.log('Cancel transaction');
        // TODO: Implement transaction cancellation
    }

    // Utility methods
    getStatusIcon(status) {
        const icons = {
            'pending': '⏳',
            'approved': '✅',
            'rejected': '❌',
            'cancelled': '🚫',
            'borrowed': '📖',
            'returned': '📚'
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
            'returned': 'Returned'
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
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString();
    }

    formatTime(dateString) {
        if (!dateString) return '';
        return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            console.log(`Toast: ${message} (${type})`);
        }
    }
}

// Initialize request manager when DOM is ready
let requestManager;

document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing RequestManager...');
    requestManager = new RequestManager();
    window.requestManager = requestManager;

    // Show filter bar for incoming tab by default
    const filterBar = document.getElementById('requests-filter-bar');
    if (filterBar) {
        filterBar.style.display = 'block';
    }
});
