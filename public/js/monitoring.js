// PLV BookSwap - Book Monitoring System
class MonitoringManager {
    constructor() {
        this.currentTab = 'active';
        this.transactions = [];
        this.refreshInterval = null;
        this.refreshRate = 30000; // 30 seconds
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadTransactions();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        // Tab switching
        const tabBtns = document.querySelectorAll('.monitoring-tabs .tab-btn[data-tab]');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Status update form
        const statusForm = document.getElementById('status-update-form');
        if (statusForm) {
            statusForm.addEventListener('submit', this.handleStatusUpdate.bind(this));
        }

        // Feedback form
        const feedbackForm = document.getElementById('feedback-form');
        if (feedbackForm) {
            feedbackForm.addEventListener('submit', this.handleFeedbackSubmit.bind(this));
        }

        // Star rating
        const stars = document.querySelectorAll('#feedback-stars .fas');
        stars.forEach(star => {
            star.addEventListener('click', this.handleStarClick.bind(this));
            star.addEventListener('mouseover', this.handleStarHover.bind(this));
        });

        // Reset star hover
        const starsContainer = document.getElementById('feedback-stars');
        if (starsContainer) {
            starsContainer.addEventListener('mouseleave', this.resetStarHover.bind(this));
        }

        // Manual refresh button
        const refreshBtn = document.getElementById('refresh-transactions');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.manualRefresh();
            });
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this.stopAutoRefresh();
        });
    }

    switchTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.monitoring-tabs .tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.monitoring-content .tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tab}-tab`).classList.add('active');

        this.currentTab = tab;
        this.renderTransactions();
    }

    async loadTransactions(silent = false) {
        try {
            const response = await api.get('/transactions');
            this.transactions = response || [];
            
            // Update all tabs to ensure consistency across the monitoring dashboard
            this.renderAllTabs();
            
            this.updateBadgeCounts();
            
            // Update last refresh time
            this.updateLastRefreshTime();
        } catch (error) {
            console.error('Failed to load transactions:', error);
            if (!silent) {
                this.showToast('Failed to load transactions', 'error');
            }
        }
    }

    startAutoRefresh() {
        // Clear any existing interval
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        // Start new interval
        this.refreshInterval = setInterval(() => {
            // Only refresh if the monitoring section is visible
            const monitoringSection = document.getElementById('monitoring-section');
            if (monitoringSection && monitoringSection.classList.contains('active')) {
                this.loadTransactions(true); // Silent refresh
            }
        }, this.refreshRate);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    updateLastRefreshTime() {
        const refreshIndicator = document.getElementById('last-refresh-time');
        if (refreshIndicator) {
            const now = new Date();
            const timeString = now.toLocaleTimeString();
            refreshIndicator.textContent = `Last updated: ${timeString}`;
        }
    }

    async manualRefresh() {
        const refreshBtn = document.getElementById('refresh-transactions');
        const refreshIcon = refreshBtn?.querySelector('i');
        
        // Show loading state
        if (refreshIcon) {
            refreshIcon.classList.add('fa-spin');
        }
        if (refreshBtn) {
            refreshBtn.disabled = true;
        }

        try {
            await this.loadTransactions();
            this.showToast('Transactions refreshed successfully!', 'success');
        } catch (error) {
            this.showToast('Failed to refresh transactions', 'error');
        } finally {
            // Remove loading state
            if (refreshIcon) {
                refreshIcon.classList.remove('fa-spin');
            }
            if (refreshBtn) {
                refreshBtn.disabled = false;
            }
        }
    }

    renderTransactions() {
        // Render current active tab
        this.renderTabContent(this.currentTab);
    }

    renderAllTabs() {
        // Render all tabs to ensure they're up to date
        const tabs = ['active', 'pending-feedback', 'completed', 'overdue'];
        tabs.forEach(tab => {
            this.renderTabContent(tab);
        });
    }

    renderTabContent(tab) {
        const container = document.getElementById(`${tab}-transactions`);
        if (!container) return;

        const filteredTransactions = this.filterTransactionsByTab(tab);
        
        if (filteredTransactions.length === 0) {
            container.innerHTML = this.getEmptyState(tab);
            return;
        }

        container.innerHTML = filteredTransactions.map(transaction => 
            this.createTransactionCard(transaction)
        ).join('');
    }

    filterTransactionsByTab(tab = null) {
        const userId = authManager.currentUser?.id;
        if (!userId) return [];

        const now = new Date();
        const targetTab = tab || this.currentTab;
        
        switch (targetTab) {
            case 'active':
                return this.transactions.filter(t => 
                    (t.borrower_id === userId || t.lender_id === userId) &&
                    ['approved', 'borrowed'].includes(t.status)
                );
            
            case 'pending-feedback':
                return this.transactions.filter(t => {
                    if (t.status !== 'returned') return false;
                    
                    // Check if user needs to give feedback
                    const isBorrower = t.borrower_id === userId;
                    const isLender = t.lender_id === userId;
                    
                    if (isBorrower && t.borrower_feedback_given === 0) return true;
                    if (isLender && t.lender_feedback_given === 0) return true;
                    
                    return false;
                });
            
            case 'completed':
                return this.transactions.filter(t => 
                    (t.borrower_id === userId || t.lender_id === userId) &&
                    t.status === 'completed'
                );
            
            case 'overdue':
                return this.transactions.filter(t => {
                    if (!['borrowed'].includes(t.status)) return false;
                    if (t.borrower_id !== userId && t.lender_id !== userId) return false;
                    
                    const returnDate = new Date(t.expected_return_date);
                    return now > returnDate;
                });
            
            default:
                return [];
        }
    }

    createTransactionCard(transaction) {
        const userId = authManager.currentUser?.id;
        const isLender = transaction.lender_id === userId;
        const isBorrower = transaction.borrower_id === userId;
        const userRole = isLender ? 'lender' : 'borrower';
        const otherUser = isLender ? transaction.borrower_name : transaction.lender_name;
        
        const statusInfo = this.getStatusInfo(transaction);
        const timeInfo = this.getTimeInfo(transaction);
        const actions = this.getTransactionActions(transaction, userRole);

        return `
            <div class="transaction-card ${statusInfo.class}" data-transaction-id="${transaction.id}">
                <div class="transaction-header">
                    <div class="transaction-book">
                        <img src="${transaction.book_cover || './images/book-placeholder.svg'}" 
                             alt="${transaction.book_title}" class="book-thumbnail">
                        <div class="book-info">
                            <h4>${transaction.book_title}</h4>
                            <p>by ${transaction.book_author}</p>
                            <span class="transaction-role">${userRole === 'lender' ? 'Lending to' : 'Borrowing from'} ${otherUser}</span>
                        </div>
                    </div>
                    <div class="transaction-status">
                        <div class="status-badge ${statusInfo.class}">
                            <i class="${statusInfo.icon}"></i>
                            ${statusInfo.text}
                        </div>
                        ${timeInfo.badge ? `<div class="time-badge ${timeInfo.class}">${timeInfo.badge}</div>` : ''}
                    </div>
                </div>

                <div class="transaction-timeline">
                    ${this.createTimeline(transaction)}
                </div>

                <div class="transaction-details">
                    <div class="detail-row">
                        <span class="detail-label">Request Date:</span>
                        <span class="detail-value">${this.formatDate(transaction.request_date)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Expected Return:</span>
                        <span class="detail-value">${this.formatDate(transaction.expected_return_date)}</span>
                    </div>
                    ${transaction.actual_return_date ? `
                        <div class="detail-row">
                            <span class="detail-label">Actual Return:</span>
                            <span class="detail-value">${this.formatDate(transaction.actual_return_date)}</span>
                        </div>
                    ` : ''}
                    <div class="detail-row">
                        <span class="detail-label">Contact:</span>
                        <span class="detail-value">${transaction.borrower_contact}</span>
                    </div>
                </div>

                ${actions ? `<div class="transaction-actions">${actions}</div>` : ''}
            </div>
        `;
    }

    getStatusInfo(transaction) {
        const statusMap = {
            'pending': { text: 'Waiting for Approval', icon: 'fas fa-clock', class: 'pending' },
            'approved': { text: 'Waiting for Pickup', icon: 'fas fa-handshake', class: 'approved' },
            'borrowed': { text: 'Currently Borrowed', icon: 'fas fa-book-open', class: 'borrowed' },
            'returned': { text: 'Returned - Pending Feedback', icon: 'fas fa-undo', class: 'returned' },
            'completed': { text: 'Completed', icon: 'fas fa-check-circle', class: 'completed' },
            'rejected': { text: 'Rejected', icon: 'fas fa-times-circle', class: 'rejected' },
            'cancelled': { text: 'Cancelled', icon: 'fas fa-ban', class: 'cancelled' }
        };
        
        return statusMap[transaction.status] || { text: transaction.status, icon: 'fas fa-question', class: 'unknown' };
    }

    getTimeInfo(transaction) {
        const now = new Date();
        const expectedReturn = new Date(transaction.expected_return_date);
        
        if (transaction.status === 'borrowed') {
            const daysUntilDue = Math.ceil((expectedReturn - now) / (1000 * 60 * 60 * 24));
            
            if (daysUntilDue < 0) {
                return { badge: `${Math.abs(daysUntilDue)} days overdue`, class: 'overdue' };
            } else if (daysUntilDue === 0) {
                return { badge: 'Due today', class: 'due-today' };
            } else if (daysUntilDue <= 3) {
                return { badge: `Due in ${daysUntilDue} days`, class: 'due-soon' };
            }
        }
        
        return {};
    }

    createTimeline(transaction) {
        const steps = [
            { key: 'request_date', label: 'Request Sent', icon: 'fas fa-paper-plane' },
            { key: 'approved_date', label: 'Approved', icon: 'fas fa-check' },
            { key: 'borrowed_date', label: 'Picked Up', icon: 'fas fa-handshake' },
            { key: 'actual_return_date', label: 'Returned', icon: 'fas fa-undo' },
            { key: 'completed_date', label: 'Completed', icon: 'fas fa-star' }
        ];

        return `
            <div class="timeline">
                ${steps.map(step => {
                    const isCompleted = transaction[step.key];
                    const isCurrent = this.isCurrentStep(transaction, step.key);
                    
                    return `
                        <div class="timeline-step ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}">
                            <div class="timeline-icon">
                                <i class="${step.icon}"></i>
                            </div>
                            <div class="timeline-content">
                                <span class="timeline-label">${step.label}</span>
                                ${isCompleted ? `<span class="timeline-date">${this.formatDate(transaction[step.key])}</span>` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    isCurrentStep(transaction, stepKey) {
        const stepOrder = ['request_date', 'approved_date', 'borrowed_date', 'actual_return_date', 'completed_date'];
        const statusStepMap = {
            'pending': 'request_date',
            'approved': 'approved_date',
            'borrowed': 'borrowed_date',
            'returned': 'actual_return_date',
            'completed': 'completed_date'
        };
        
        return statusStepMap[transaction.status] === stepKey;
    }

    getTransactionActions(transaction, userRole) {
        const userId = authManager.currentUser?.id;
        const actions = [];

        switch (transaction.status) {
            case 'approved':
                if (userRole === 'lender') {
                    actions.push(`
                        <button class="btn btn-primary btn-sm" onclick="monitoringManager.updateStatus(${transaction.id}, 'borrowed')">
                            <i class="fas fa-handshake"></i>
                            Mark as Picked Up
                        </button>
                    `);
                }
                actions.push(`
                    <button class="btn btn-outline btn-sm" onclick="requestManager.openChatByTransaction(${transaction.id})">
                        <i class="fas fa-comments"></i>
                        Chat
                    </button>
                `);
                break;

            case 'borrowed':
                if (userRole === 'lender') {
                    actions.push(`
                        <button class="btn btn-success btn-sm" onclick="monitoringManager.updateStatus(${transaction.id}, 'returned')">
                            <i class="fas fa-undo"></i>
                            Mark as Returned
                        </button>
                    `);
                }
                actions.push(`
                    <button class="btn btn-outline btn-sm" onclick="requestManager.openChatByTransaction(${transaction.id})">
                        <i class="fas fa-comments"></i>
                        Chat
                    </button>
                `);
                break;

            case 'returned':
                const isBorrower = userRole === 'borrower';
                const hasGivenFeedback = isBorrower ? transaction.borrower_feedback_given > 0 : transaction.lender_feedback_given > 0;
                
                if (!hasGivenFeedback) {
                    actions.push(`
                        <button class="btn btn-primary btn-sm" onclick="monitoringManager.openFeedbackModal(${transaction.id})">
                            <i class="fas fa-star"></i>
                            Give Feedback
                        </button>
                    `);
                }
                break;
        }

        return actions.join('');
    }

    async updateStatus(transactionId, newStatus) {
        try {
            const transaction = this.transactions.find(t => t.id === transactionId);
            if (!transaction) return;

            // Open status update modal
            this.openStatusUpdateModal(transaction, newStatus);
        } catch (error) {
            console.error('Failed to update status:', error);
            this.showToast('Failed to update status', 'error');
        }
    }

    openStatusUpdateModal(transaction, newStatus) {
        const modal = document.getElementById('status-update-modal');
        const title = document.getElementById('status-update-title');
        const content = document.getElementById('status-update-content');
        const transactionIdInput = document.getElementById('update-transaction-id');
        const newStatusInput = document.getElementById('update-new-status');
        const notesGroup = document.getElementById('status-notes-group');
        const conditionGroup = document.getElementById('return-condition-group');
        const updateBtn = document.getElementById('status-update-btn');

        // Set form data
        transactionIdInput.value = transaction.id;
        newStatusInput.value = newStatus;

        // Configure modal based on status
        if (newStatus === 'borrowed') {
            title.textContent = 'Confirm Book Pickup';
            content.innerHTML = `
                <div class="status-update-info">
                    <p><strong>Confirm that "${transaction.book_title}" has been picked up by ${transaction.borrower_name}.</strong></p>
                    <p>This will start the borrowing period. The book is expected to be returned by ${this.formatDate(transaction.expected_return_date)}.</p>
                </div>
            `;
            notesGroup.style.display = 'block';
            conditionGroup.style.display = 'none';
            updateBtn.innerHTML = '<i class="fas fa-handshake"></i> Confirm Pickup';
        } else if (newStatus === 'returned') {
            title.textContent = 'Confirm Book Return';
            content.innerHTML = `
                <div class="status-update-info">
                    <p><strong>Confirm that "${transaction.book_title}" has been returned by ${transaction.borrower_name}.</strong></p>
                    <p>Please assess the condition of the book and provide any additional notes.</p>
                </div>
            `;
            notesGroup.style.display = 'block';
            conditionGroup.style.display = 'block';
            updateBtn.innerHTML = '<i class="fas fa-undo"></i> Confirm Return';
        }

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    async handleStatusUpdate(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const transactionId = formData.get('transaction_id');
        const newStatus = formData.get('new_status');
        const notes = formData.get('notes');
        const returnCondition = formData.get('return_condition');

        try {
            let endpoint = '';
            let payload = {};

            if (newStatus === 'borrowed') {
                endpoint = `/transactions/${transactionId}/borrowed`;
                payload = { lender_notes: notes };
            } else if (newStatus === 'returned') {
                endpoint = `/transactions/${transactionId}/return`;
                payload = { 
                    return_condition: returnCondition,
                    return_notes: notes 
                };
            }

            await api.put(endpoint, payload);
            
            // Close modal
            document.getElementById('status-update-modal').classList.remove('active');
            document.body.style.overflow = '';
            
            // Reset form
            e.target.reset();
            
            this.showToast('Transaction status updated successfully!', 'success');
            await this.loadTransactions();
            
        } catch (error) {
            console.error('Failed to update transaction status:', error);
            this.showToast(error.message || 'Failed to update transaction status', 'error');
        }
    }

    openFeedbackModal(transactionId) {
        const transaction = this.transactions.find(t => t.id === transactionId);
        if (!transaction) return;

        const modal = document.getElementById('feedback-modal');
        const transactionInfo = document.getElementById('feedback-transaction-info');
        const transactionIdInput = document.getElementById('feedback-transaction-id');
        const bookConditionGroup = document.getElementById('book-condition-group');
        const returnTimelinessGroup = document.getElementById('return-timeliness-group');

        // Populate transaction info
        const userId = authManager.currentUser?.id;
        const userRole = transaction.lender_id === userId ? 'lender' : 'borrower';
        const otherUser = userRole === 'lender' ? transaction.borrower_name : transaction.lender_name;

        transactionInfo.innerHTML = `
            <div class="feedback-book-info">
                <img src="${transaction.book_cover || './images/book-placeholder.svg'}" alt="${transaction.book_title}">
                <div>
                    <h4>${transaction.book_title}</h4>
                    <p>by ${transaction.book_author}</p>
                    <p><strong>${userRole === 'lender' ? 'Borrowed by' : 'Lent by'}:</strong> ${otherUser}</p>
                </div>
            </div>
        `;

        transactionIdInput.value = transactionId;

        // Show additional fields for lenders
        if (userRole === 'lender') {
            bookConditionGroup.style.display = 'block';
            returnTimelinessGroup.style.display = 'block';
        } else {
            bookConditionGroup.style.display = 'none';
            returnTimelinessGroup.style.display = 'none';
        }

        // Reset rating
        this.resetRating();

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    handleStarClick(e) {
        const rating = parseInt(e.target.dataset.rating);
        this.setRating(rating);
    }

    handleStarHover(e) {
        const rating = parseInt(e.target.dataset.rating);
        this.highlightStars(rating);
    }

    resetStarHover() {
        const currentRating = parseInt(document.getElementById('feedback-rating').value) || 0;
        this.highlightStars(currentRating);
    }

    setRating(rating) {
        document.getElementById('feedback-rating').value = rating;
        this.highlightStars(rating);
        
        const ratingTexts = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
        document.getElementById('rating-text').textContent = ratingTexts[rating];
        
        this.updateCreditPreview(rating);
    }

    highlightStars(rating) {
        const stars = document.querySelectorAll('#feedback-stars .fas');
        stars.forEach((star, index) => {
            if (index < rating) {
                star.classList.add('active');
            } else {
                star.classList.remove('active');
            }
        });
    }

    resetRating() {
        document.getElementById('feedback-rating').value = '';
        document.getElementById('rating-text').textContent = 'Click to rate';
        this.highlightStars(0);
        document.getElementById('credit-impact-info').style.display = 'none';
    }

    updateCreditPreview(rating) {
        const creditInfo = document.getElementById('credit-impact-info');
        const creditPreview = document.getElementById('credit-preview');
        
        let creditChange = 0;
        let description = '';

        // Calculate credit impact based on rating
        if (rating === 5) {
            creditChange = 3;
            description = 'Excellent rating will give +3 credits';
        } else if (rating === 4) {
            creditChange = 1;
            description = 'Good rating will give +1 credit';
        } else if (rating <= 2) {
            creditChange = -2;
            description = 'Poor rating will deduct -2 credits';
        } else {
            description = 'Average rating - no credit change';
        }

        creditPreview.innerHTML = `
            <div class="credit-change ${creditChange > 0 ? 'positive' : creditChange < 0 ? 'negative' : 'neutral'}">
                <i class="fas fa-coins"></i>
                <span>${creditChange > 0 ? '+' : ''}${creditChange} Credits</span>
            </div>
            <p>${description}</p>
        `;

        creditInfo.style.display = 'block';
    }

    async handleFeedbackSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const feedbackData = {
            transaction_id: parseInt(formData.get('transaction_id')),
            rating: parseInt(formData.get('rating')),
            comment: formData.get('comment'),
            book_condition_rating: formData.get('book_condition_rating'),
            return_timeliness: formData.get('return_timeliness')
        };

        if (!feedbackData.rating) {
            this.showToast('Please provide a rating', 'error');
            return;
        }

        try {
            await api.post('/feedback', feedbackData);
            
            // Close modal
            document.getElementById('feedback-modal').classList.remove('active');
            document.body.style.overflow = '';
            
            // Reset form
            e.target.reset();
            this.resetRating();
            
            this.showToast('Feedback submitted successfully!', 'success');
            await this.loadTransactions();
            
        } catch (error) {
            console.error('Failed to submit feedback:', error);
            this.showToast(error.message || 'Failed to submit feedback', 'error');
        }
    }

    updateBadgeCounts() {
        const userId = authManager.currentUser?.id;
        if (!userId) return;

        const activeBadge = document.getElementById('active-count');
        const feedbackBadge = document.getElementById('feedback-count');
        const overdueBadge = document.getElementById('overdue-count');
        const monitoringBadge = document.getElementById('monitoring-badge');

        const activeCount = this.transactions.filter(t => 
            (t.borrower_id === userId || t.lender_id === userId) &&
            ['approved', 'borrowed'].includes(t.status)
        ).length;

        const feedbackCount = this.transactions.filter(t => {
            if (t.status !== 'returned') return false;
            
            const isBorrower = t.borrower_id === userId;
            const isLender = t.lender_id === userId;
            
            if (isBorrower && t.borrower_feedback_given === 0) return true;
            if (isLender && t.lender_feedback_given === 0) return true;
            
            return false;
        }).length;

        const now = new Date();
        const overdueCount = this.transactions.filter(t => {
            if (!['borrowed'].includes(t.status)) return false;
            if (t.borrower_id !== userId && t.lender_id !== userId) return false;
            const returnDate = new Date(t.expected_return_date);
            return now > returnDate;
        }).length;

        if (activeBadge) activeBadge.textContent = activeCount;
        if (feedbackBadge) feedbackBadge.textContent = feedbackCount;
        if (overdueBadge) overdueBadge.textContent = overdueCount;
        
        // Update main navigation badge
        const totalNotifications = feedbackCount + overdueCount;
        if (monitoringBadge) {
            monitoringBadge.textContent = totalNotifications;
            monitoringBadge.style.display = totalNotifications > 0 ? 'inline' : 'none';
        }
    }

    getEmptyState(tab = null) {
        const emptyStates = {
            'active': {
                icon: 'fas fa-clock',
                title: 'No Active Transactions',
                message: 'When you have approved borrow requests or borrowed books, they will appear here.',
                action: '<button class="btn" onclick="app.navigateToSection(\'books\')">Browse Books</button>'
            },
            'pending-feedback': {
                icon: 'fas fa-star',
                title: 'No Pending Feedback',
                message: 'When transactions are completed, you can provide feedback here.',
                action: ''
            },
            'completed': {
                icon: 'fas fa-check-circle',
                title: 'No Completed Transactions',
                message: 'Your completed book exchanges will appear here.',
                action: ''
            },
            'overdue': {
                icon: 'fas fa-exclamation-triangle',
                title: 'No Overdue Books',
                message: 'Great! You have no overdue book returns.',
                action: ''
            }
        };

        const targetTab = tab || this.currentTab;
        const state = emptyStates[targetTab];
        return `
            <div class="empty-state">
                <i class="${state.icon}"></i>
                <h3>${state.title}</h3>
                <p>${state.message}</p>
                ${state.action}
            </div>
        `;
    }

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString();
    }

    showToast(message, type = 'info') {
        if (authManager && authManager.showToast) {
            authManager.showToast(message, type);
        }
    }
}

// Initialize monitoring manager
const monitoringManager = new MonitoringManager();

// Global access
window.monitoringManager = monitoringManager;
