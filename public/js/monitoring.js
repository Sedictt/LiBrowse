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
            const data = await api.getTransactions();
            // Backend returns {transactions: [...]}
            const transactions = data.transactions || data || [];
            this.categorizeTransactions(transactions);
            this.renderTransactions();
        } catch (error) {
            console.error('Failed to load transactions:', error);
            showToast('Failed to load transactions', 'error');
        }
    }


    categorizeTransactions(transactions) {
        // Active = approved OR borrowed (ongoing)
        this.activeTransactions = transactions.filter(t =>
            t.status === 'approved' || t.status === 'borrowed'
        );

        this.pendingFeedback = transactions.filter(t =>
            t.status === 'returned');


        this.completedTransactions = transactions.filter(t =>
            t.status === 'completed'
        );

        this.overdueTransactions = transactions.filter(t =>
            t.is_overdue
        );
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
                    <i class="fas fa-book-reader"></i>
                    <p>Your active book exchanges will appear here</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.activeTransactions
            .map(t => this.createTransactionCard(t))
            .join('');
    }

    renderPendingFeedback() {
        const container = document.getElementById('pending-feedback-transactions');

        if (!container) return;

        if (this.pendingFeedback.length === 0) {
            container.innerHTML = '<p class="no-transactions">No transactions pending feedback</p>';
            return;
        }

        container.innerHTML = this.pendingFeedback.map(t => this.createTransactionCard(t)).join('');
    }


    renderCompletedTransactions() {
        const container = document.getElementById('completed-transactions');
        if (!container) return;

        if (this.completedTransactions.length === 0) {
            container.innerHTML = '<p class="no-transactions">No completed transactions</p>';
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
                    <i class="fas fa-smile"></i>
                    <p>Great job keeping up with your returns!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.overdueTransactions
            .map(t => this.createTransactionCard(t))
            .join('');
    }

    createTransactionCard(transaction, showFeedbackButton = false) {
        const userId = authManager.getCurrentUser()?.id;
        const isLender = transaction.lender_id === userId;
        const isBorrower = transaction.borrower_id === userId;

        // Build action buttons based on status and role
        let actionButtons = '';

        // Approved status - lender can mark as picked up
        if (transaction.status === 'approved' && isLender) {
            actionButtons += `
            <button class="btn btn-primary btn-sm" onclick="monitoringManager.markAsBorrowed(${transaction.id})">
                <i class="fas fa-hand-holding"></i> Mark as Picked Up
            </button>
        `;
        }

        // Borrowed/ongoing status - borrower can mark as returned
        if (transaction.status === 'borrowed' && isBorrower) {
            actionButtons += `
            <button class="btn btn-primary btn-sm" onclick="monitoringManager.markAsReturned(${transaction.id})">
                <i class="fas fa-undo"></i> Mark as Returned
            </button>
        `;
        }

        // Returned status - lender can mark as complete
        if (transaction.status === 'returned' && isLender) {
            actionButtons += `
            <button class="btn btn-success btn-sm" onclick="monitoringManager.markAsCompleted(${transaction.id})">
                <i class="fas fa-check-circle"></i> Mark as Complete
            </button>
        `;
        }

        // Show feedback button or "Already Given" badge
        if (transaction.status === 'returned' || transaction.status === 'completed') {
            if (transaction.user_gave_feedback && transaction.user_gave_feedback > 0) {
                // Already gave feedback - show badge
                actionButtons += `
            <span class="feedback-given-badge">
                <i class="fas fa-check-circle"></i> Feedback Given
            </span>
        `;
            } else {
                // Can still give feedback - show button
                actionButtons += `
            <button class="btn btn-primary btn-sm" onclick="monitoringManager.showFeedbackModal(${transaction.id}, '${escapeHtml(transaction.book_title)}', '${transaction.type}')">
               <i class="fas fa-star"></i> Give Feedback
             </button>
        `;
            }
        }


        return `
        <div class="transaction-card">
            <div class="transaction-info">
                <h4>${escapeHtml(transaction.book_title)}</h4>
                <p>With: ${escapeHtml(transaction.other_user_name)}</p>
                <span>${formatDate(transaction.created_at)}</span>
                ${transaction.due_date ? `<span>Due: ${formatDate(transaction.due_date)}</span>` : ''}
            </div>
            <div class="transaction-actions">
                ${actionButtons}
                <button class="btn btn-outline btn-sm" onclick="monitoringManager.viewTransaction(${transaction.id})">
                    <i class="fas fa-eye"></i> View
                </button>
            </div>
        </div>
    `;
    }


    async markAsBorrowed(transactionId) {
        // Show modal instead of confirm dialog
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
        <div class="modal-content transaction-action-modal">
            <div class="modal-header">
                <h2>Confirm Book Pickup</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="confirmation-icon">
                    <i class="fas fa-hand-holding-heart"></i>
                </div>
                <p class="confirmation-text">Confirm that the borrower has picked up the book?</p>
                <div class="form-group">
                    <label>Meeting Notes (Optional):</label>
                    <textarea id="pickup-notes" class="form-control" rows="2" placeholder="e.g., Met at library, book condition discussed..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-primary" id="confirm-pickup-btn">
                    <i class="fas fa-check"></i> Confirm Pickup
                </button>
            </div>
        </div>
    `;

        document.body.appendChild(modal);

        // Handle confirm button
        document.getElementById('confirm-pickup-btn').onclick = async () => {
            const notes = document.getElementById('pickup-notes').value;

            try {
                // Show loading state
                document.getElementById('confirm-pickup-btn').disabled = true;
                document.getElementById('confirm-pickup-btn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

                await api.markAsBorrowed(transactionId, notes || 'Book picked up');

                // Close modal
                modal.remove();

                // Show success modal
                this.showSuccessModal('Book Marked as Borrowed!', 'The transaction is now active. The borrower can return it when finished.');

                // Reload transactions
                await this.loadTransactions();

            } catch (error) {
                console.error('Failed to mark as borrowed:', error);
                modal.remove();
                showToast(error.message || 'Failed to update transaction', 'error');
            }
        };
    }


    async markAsReturned(transactionId) {
        // Remove any existing modals first
        document.querySelectorAll('.modal').forEach(m => m.remove());  // ← ADD THIS LINE

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
        <div class="modal-content transaction-action-modal">
            <div class="modal-header">
                <h2>Mark Book as Returned</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <p>Please confirm the condition of the returned book:</p>
                <div class="form-group">
                    <label>Book Condition:</label>
                    <select id="return-condition" class="form-control">
                        <option value="excellent">Excellent - Like new</option>
                        <option value="good" selected>Good - Normal wear</option>
                        <option value="fair">Fair - Some damage</option>
                        <option value="damaged">Damaged - Significant damage</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Additional Notes (Optional):</label>
                    <textarea id="return-notes" class="form-control" rows="3" placeholder="Any additional comments..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-primary" id="confirm-return-btn">Confirm Return</button>
            </div>
        </div>
    `;

        document.body.appendChild(modal);

        document.getElementById('confirm-return-btn').onclick = async () => {
            const condition = document.getElementById('return-condition').value;
            const notes = document.getElementById('return-notes').value;

            try {
                document.getElementById('confirm-return-btn').disabled = true;
                document.getElementById('confirm-return-btn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

                await api.markAsReturned(transactionId, {
                    return_condition: condition,
                    return_notes: notes || ''
                });

                modal.remove();
                this.showSuccessModal('Book Marked as Returned!', 'The lender has been notified and will review the book condition.');
                await this.loadTransactions();

            } catch (error) {
                console.error('Failed to mark as returned:', error);
                modal.remove();
                showToast(error.message || 'Failed to update transaction', 'error');
            }
        };
    }



    async markAsCompleted(transactionId) {
        // Remove any existing modals
        document.querySelectorAll('.modal').forEach(m => m.remove());

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
        <div class="modal-content transaction-action-modal">
            <div class="modal-header">
                <h2>Complete Transaction</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="confirmation-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <p class="confirmation-text">Mark this transaction as completed?</p>
                <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin-top: 12px;">
                    This confirms you received the book back in good condition. The transaction will be closed and the book will become available again.
                </p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-primary" id="confirm-complete-btn">
                    <i class="fas fa-check"></i> Complete Transaction
                </button>
            </div>
        </div>
    `;

        document.body.appendChild(modal);

        document.getElementById('confirm-complete-btn').onclick = async () => {
            try {
                document.getElementById('confirm-complete-btn').disabled = true;
                document.getElementById('confirm-complete-btn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

                await api.completeTransaction(transactionId);

                modal.remove();
                this.showSuccessModal('Transaction Completed Successfully!', 'The book is now available for other users to borrow.');
                await this.loadTransactions();

            } catch (error) {
                console.error('Failed to complete transaction:', error);
                modal.remove();
                showToast(error.message || 'Failed to complete transaction', 'error');
            }
        };
    }


    updateBadges() {
        const activeBadge = document.querySelector('[data-tab="active"] .badge');
        const pendingBadge = document.querySelector('[data-tab="pending-feedback"] .badge');

        const completedBadge = document.querySelector('[data-tab="completed"] .badge');
        const overdueBadge = document.querySelector('[data-tab="overdue"] .badge');

        if (activeBadge) activeBadge.textContent = this.activeTransactions.length;
        if (pendingBadge) pendingBadge.textContent = this.pendingFeedback.length;
        if (completedBadge) completedBadge.textContent = this.completedTransactions.length;
        if (overdueBadge) overdueBadge.textContent = this.overdueTransactions.length;
    }

    giveFeedback(transactionId) {
        // Implement feedback modal logic
        console.log('Give feedback for transaction:', transactionId);
        showToast('Feedback feature coming soon!', 'info');
    }

    async viewTransaction(transactionId) {
        try {
            const response = await api.request(`/transactions/${transactionId}`);

            // Load feedback for this transaction
            let feedback = [];
            try {
                feedback = await api.getTransactionFeedback(transactionId);
            } catch (err) {
                console.log('No feedback yet for this transaction');
            }

            // Format status display name
            const statusLabels = {
                'approved': 'Approved',
                'borrowed': 'Borrowed',
                'returned': 'Returned',
                'completed': 'Completed',
                'rejected': 'Rejected',
                'cancelled': 'Cancelled',
                'pending': 'Pending'
            };

            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.innerHTML = `
        <div class="modal-content transaction-details-modal">
            <div class="modal-header">
                <h2>Transaction Details</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            
            <div class="transaction-details">
                <!-- Status Section -->
                <div class="transaction-status-section">
                    <div class="transaction-detail-row">
                        <div class="transaction-detail-label">Status:</div>
                        <div class="transaction-detail-value">
                            <span class="status-badge status-${response.status}">
                                ${statusLabels[response.status] || response.status}
                            </span>
                        </div>
                    </div>
                </div>
                
                <!-- Book Details -->
                <div class="transaction-detail-row">
                    <div class="transaction-detail-label">Book:</div>
                    <div class="transaction-detail-value">${escapeHtml(response.book_title)}</div>
                </div>
                
                ${response.book_author ? `
                    <div class="transaction-detail-row">
                        <div class="transaction-detail-label">Author:</div>
                        <div class="transaction-detail-value">${escapeHtml(response.book_author)}</div>
                    </div>
                ` : ''}
                
                <!-- People Involved -->
                <div class="transaction-detail-row">
                    <div class="transaction-detail-label">Borrower:</div>
                    <div class="transaction-detail-value">${escapeHtml(response.borrower_name)}</div>
                </div>
                
                <div class="transaction-detail-row">
                    <div class="transaction-detail-label">Lender:</div>
                    <div class="transaction-detail-value">${escapeHtml(response.lender_name)}</div>
                </div>
                
                <!-- Timeline -->
                <div class="transaction-timeline">
                    <h3 style="margin: 0 0 16px; color: #333; font-size: 16px;">Timeline</h3>
                    
                    <div class="timeline-item">
                        <div class="timeline-icon">📝</div>
                        <div class="timeline-content">
                            <div class="timeline-title">Request Submitted</div>
                            <div class="timeline-date">${formatDate(response.request_date)}</div>
                        </div>
                    </div>
                    
                    ${response.approved_date ? `
                        <div class="timeline-item">
                            <div class="timeline-icon">✓</div>
                            <div class="timeline-content">
                                <div class="timeline-title">Request Approved</div>
                                <div class="timeline-date">${formatDate(response.approved_date)}</div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${response.borrowed_date ? `
                        <div class="timeline-item">
                            <div class="timeline-icon">📖</div>
                            <div class="timeline-content">
                                <div class="timeline-title">Book Picked Up</div>
                                <div class="timeline-date">${formatDate(response.borrowed_date)}</div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${response.expected_return_date ? `
                        <div class="timeline-item">
                            <div class="timeline-icon">📅</div>
                            <div class="timeline-content">
                                <div class="timeline-title">Expected Return Date</div>
                                <div class="timeline-date">${formatDate(response.expected_return_date)}</div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${response.actual_return_date ? `
                        <div class="timeline-item">
                            <div class="timeline-icon">↩️</div>
                            <div class="timeline-content">
                                <div class="timeline-title">Book Returned</div>
                                <div class="timeline-date">${formatDate(response.actual_return_date)}</div>
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                                ${response.request_message ? `
                    <div class="transaction-message-box">
                        <div class="transaction-message-label">Request Message</div>
                        <div class="transaction-message-content">${escapeHtml(response.request_message)}</div>
                    </div>
                ` : ''}
                
                <!-- FEEDBACK SECTION -->
                ${feedback && feedback.length > 0 ? `
                    <div class="feedback-section">
                        <h3><i class="fas fa-star"></i> Feedback</h3>
                        ${feedback.map(f => `
                            <div class="feedback-item">
                                <div class="feedback-header">
                                    <div>
                                        <strong>${escapeHtml(f.reviewer_name)}</strong>
                                        <div class="feedback-rating">
                                            ${Array(f.rating).fill('<i class="fas fa-star"></i>').join('')}
                                            ${Array(5 - f.rating).fill('<i class="far fa-star"></i>').join('')}
                                        </div>
                                    </div>
                                    <div class="feedback-date">${formatDate(f.created)}</div>
                                </div>
                                ${f.comment ? `<p class="feedback-comment">${escapeHtml(f.comment)}</p>` : ''}
                                ${f.book_cond || f.return_time ? `
                                <div class="feedback-details">
                                    ${f.book_cond ? `
                                    <div class="feedback-detail-item">
                                        <i class="fas fa-book"></i>
                                        <span>Condition: ${f.book_cond.replace('_', ' ')}</span>
                                    </div>
                                    ` : ''}
                                    ${f.return_time ? `
                                    <div class="feedback-detail-item">
                                        <i class="fas fa-clock"></i>
                                        <span>Returned: ${f.return_time}</span>
                                    </div>
                                    ` : ''}
                                </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        </div>


            </div>
        </div>
    `;

            document.body.appendChild(modal);

            // Close on outside click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });

        } catch (error) {
            console.error('Failed to load transaction details:', error);
            showToast('Failed to load transaction details', 'error');
        }
    }

    // Show dispute filing modal
    showDisputeModal(feedbackId, transactionId) {
        // Remove any existing modals
        document.querySelectorAll('.modal').forEach(m => m.remove());

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
        <div class="modal-content dispute-modal">
            <div class="modal-header">
                <h2><i class="fas fa-exclamation-triangle"></i> File a Dispute</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <p class="dispute-info">
                    Please explain why you believe this feedback is inaccurate. 
                    Our team will review your dispute and take appropriate action.
                </p>
                
                <form id="dispute-form">
                    <!-- Dispute Reason -->
                    <div class="form-group">
                        <label for="dispute-reason">Reason for Dispute *</label>
                        <select id="dispute-reason" name="reason" required>
                            <option value="">Select a reason...</option>
                            <option value="inaccurate">Inaccurate Information</option>
                            <option value="unfair">Unfair Rating</option>
                            <option value="abuse">Abusive Language/Harassment</option>
                            <option value="irrelevant">Irrelevant Feedback</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    
                    <!-- Description -->
                    <div class="form-group">
                        <label for="dispute-description">Detailed Description (Optional)</label>
                        <textarea id="dispute-description" name="description" rows="4" 
                            maxlength="500" placeholder="Provide any additional context..."></textarea>
                        <small class="char-count">0 / 500</small>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-primary" id="submit-dispute-btn" 
                    onclick="monitoringManager.submitDispute(${feedbackId}, ${transactionId})">
                    <i class="fas fa-paper-plane"></i> Submit Dispute
                </button>
            </div>
        </div>
    `;

        document.body.appendChild(modal);

        // Character counter
        const descBox = document.getElementById('dispute-description');
        const charCount = document.querySelector('.char-count');
        descBox.addEventListener('input', () => {
            charCount.textContent = `${descBox.value.length} / 500`;
        });
    }

    // Submit dispute
    async submitDispute(feedbackId, transactionId) {
        try {
            const reason = document.getElementById('dispute-reason').value;
            const description = document.getElementById('dispute-description').value;

            if (!reason) {
                showToast('Please select a reason', 'error');
                return;
            }

            // Disable button
            const submitBtn = document.getElementById('submit-dispute-btn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

            // Submit dispute
            const response = await api.fileDispute(feedbackId, reason, description);

            // Close modal
            document.querySelector('.modal').remove();

            // Show success
            showToast('Dispute filed successfully! Our team will review it shortly.', 'success');

            // Reload transactions
            await this.loadTransactions();

        } catch (error) {
            console.error('Submit dispute error:', error);
            showToast(error.message || 'Failed to file dispute', 'error');

            // Re-enable button
            const submitBtn = document.getElementById('submit-dispute-btn');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Dispute';
            }
        }
    }


    showSuccessModal(title, message) {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
        <div class="modal-content success-modal">
            <div class="success-icon-container">
                <div class="success-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
            </div>
            <h2>${title}</h2>
            <p>${message}</p>
            <button class="btn btn-primary btn-block" onclick="this.closest('.modal').remove()">
                Got it!
            </button>
        </div>
    `;

        document.body.appendChild(modal);

        // Auto close after 3 seconds
        setTimeout(() => {
            if (modal.parentElement) {
                modal.remove();
            }
        }, 3000);
    }

    // Show feedback modal
    showFeedbackModal(transactionId, bookTitle, userType) {
        // Remove any existing modals
        document.querySelectorAll('.modal').forEach(m => m.remove());

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
        <div class="modal-content feedback-modal">
            <div class="modal-header">
                <h2><i class="fas fa-star"></i> Leave Feedback</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="feedback-book-info">
                    <i class="fas fa-book"></i>
                    <strong>${bookTitle}</strong>
                </div>
                
                <form id="feedback-form">
                    <!-- Rating Stars -->
                    <div class="form-group">
                        <label>Overall Rating *</label>
                        <div class="star-rating" id="star-rating">
                            <i class="far fa-star" data-rating="1"></i>
                            <i class="far fa-star" data-rating="2"></i>
                            <i class="far fa-star" data-rating="3"></i>
                            <i class="far fa-star" data-rating="4"></i>
                            <i class="far fa-star" data-rating="5"></i>
                        </div>
                        <input type="hidden" id="rating-value" name="rating" required>
                    </div>
                    
                    <!-- Comment -->
                    <div class="form-group">
                        <label for="comment">Comments (Optional)</label>
                        <textarea id="comment" name="comment" rows="4" maxlength="500" 
                            placeholder="Share your experience..."></textarea>
                        <small class="char-count">0 / 500</small>
                    </div>
                    
                    <!-- Book Condition (for borrowers rating lenders) -->
                    ${userType === 'borrowing' ? `
                    <div class="form-group">
                        <label for="book-condition">Book Condition *</label>
                        <select id="book-condition" name="book_condition_rating" required>
                            <option value="">Select condition...</option>
                            <option value="excellent">Excellent - Like new</option>
                            <option value="good">Good - Minor wear</option>
                            <option value="fair">Fair - Noticeable wear</option>
                            <option value="poor">Poor - Significant damage</option>
                            <option value="damaged">Damaged - Unusable</option>
                        </select>
                    </div>
                    ` : ''}
                    
                    <!-- Return Timeliness (for lenders rating borrowers) -->
                    ${userType === 'lending' ? `
                    <div class="form-group">
                        <label for="return-timeliness">Return Timeliness *</label>
                        <select id="return-timeliness" name="return_timeliness" required>
                            <option value="">Select...</option>
                            <option value="early">Early - Returned ahead of schedule</option>
                            <option value="on_time">On Time - Returned as agreed</option>
                            <option value="late">Late - Returned past due date</option>
                        </select>
                    </div>
                    ` : ''}
                </form>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-primary" id="submit-feedback-btn">
                    <i class="fas fa-paper-plane"></i> Submit Feedback
                </button>
            </div>
        </div>
    `;

        document.body.appendChild(modal);

        // Initialize star rating
        this.initializeStarRating();

        // Character counter for comment
        const commentBox = document.getElementById('comment');
        const charCount = document.querySelector('.char-count');
        commentBox.addEventListener('input', () => {
            charCount.textContent = `${commentBox.value.length} / 500`;
        });

        // Submit feedback
        document.getElementById('submit-feedback-btn').onclick = () => this.submitFeedback(transactionId);
    }

    // Initialize star rating functionality
    initializeStarRating() {
        const stars = document.querySelectorAll('#star-rating i');
        const ratingInput = document.getElementById('rating-value');

        stars.forEach(star => {
            star.addEventListener('click', function () {
                const rating = this.getAttribute('data-rating');
                ratingInput.value = rating;

                // Update star display
                stars.forEach((s, index) => {
                    if (index < rating) {
                        s.classList.remove('far');
                        s.classList.add('fas');
                    } else {
                        s.classList.remove('fas');
                        s.classList.add('far');
                    }
                });
            });

            // Hover effect
            star.addEventListener('mouseenter', function () {
                const rating = this.getAttribute('data-rating');
                stars.forEach((s, index) => {
                    if (index < rating) {
                        s.style.color = '#ffc107';
                    }
                });
            });

            star.addEventListener('mouseleave', function () {
                stars.forEach(s => s.style.color = '');
            });
        });
    }

    // Submit feedback
    // Submit feedback
    async submitFeedback(transactionId) {
        try {
            const rating = document.getElementById('rating-value').value;
            const comment = document.getElementById('comment').value;
            const bookConditionEl = document.getElementById('book-condition');
            const returnTimelinessEl = document.getElementById('return-timeliness');

            // Validation
            if (!rating) {
                showToast('Please select a rating', 'error');
                return;
            }

            // Build feedback data object - only include fields that exist
            const feedbackData = {
                rating: parseInt(rating),
                comment: comment || undefined  // Send undefined instead of empty string
            };

            // Only add these fields if they exist (based on user role)
            if (bookConditionEl && bookConditionEl.value) {
                feedbackData.book_condition_rating = bookConditionEl.value;
            }

            if (returnTimelinessEl && returnTimelinessEl.value) {
                feedbackData.return_timeliness = returnTimelinessEl.value;
            }

            // Disable button
            const submitBtn = document.getElementById('submit-feedback-btn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

            // Submit feedback
            const response = await api.submitFeedback(transactionId, feedbackData);

            // Close modal
            document.querySelector('.modal').remove();

            // Show success
            this.showSuccessModal('Feedback Submitted!', response.message || 'Thank you for your feedback!');

            // Reload transactions
            await this.loadTransactions();

        } catch (error) {
            console.error('Submit feedback error:', error);
            showToast(error.message || 'Failed to submit feedback', 'error');

            // Re-enable button
            const submitBtn = document.getElementById('submit-feedback-btn');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Feedback';
            }
        }
    }


}

// Initialize monitoring manager
const monitoringManager = new MonitoringManager();
