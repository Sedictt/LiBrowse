// Monitoring management for LiBrowse

class MonitoringManager {
    constructor() {
        this.activeTransactions = [];
        this.pendingFeedback = [];
        this.completedTransactions = [];
        this.overdueTransactions = [];
    }

    async loadTransactions() {
        if (!authManager.isAuthenticated) return;

        try {
            const response = await api.getTransactions();
            this.categorizeTransactions(response.transactions || []);
            this.renderTransactions();
        } catch (error) {
            console.error('Failed to load transactions:', error);
            showToast('Failed to load transactions', 'error');
        }
    }

    categorizeTransactions(transactions) {
        this.activeTransactions = transactions.filter(t => t.status === 'borrowed');
        this.pendingFeedback = transactions.filter(t => t.status === 'returned' && !t.feedback_given);
        this.completedTransactions = transactions.filter(t => t.status === 'completed');
        this.overdueTransactions = transactions.filter(t => t.is_overdue);
    }

    renderTransactions() {
        this.renderActiveTransactions();
        this.renderPendingFeedback();
        this.renderCompletedTransactions();
        this.renderOverdueTransactions();
        this.updateBadges();
    }

    renderActiveTransactions() {
        const container = document.getElementById('active-transactions');
        if (!container) return;

        if (this.activeTransactions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clock"></i>
                    <h3>No active transactions</h3>
                    <p>Your active book exchanges will appear here</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.activeTransactions.map(t => this.createTransactionCard(t)).join('');
    }

    renderPendingFeedback() {
        const container = document.getElementById('pending-feedback-transactions');
        if (!container) return;

        if (this.pendingFeedback.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-star"></i>
                    <h3>No pending feedback</h3>
                    <p>Transactions awaiting your feedback will appear here</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.pendingFeedback.map(t => this.createTransactionCard(t, true)).join('');
    }

    renderCompletedTransactions() {
        const container = document.getElementById('completed-transactions');
        if (!container) return;

        if (this.completedTransactions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>No completed transactions</h3>
                    <p>Your transaction history will appear here</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.completedTransactions.map(t => this.createTransactionCard(t)).join('');
    }

    renderOverdueTransactions() {
        const container = document.getElementById('overdue-transactions');
        if (!container) return;

        if (this.overdueTransactions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>No overdue transactions</h3>
                    <p>Great job keeping up with your returns!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.overdueTransactions.map(t => this.createTransactionCard(t)).join('');
    }

    createTransactionCard(transaction, showFeedbackButton = false) {
        return `
            <div class="transaction-card" data-transaction-id="${transaction.id}">
                <div class="transaction-info">
                    <h4>${escapeHtml(transaction.book_title)}</h4>
                    <p>With: ${escapeHtml(transaction.other_user_name)}</p>
                    <span class="transaction-date">${formatDate(transaction.created_at)}</span>
                    ${transaction.due_date ? `<span class="due-date">Due: ${formatDate(transaction.due_date)}</span>` : ''}
                </div>
                <div class="transaction-actions">
                    ${showFeedbackButton ? `
                        <button class="btn btn-primary btn-sm" onclick="monitoringManager.giveFeedback(${transaction.id})">
                            <i class="fas fa-star"></i> Give Feedback
                        </button>
                    ` : ''}
                    <button class="btn btn-outline btn-sm" onclick="monitoringManager.viewTransaction(${transaction.id})">
                        <i class="fas fa-eye"></i> View
                    </button>
                </div>
            </div>
        `;
    }

    updateBadges() {
        const activeBadge = document.getElementById('active-count');
        if (activeBadge) {
            activeBadge.textContent = this.activeTransactions.length;
        }

        const feedbackBadge = document.getElementById('feedback-count');
        if (feedbackBadge) {
            feedbackBadge.textContent = this.pendingFeedback.length;
        }

        const overdueBadge = document.getElementById('overdue-count');
        if (overdueBadge) {
            overdueBadge.textContent = this.overdueTransactions.length;
        }
    }

    async giveFeedback(transactionId) {
        console.log('Give feedback for transaction:', transactionId);
        // Implementation for feedback modal
    }

    async viewTransaction(transactionId) {
        console.log('View transaction:', transactionId);
        // Implementation for transaction details modal
    }
}

// Create global monitoring manager instance
const monitoringManager = new MonitoringManager();
