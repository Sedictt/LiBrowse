// Requests management for LiBrowse

class RequestsManager {
    constructor() {
        this.incomingRequests = [];
        this.outgoingRequests = [];
        this.activeChats = [];
    }

    async loadRequests() {
        if (!authManager.isAuthenticated) return;

        try {
            const response = await api.getTransactions({ type: 'requests' });
            this.incomingRequests = response.incoming || [];
            this.outgoingRequests = response.outgoing || [];
            this.renderRequests();
        } catch (error) {
            console.error('Failed to load requests:', error);
            showToast('Failed to load requests', 'error');
        }
    }

    renderRequests() {
        this.renderIncomingRequests();
        this.renderOutgoingRequests();
        this.updateBadges();
    }

    renderIncomingRequests() {
        const container = document.getElementById('incoming-requests');
        if (!container) return;

        if (this.incomingRequests.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <h3>No incoming requests</h3>
                    <p>You'll see requests from other students here</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.incomingRequests.map(request => this.createRequestCard(request, 'incoming')).join('');
    }

    renderOutgoingRequests() {
        const container = document.getElementById('outgoing-requests');
        if (!container) return;

        if (this.outgoingRequests.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-paper-plane"></i>
                    <h3>No outgoing requests</h3>
                    <p>Start browsing books to send requests</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.outgoingRequests.map(request => this.createRequestCard(request, 'outgoing')).join('');
    }

    createRequestCard(request, type) {
        return `
            <div class="request-card" data-request-id="${request.id}">
                <div class="request-info">
                    <h4>${escapeHtml(request.book_title)}</h4>
                    <p>${type === 'incoming' ? 'From' : 'To'}: ${escapeHtml(request.user_name)}</p>
                    <span class="request-date">${formatDate(request.created_at)}</span>
                </div>
                <div class="request-actions">
                    ${type === 'incoming' ? `
                        <button class="btn btn-primary btn-sm" onclick="requestsManager.approveRequest(${request.id})">
                            <i class="fas fa-check"></i> Approve
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="requestsManager.rejectRequest(${request.id})">
                            <i class="fas fa-times"></i> Reject
                        </button>
                    ` : `
                        <span class="request-status status-${request.status}">${request.status}</span>
                    `}
                </div>
            </div>
        `;
    }

    async approveRequest(requestId) {
        try {
            await api.updateTransactionStatus(requestId, 'approved');
            showToast('Request approved!', 'success');
            this.loadRequests();
        } catch (error) {
            console.error('Failed to approve request:', error);
            showToast('Failed to approve request', 'error');
        }
    }

    async rejectRequest(requestId) {
        try {
            await api.updateTransactionStatus(requestId, 'rejected');
            showToast('Request rejected', 'info');
            this.loadRequests();
        } catch (error) {
            console.error('Failed to reject request:', error);
            showToast('Failed to reject request', 'error');
        }
    }

    updateBadges() {
        const incomingBadge = document.getElementById('incoming-count');
        if (incomingBadge) {
            incomingBadge.textContent = this.incomingRequests.length;
            incomingBadge.style.display = this.incomingRequests.length > 0 ? 'inline' : 'none';
        }
    }
}

// Create global requests manager instance
const requestsManager = new RequestsManager();
