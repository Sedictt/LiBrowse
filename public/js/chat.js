/**
 * ChatManager - Real-time chat system for LiBrowse
 * Handles messaging between borrowers and lenders
 */

class ChatManager {
    constructor() {
        this.socket = null;
        this.currentChatId = null;
        this.currentChatInfo = null;
        this.messages = [];
        this.typingTimeout = null;
        this.messageOffset = 0;
        this.messageLimit = 50; // fetch fewer messages by default for faster initial load
        this.hasMoreMessages = false;
        this.isLoadingMessages = false;
        this.initialLoadComplete = false;
        this.pendingMessages = [];
        this.notifiedMessageIds = new Set();
        this.cancellationStatusOverrides = new Map();
        this.chatCache = new Map(); // per-chat in-memory cache for faster reopen

        this.init();
    }

    ensureSorted() {
        try {
            this.messages.sort((a, b) => {
                const aid = typeof a.id === 'number' ? a.id : parseInt(a.id);
                const bid = typeof b.id === 'number' ? b.id : parseInt(b.id);
                if (!isNaN(aid) && !isNaN(bid)) return aid - bid;
                const at = Date.parse(a.created) || 0;
                const bt = Date.parse(b.created) || 0;
                return at - bt;
            });
        } catch (e) {
            // no-op on sort errors
        }
    }

    async waitForAuth(timeoutMs = 5000) {
        const start = Date.now();
        while ((!window.authManager || !authManager.currentUser || !localStorage.getItem('token')) && (Date.now() - start) < timeoutMs) {
            await new Promise(r => setTimeout(r, 100));
        }
    }

    init() {
        console.log('Initializing ChatManager...');
        this.setupEventListeners();

        // Initialize socket when available
        setTimeout(() => {
            this.initializeSocket();
        }, 1000);
    }

    initializeSocket() {
        this.socket = getSocket();

        if (!this.socket) {
            console.error('Socket not available');
            return;
        }

        // Listen for chat events
        this.socket.on('new_message', (data) => this.handleNewMessage(data));
        this.socket.on('message_read', (data) => this.handleMessageRead(data));
        this.socket.on('all_messages_read', (data) => this.handleAllMessagesRead(data));
        this.socket.on('user_typing', (data) => this.handleUserTyping(data));
        this.socket.on('user_online', (data) => this.handleUserOnline(data));
        this.socket.on('joined_chat', (data) => this.handleJoinedChat(data));
        this.socket.on('chat_activity', (data) => this.handleChatActivity(data));

        console.log('ChatManager socket listeners registered');
    }

    setupEventListeners() {
        // Message form submission
        document.addEventListener('submit', (e) => {
            if (e.target.id === 'chat-message-form' || e.target.id === 'chat-form') {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Keyboard shortcuts for message input
        document.addEventListener('keydown', (e) => {
            if (e.target.id === 'chat-message-input') {
                // Enter to send (without Shift)
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
                // Shift+Enter for new line (default behavior)
            }
        });

        // Typing indicator and character count
        document.addEventListener('input', (e) => {
            if (e.target.id === 'chat-message-input') {
                this.handleTyping();
                this.updateCharacterCount(e.target);
            }
        });

        // Auto-resize textarea
        document.addEventListener('input', (e) => {
            if (e.target.id === 'chat-message-input') {
                this.autoResizeTextarea(e.target);
            }
        });

        // Load more messages
        document.addEventListener('click', (e) => {
            if (e.target.id === 'load-more-messages' || e.target.closest('#load-more-messages')) {
                this.loadMoreMessages();
            }
        });

        // File attachment
        document.addEventListener('click', (e) => {
            if (e.target.id === 'attach-file-btn' || e.target.closest('#attach-file-btn')) {
                document.getElementById('file-input').click();
            }
        });

        document.addEventListener('change', (e) => {
            if (e.target.id === 'file-input') {
                this.handleFileUpload(e.target.files);
            }
        });

        // Report button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'report-chat-btn' || e.target.closest('#report-chat-btn')) {
                this.openReportModal();
            }
        });

        // Cancel transaction button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'cancel-transaction-btn' || e.target.closest('#cancel-transaction-btn')) {
                this.openCancelTransactionModal();
            }
        });

        // Report form submission
        document.addEventListener('submit', (e) => {
            if (e.target.id === 'report-form') {
                e.preventDefault();
                this.submitReport();
            }
        });

        // Cancel transaction form submission
        document.addEventListener('submit', (e) => {
            if (e.target.id === 'cancel-transaction-form') {
                e.preventDefault();
                this.submitCancellation();
            }
        });

        // Cancellation action buttons in chat (Approve/Reject)
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-cancel-action]');
            if (!btn) return;
            const action = btn.getAttribute('data-cancel-action');
            const idStr = btn.getAttribute('data-cancellation-id');
            const cancellationId = idStr ? parseInt(idStr) : null;
            if (!cancellationId) return;
            const consent = action === 'approve';
            this.respondToCancellation(cancellationId, consent, btn);
        });

        // Close modal via close button
        document.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('.chat-btn-close, .modal-close');
            if (closeBtn) {
                const modal = closeBtn.closest('#chat-modal');
                if (modal || closeBtn.dataset.modal === 'chat-modal' || closeBtn.getAttribute('data-modal') === 'chat-modal') {
                    this.closeChat();
                }
            }
        });

        // Close modal on backdrop click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('chat-modal-backdrop') &&
                document.getElementById('chat-modal').classList.contains('active')) {
                this.closeChat();
            }
        });

        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (document.getElementById('chat-modal').classList.contains('active')) {
                    this.closeChat();
                }
                if (document.getElementById('report-modal').classList.contains('active')) {
                    document.getElementById('report-modal').classList.remove('active');
                }
                if (document.getElementById('cancel-transaction-modal').classList.contains('active')) {
                    document.getElementById('cancel-transaction-modal').classList.remove('active');
                }
            }
        });

        // Close buttons for report and cancel modals
        document.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('[data-modal="report-modal"], [data-close-modal="report-modal"]');
            if (closeBtn) {
                document.getElementById('report-modal').classList.remove('active');
            }
        });

        document.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('[data-modal="cancel-transaction-modal"], [data-close-modal="cancel-transaction-modal"]');
            if (closeBtn) {
                document.getElementById('cancel-transaction-modal').classList.remove('active');
            }
        });
    }

    async openChat(chatId) {
        try {
            console.log('Opening chat:', chatId);
            this.requestNotificationPermission();

            this.currentChatId = chatId;
            this.messages = [];
            this.messageOffset = 0;
            this.initialLoadComplete = false;
            this.pendingMessages = [];
            this.cancellationStatusOverrides = new Map();

            // Show modal
            const modal = document.getElementById('chat-modal');
            if (!modal) {
                console.error('Chat modal not found');
                return;
            }
            modal.classList.add('active');

            // Try to render cached content immediately for snappier reopen
            let usedCache = false;
            if (this.chatCache && this.chatCache.has(parseInt(chatId))) {
                const cached = this.chatCache.get(parseInt(chatId));
                if (cached) {
                    this.currentChatInfo = cached.currentChatInfo || null;
                    this.messages = Array.isArray(cached.messages) ? [...cached.messages] : [];
                    this.hasMoreMessages = !!cached.hasMoreMessages;
                    this.messageOffset = cached.messageOffset || 0;
                    this.initialLoadComplete = true;
                    this.pendingMessages = [];

                    if (this.currentChatInfo) {
                        this.renderChatHeader();
                    }
                    this.renderMessages();
                    this.scrollToBottom(false);
                    usedCache = true;
                }
            }

            if (!usedCache) {
                // Show loading state only when we have nothing cached
                this.showLoadingState();
            }

            // Ensure auth is available before joining/fetching
            await this.waitForAuth();

            // Join socket room early to avoid missing events post-refresh
            if (this.socket && authManager.currentUser) {
                this.socket.emit('join_chat', {
                    chatId: chatId,
                    userId: authManager.currentUser.id
                });
            }

            // Load chat info and initial messages in parallel (fresh data)
            await Promise.all([
                this.loadChatInfo(chatId),
                this.loadMessages(chatId)
            ]);

            // After we have fresh info + messages, update cache
            this.updateChatCache(chatId);

            // Focus input after modal is open
            this.focusInput();

            // Initialize character count
            const input = document.getElementById('chat-message-input');
            if (input) {
                this.updateCharacterCount(input);
            }

            // Mark all messages as read
            this.markAllMessagesAsRead();

            // Focus input
            setTimeout(() => {
                const input = document.getElementById('chat-message-input');
                if (input) input.focus();
            }, 300);

        } catch (error) {
            console.error('Error opening chat:', error);
            this.showError('Failed to open chat');
        }
    }

    async loadChatInfo(chatId) {
        try {
            const response = await fetch(`/api/chats/${chatId}/info`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error('Failed to load chat info');
            }

            this.currentChatInfo = await response.json();
            this.renderChatHeader();

        } catch (error) {
            console.error('Error loading chat info:', error);
            throw error;
        }
    }

    async loadMessages(chatId, offset = 0) {
        try {
            this.isLoadingMessages = true;

            const response = await fetch(`/api/chats/${chatId}/messages?limit=${this.messageLimit}&offset=${offset}&_=${Date.now()}` , {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error('Failed to load messages');
            }

            const data = await response.json();

            // Server marks incoming messages as read when this endpoint is hit.
            // Ensure the Active Chats list reflects this even if sockets are unavailable.
            try {
                if (window.requestManager && typeof window.requestManager.refreshActiveChats === 'function') {
                    const p = window.requestManager.refreshActiveChats();
                    if (p && typeof p.catch === 'function') p.catch(() => {});
                }
            } catch (_) { /* noop */ }

            if (offset === 0) {
                this.messages = data.messages;
            } else {
                // Prepend older messages
                this.messages = [...data.messages, ...this.messages];
            }

            this.hasMoreMessages = data.has_more;
            this.messageOffset = offset + data.messages.length;
            // Messages are already in chronological order from the API
            this.renderMessages();

            // Scroll to bottom only on initial load
            if (offset === 0) {
                this.scrollToBottom();
            }

            this.isLoadingMessages = false;

            // After initial load, merge any pending realtime messages
            if (offset === 0 && !this.initialLoadComplete) {
                this.initialLoadComplete = true;
                if (this.pendingMessages.length > 0) {
                    for (const msg of this.pendingMessages) {
                        if (!this.messages.find(m => m.id === msg.id)) {
                            this.messages.push(msg);
                        }
                    }
                    this.pendingMessages = [];
                    // New messages arrive in order; no need to resort the full array
                    this.renderMessages();
                    this.scrollToBottom(true);
                }
            }

        } catch (error) {
            console.error('Error loading messages:', error);
            this.isLoadingMessages = false;
            throw error;
        }
    }

    async loadMoreMessages() {
        if (this.isLoadingMessages || !this.hasMoreMessages) {
            return;
        }

        const container = document.getElementById('chat-messages');
        const scrollHeightBefore = container.scrollHeight;
        const scrollTopBefore = container.scrollTop;

        await this.loadMessages(this.currentChatId, this.messageOffset);

        // Maintain scroll position
        setTimeout(() => {
            const scrollHeightAfter = container.scrollHeight;
            container.scrollTop = scrollTopBefore + (scrollHeightAfter - scrollHeightBefore);
        }, 100);
    }

    renderChatHeader() {
        if (!this.currentChatInfo) return;

        const info = this.currentChatInfo;

        const nameEl = document.getElementById('chat-user-name') || document.getElementById('chat-title');
        if (nameEl) {
            nameEl.textContent = info.other_user_name;
        }
        const bookEl = document.getElementById('chat-book-title') || document.getElementById('chat-book-info');
        if (bookEl) {
            bookEl.textContent = `About: ${info.book_title}`;
        }
        const avatar = document.getElementById('chat-user-avatar');
        if (avatar) {
            if (info.other_user_avatar) {
                avatar.src = info.other_user_avatar;
            } else {
                avatar.src = '/assets/default-avatar.svg';
            }
        }

        // Online status (will be updated by socket events)
        const statusEl = document.getElementById('chat-online-status');
        if (statusEl) {
            statusEl.textContent = 'Offline';
            statusEl.className = 'online-status offline';
        }
    }

    renderMessages() {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        // Show/hide load more button
        const loadMoreBtn = document.getElementById('load-more-messages');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = this.hasMoreMessages ? 'block' : 'none';
        }

        // Group messages by sender and time
        const groupedMessages = this.groupMessages(this.messages);

        container.innerHTML = groupedMessages.map(group => this.renderMessageGroup(group)).join('');
    }

    groupMessages(messages) {
        const groups = [];
        let currentGroup = null;

        messages.forEach(msg => {
            const isSameSender = currentGroup && currentGroup.sender_id === msg.sender_id;
            const isWithin5Min = currentGroup &&
                (new Date(msg.created) - new Date(currentGroup.messages[currentGroup.messages.length - 1].created)) < 5 * 60 * 1000;

            if (msg.message_type === 'sys') {
                // System messages are always separate
                groups.push({
                    type: 'system',
                    messages: [msg]
                });
                currentGroup = null;
            } else if (isSameSender && isWithin5Min) {
                // Add to current group
                currentGroup.messages.push(msg);
            } else {
                // Start new group
                currentGroup = {
                    type: 'user',
                    sender_id: msg.sender_id,
                    sender_name: msg.sender_name,
                    sender_avatar: msg.sender_avatar,
                    messages: [msg]
                };
                groups.push(currentGroup);
            }
        });

        return groups;
    }

    renderMessageGroup(group) {
        if (group.type === 'system') {
            return group.messages.map(msg => this.renderSystemMessage(msg)).join('');
        }

        const isOwnMessage = group.sender_id === authManager.currentUser.id;
        const messageClass = isOwnMessage ? 'message-sent' : 'message-received';
        
        // Get initials for avatar
        const initials = this.getInitials(group.sender_name);
        const totalMessages = group.messages.length;

        return `
            <div class="message-group ${messageClass}">
                ${!isOwnMessage ? `
                    <div class="message-avatar" title="${this.escapeHtml(group.sender_name)}">
                        ${initials}
                    </div>
                ` : ''}
                <div class="message-group-content">
                    ${!isOwnMessage ? `<div class="message-sender-name">${this.escapeHtml(group.sender_name)}</div>` : ''}
                    ${group.messages.map((msg, index) => {
                        let position = 'single';
                        if (totalMessages > 1) {
                            if (index === 0) position = 'first';
                            else if (index === totalMessages - 1) position = 'last';
                            else position = 'middle';
                        }
                        return this.renderMessage(msg, isOwnMessage, position);
                    }).join('')}
                    <div class="message-timestamp">
                        ${this.formatTimestamp(group.messages[group.messages.length - 1].created)}
                        ${isOwnMessage ? this.renderReadReceipt(group.messages[group.messages.length - 1]) : ''}
                    </div>
                </div>
            </div>
        `;
    }

    getInitials(name) {
        if (!name) return '?';
        
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

    renderMessage(message, isOwnMessage, position = 'single') {
        const messageState = message.state || 'sent';
        const stateClass = messageState === 'sending' ? 'sending' :
                          messageState === 'error' ? 'error' : '';

        // Check if this is an image message
        let messageContent;
        if (message.message_type === 'img') {
            // Handle image URLs (one or multiple)
            const imageUrls = message.message.split('\n').filter(url => url.trim());
            const token = localStorage.getItem('token');
            
            messageContent = imageUrls.map(url => {
                const imageUrl = url.trim();
                // Add token as query parameter for authentication
                const authenticatedUrl = imageUrl.includes('?') 
                    ? `${imageUrl}&token=${token}` 
                    : `${imageUrl}?token=${token}`;
                    
                return `
                    <div class="message-image-container">
                        <img src="${this.escapeHtml(authenticatedUrl)}" 
                             alt="Shared image" 
                             class="message-image"
                             onclick="window.open('${this.escapeHtml(authenticatedUrl)}', '_blank')"
                             onerror="this.src='/images/image-error.png'; this.onerror=null;"
                             loading="lazy" />
                    </div>
                `;
            }).join('');
        } else {
            // Regular text message
            messageContent = `<div class="message-content">${this.escapeHtml(message.message)}</div>`;
        }

        return `
            <div class="chat-message ${isOwnMessage ? 'own-message' : 'other-message'} ${stateClass} message-${position}"
                 data-message-id="${message.id}"
                 data-state="${messageState}">
                ${messageContent}
                ${messageState === 'error' ? '<div class="message-error-indicator" title="Failed to send"><i class="fas fa-exclamation-circle"></i></div>' : ''}
            </div>
        `;
    }

    renderSystemMessage(message) {
        // Try to parse structured system message payloads (e.g., cancellation request)
        try {
            const payload = typeof message.message === 'string' ? JSON.parse(message.message) : message.message;
            if (payload && typeof payload === 'object' && payload.type) {
                if (payload.type === 'cancellation_request') {
                    return this.renderCancellationRequestMessage(payload);
                }
                if (payload.type === 'cancellation_response') {
                    return this.renderCancellationResponseMessage(payload);
                }
                if (payload.type === 'cancellation_auto_approved') {
                    return this.renderCancellationAutoApprovedMessage(payload);
                }
            }
        } catch (_) { /* fall back to plain text */ }
        
        // Fallback: simple informational text
        return `
            <div class="chat-message message-system">
                <i class="fas fa-info-circle"></i>
                <span>${this.escapeHtml(message.message)}</span>
            </div>
        `;
    }

    renderCancellationRequestMessage(data) {
        const viewerId = (window.authManager && authManager.currentUser) ? authManager.currentUser.id : null;
        const cur = viewerId != null ? Number(viewerId) : null;
        const other = data && data.other_party_id != null ? Number(data.other_party_id) : null;
        const initiator = data && data.initiator_id != null ? Number(data.initiator_id) : null;
        
        // Primary check: payload-provided other_party_id
        let isResponder = cur != null && other != null && cur === other;
        // Fallback: if user is not the initiator, treat as responder
        if (!isResponder) {
            const isInitiator = initiator != null && cur === initiator;
            if (!isInitiator) {
                isResponder = true;
            }
        }
        
        const isExpired = data.expires_at ? (new Date(data.expires_at) < new Date()) : false;
        const cid = data.cancellation_id;
        let status = data.status || 'pending';
        let resolved = null;
        try {
            for (const m of this.messages) {
                if (m && m.message_type === 'sys') {
                    const p = typeof m.message === 'string' ? JSON.parse(m.message) : m.message;
                    if (p && p.type === 'cancellation_response' && Number(p.cancellation_id) === Number(cid)) {
                        resolved = p.status || null;
                        if (resolved) break;
                    }
                }
            }
        } catch (_) { /* noop */ }
        const override = (this.cancellationStatusOverrides && typeof this.cancellationStatusOverrides.get === 'function')
            ? this.cancellationStatusOverrides.get(cid)
            : null;
        if (override) status = override; else if (resolved) status = resolved;
        
        // Action buttons or status message
        let actions = '';
        if (status === 'approved' || status === 'rejected') {
            // Show status badge only - no buttons
            const statusIcon = status === 'approved' ? 'fa-check-circle' : 'fa-times-circle';
            const statusText = status === 'approved' ? 'Approved' : 'Rejected';
            const statusClass = status === 'approved' ? 'status-approved' : 'status-rejected';
            actions = `<div class="cancel-status-badge ${statusClass}"><i class="fas ${statusIcon}"></i> ${statusText}</div>`;
        } else if (isResponder && !isExpired) {
            // Show action buttons for responder
            actions = `
                <div class="cancel-actions">
                    <button class="btn btn-success btn-sm" data-cancel-action="approve" data-cancellation-id="${data.cancellation_id}">
                        <i class="fas fa-check"></i> Approve Cancellation
                    </button>
                    <button class="btn btn-error btn-sm" data-cancel-action="reject" data-cancellation-id="${data.cancellation_id}">
                        <i class="fas fa-times"></i> Reject
                    </button>
                </div>
            `;
        } else {
            // Show waiting/expired message
            actions = `<div class="cancel-actions"><em><i class="fas ${isExpired ? 'fa-clock' : 'fa-hourglass-half'}"></i> ${isExpired ? 'Expired' : 'Awaiting response'}</em></div>`;
        }
        
        // Format expiration date
        const expiresHtml = data.expires_at && status === 'pending' ? 
            `<div class="cancel-expires"><i class="fas fa-clock"></i> Respond by ${new Date(data.expires_at).toLocaleString()}</div>` : '';
        
        // Icon changes based on status
        const iconClass = status === 'approved' ? 'fa-check-circle' : status === 'rejected' ? 'fa-times-circle' : 'fa-ban';
        
        return `
            <div class="chat-message message-system">
                <div class="cancellation-card" data-cancellation-id="${data.cancellation_id}" data-status="${status}">
                    <div class="cancel-title">
                        <i class="fas ${iconClass}"></i> 
                        Cancellation request for "${this.escapeHtml(data.book_title || '')}"
                    </div>
                    <div class="cancel-reason"><i class="fas fa-comment-dots"></i> ${this.escapeHtml(data.reason || 'not specified')}</div>
                    ${expiresHtml}
                    ${actions}
                </div>
            </div>
        `;
    }

    renderCancellationResponseMessage(data) {
        const statusText = data.status === 'approved' ? 'Cancellation approved' : 'Cancellation rejected';
        const icon = data.status === 'approved' ? 'fa-check-circle' : 'fa-times-circle';
        return `
            <div class="chat-message message-system">
                <i class="fas ${icon}"></i>
                <span>${this.escapeHtml(statusText)} for "${this.escapeHtml(data.book_title || '')}"</span>
            </div>
        `;
    }

    renderCancellationAutoApprovedMessage(data) {
        return `
            <div class="chat-message message-system">
                <i class="fas fa-clock"></i>
                <span>Cancellation for "${this.escapeHtml(data.book_title || '')}" was auto-approved after 48 hours without response.</span>
            </div>
        `;
    }

    renderReadReceipt(message) {
        if (message.is_read) {
            return '<i class="fas fa-check-double read-receipt read"></i>';
        } else {
            return '<i class="fas fa-check read-receipt"></i>';
        }
    }

    async sendMessage() {
        const input = document.getElementById('chat-message-input');
        const sendBtn = document.querySelector('.btn-send');
        const message = input.value.trim();

        if (!message || !this.currentChatId) {
            return;
        }

        if (message.length > 1000) {
            this.showError('Message too long (max 1000 characters)');
            input.focus();
            return;
        }

        try {
            // Add sending state
            if (sendBtn) {
                sendBtn.classList.add('sending');
                sendBtn.disabled = true;
            }

            // Clear input immediately
            input.value = '';
            this.autoResizeTextarea(input);
            this.updateCharacterCount(input);

            // Send via Socket.IO for real-time delivery
            if (this.socket && isConnected()) {
                this.socket.emit('send_message', {
                    chatId: this.currentChatId,
                    message: message,
                    messageType: 'text',
                    userId: authManager.currentUser.id
                });
            } else {
                // Fallback to HTTP if socket not connected
                await this.sendMessageHTTP(message);
            }

            // Remove sending state
            if (sendBtn) {
                setTimeout(() => {
                    sendBtn.classList.remove('sending');
                    sendBtn.disabled = false;
                }, 300);
            }

            // Focus back on input
            this.focusInput();

        } catch (error) {
            console.error('Error sending message:', error);
            this.showError('Failed to send message. Please try again.');
            input.value = message; // Restore message

            // Remove sending state
            if (sendBtn) {
                sendBtn.classList.remove('sending');
                sendBtn.disabled = false;
            }

            input.focus();
        }
    }

    async sendMessageHTTP(message) {
        const response = await fetch(`/api/chats/${this.currentChatId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                message: message,
                message_type: 'text'
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send message');
        }

        const newMessage = await response.json();
        this.handleNewMessage({ chatId: this.currentChatId, message: newMessage });
    }

    handleNewMessage(data) {
        if (parseInt(data.chatId) !== parseInt(this.currentChatId)) {
            // Message for different chat: refresh previews and show notification (only for messages from others)
            try {
                if (window.requestManager) {
                    const fn = window.requestManager.refreshActiveChats || window.requestManager.loadRequests;
                    const p = fn.call(window.requestManager);
                    if (p && typeof p.catch === 'function') p.catch(() => {});
                }
            } catch (_) { /* noop */ }

            try {
                const curUserId = (window.authManager && authManager.currentUser) ? authManager.currentUser.id : null;
                if (!curUserId || data.message.sender_id !== curUserId) {
                    this.showNotification(data.message);
                    if (data.message && data.message.id) {
                        this.notifiedMessageIds.add(data.message.id);
                    }
                }
            } catch (_) { /* noop */ }
            return;
        }

        // If initial history isn't ready yet, buffer the message
        if (!this.initialLoadComplete) {
            // Avoid duplicates in buffer
            if (!this.pendingMessages.find(m => m.id === data.message.id)) {
                this.pendingMessages.push(data.message);
            }
            return;
        }

        // Add message to array if not already there
        const exists = this.messages.find(m => m.id === data.message.id);
        if (!exists) {
            this.messages.push(data.message);

            // Check if user is near bottom before adding message
            const container = document.getElementById('chat-messages');
            const isNearBottom = container ?
                (container.scrollHeight - container.scrollTop - container.clientHeight < 100) : true;

            // New messages are appended at the end; the array stays in chronological order
            this.renderMessages();

            // Only auto-scroll if user was near bottom or it's their own message
            if (isNearBottom || data.message.sender_id === authManager.currentUser.id) {
                this.scrollToBottom(true);
            }
        }

        // Mark as read if chat is open (ignore system messages)
        if (data.message.message_type !== 'sys' && data.message.sender_id !== authManager.currentUser.id) {
            this.markMessageAsRead(data.message.id);
        }

        // Play notification sound (optional)
        // this.playNotificationSound();
    }

    handleMessageRead(data) {
        if (parseInt(data.chatId) !== parseInt(this.currentChatId)) return;

        // Update message read status for the specific message
        const message = this.messages.find(m => m.id === data.messageId);
        if (message) {
            message.is_read = true;
            message.read_at = data.readAt;
            this.renderMessages();
        }
    }

    handleAllMessagesRead(data) {
        if (!data || parseInt(data.chatId) !== parseInt(this.currentChatId)) return;

        const currentUserId = (window.authManager && authManager.currentUser)
            ? authManager.currentUser.id
            : null;

        // Only update if the other user read our messages
        if (!currentUserId || data.readBy === currentUserId) return;

        let changed = false;
        this.messages.forEach(m => {
            if (m.sender_id === currentUserId && !m.is_read) {
                m.is_read = true;
                changed = true;
            }
        });

        if (changed) {
            this.renderMessages();
        }
    }

    handleUserTyping(data) {
        if (parseInt(data.chatId) !== parseInt(this.currentChatId)) return;

        const indicator = document.getElementById('typing-indicator');
        if (!indicator) return;

        const userNameSpan = indicator.querySelector('.typing-user-name');

        if (data.isTyping) {
            if (userNameSpan) {
                userNameSpan.textContent = `${data.userName} is typing`;
            }
            indicator.style.display = 'flex';
            // Scroll to show typing indicator
            this.scrollToBottom(true);
        } else {
            indicator.style.display = 'none';
        }
    }

    handleUserOnline(data) {
        if (!this.currentChatInfo || data.userId !== this.currentChatInfo.other_user_id) {
            return;
        }

        const statusEl = document.getElementById('chat-online-status');
        if (statusEl) {
            if (data.isOnline) {
                statusEl.textContent = 'Online';
                statusEl.className = 'online-status online';
            } else {
                statusEl.textContent = 'Offline';
                statusEl.className = 'online-status offline';
            }
        }
    }

    handleJoinedChat(data) {
        console.log('Joined chat:', data.chatId);
    }

    async handleChatActivity(data) {
        try {
            if (!data || data.type !== 'message' || !data.chatId) return;
            if (this.currentChatId && parseInt(data.chatId) === parseInt(this.currentChatId)) return;

            // Deduplicate if we've already shown a toast for this message
            if (data.messageId && this.notifiedMessageIds.has(data.messageId)) return;

            // Ensure auth
            if (!localStorage.getItem('token')) return;

            const resp = await fetch(`/api/chats/${data.chatId}/messages?limit=1&offset=0&markRead=0&_=${Date.now()}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                cache: 'no-store'
            });
            if (!resp.ok) return;
            const payload = await resp.json();
            const last = (payload && payload.messages && payload.messages[0]) ? payload.messages[0] : null;
            if (!last) return;

            const curUserId = (window.authManager && authManager.currentUser) ? authManager.currentUser.id : null;
            if (!curUserId || last.sender_id !== curUserId) {
                this.showNotification(last);
                if (last.id) this.notifiedMessageIds.add(last.id);
            }
        } catch (_) { /* noop */ }
    }

    handleTyping() {
        if (!this.socket || !this.currentChatId) return;

        // Emit typing event
        this.socket.emit('typing', {
            chatId: this.currentChatId,
            userId: authManager.currentUser.id,
            isTyping: true
        });

        // Clear previous timeout
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        // Stop typing after 3 seconds
        this.typingTimeout = setTimeout(() => {
            this.socket.emit('typing', {
                chatId: this.currentChatId,
                userId: authManager.currentUser.id,
                isTyping: false
            });
        }, 3000);
    }

    async markMessageAsRead(messageId) {
        try {
            if (this.socket && isConnected()) {
                this.socket.emit('mark_read', {
                    chatId: this.currentChatId,
                    messageId: messageId,
                    userId: authManager.currentUser.id
                });
            } else {
                // Fallback to HTTP
                await fetch(`/api/chats/${this.currentChatId}/messages/${messageId}/read`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
            }
        } catch (error) {
            console.error('Error marking message as read:', error);
        }
    }

    async markAllMessagesAsRead() {
        if (!this.socket || !this.currentChatId) return;

        this.socket.emit('mark_all_read', {
            chatId: this.currentChatId,
            userId: authManager.currentUser.id
        });
    }

    async handleFileUpload(files) {
        if (!files || files.length === 0) return;

        // Validate files
        const maxSize = 10 * 1024 * 1024; // 10MB
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        
        for (const file of files) {
            if (file.size > maxSize) {
                this.showError(`${file.name} is too large (max 10MB)`);
                return;
            }
            if (!allowedTypes.includes(file.type)) {
                this.showError(`${file.name} is not a supported image type`);
                return;
            }
        }

        try {
            this.showSuccess('Uploading image(s)...');

            // First, create a text message to get a message ID
            const createMessageResponse = await fetch(`/api/chats/${this.currentChatId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    message: '[Image]',
                    message_type: 'img'
                })
            });

            if (!createMessageResponse.ok) {
                throw new Error('Failed to create message');
            }

            const messageData = await createMessageResponse.json();
            const messageId = messageData.message?.id || messageData.id;

            if (!messageId) {
                throw new Error('Could not get message ID');
            }

            // Now upload attachments
            const formData = new FormData();
            formData.append('chatId', this.currentChatId);
            formData.append('messageId', messageId);
            
            for (const file of files) {
                formData.append('attachments', file);
            }

            const response = await fetch('/api/chat-attachments/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'File upload failed');
            }

            const data = await response.json();
            
            // Create image URLs
            const imageUrls = data.attachments.map(a => `/api/chat-attachments/${a.id}/file`).join('\n');
            
            // Update the message via socket
            this.socket.emit('send_message', {
                chatId: this.currentChatId,
                message: imageUrls,
                messageType: 'img',
                userId: authManager.currentUser.id
            });

            this.showSuccess(`${data.attachments.length} file(s) uploaded successfully`);

            // Clear file input
            document.getElementById('file-input').value = '';

        } catch (error) {
            console.error('Error uploading file:', error);
            this.showError('Failed to upload file');
        }
    }

    openReportModal() {
        if (!this.currentChatInfo) return;

        // Resolve the "other user" ID from chat info.
        // Backend returns snake_case (other_user_id), but be defensive
        // in case of future shape changes.
        const otherUserId = this.currentChatInfo.other_user_id ||
            this.currentChatInfo.otherUserId ||
            this.currentChatInfo.otheruserid || null;

        if (!otherUserId) {
            console.error('openReportModal: other user id missing in currentChatInfo', this.currentChatInfo);
            this.showError('Unable to determine who you are reporting. Please close the chat and try again.');
            return;
        }

        // Set hidden fields
        document.getElementById('report-chat-id').value = this.currentChatId;
        document.getElementById('report-user-id').value = otherUserId;

        // Open modal
        const modal = document.getElementById('report-modal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    async submitReport() {
        try {
            const chatId = document.getElementById('report-chat-id').value;
            const reportedUserId = document.getElementById('report-user-id').value;
            const reason = document.getElementById('report-reason').value;
            const description = document.getElementById('report-description').value;

            if (!reason) {
                this.showError('Please select a reason for reporting');
                return;
            }

            // Map frontend reasons to backend reasons
            let mappedReason = reason;
            if (reason === 'harassment' || reason === 'inappropriate_content') {
                mappedReason = 'abuse';
            }

            const response = await fetch('/api/reports/submit', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    chatId: parseInt(chatId),
                    reportedUserId: parseInt(reportedUserId),
                    reason: mappedReason,
                    description
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to submit report');
            }

            // Close modal
            document.getElementById('report-modal').classList.remove('active');

            // Show success message
            if (result.autoResolved) {
                this.showSuccess(`Report submitted and resolved. ${result.penaltyApplied} credits penalty applied.`);
            } else {
                this.showSuccess('Report submitted for review.');
            }

            // Reset form
            document.getElementById('report-form').reset();

        } catch (error) {
            console.error('Error submitting report:', error);
            this.showError(error.message || 'Failed to submit report');
        }
    }

    openCancelTransactionModal() {
        if (!this.currentChatInfo) return;

        // Prefer snake_case from API (transaction_id), fallback to variants
        const txnId = this.currentChatInfo.transaction_id || this.currentChatInfo.transactionId || this.currentChatInfo.transactionid || null;
        const hidden = document.getElementById('cancel-transaction-id');
        if (hidden) hidden.value = txnId || '';

        if (!txnId) {
            this.showError('Unable to determine transaction ID for cancellation. Please refresh and try again.');
            return;
        }

        // Open modal
        const modal = document.getElementById('cancel-transaction-modal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    async submitCancellation() {
        try {
            const transactionId = document.getElementById('cancel-transaction-id').value;
            const reason = document.getElementById('cancellation-reason').value;

            if (!reason || reason.trim().length < 10) {
                this.showError('Cancellation reason must be at least 10 characters');
                return;
            }

            const response = await fetch('/api/cancellations/initiate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    transactionId: parseInt(transactionId),
                    reason: 'other',
                    description: reason,
                    refundType: 'full'
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to initiate cancellation');
            }

            // Close modal
            document.getElementById('cancel-transaction-modal').classList.remove('active');

            // Show success message
            this.showSuccess('Cancellation request sent. The other party has 48 hours to respond.');

            // Reset form
            document.getElementById('cancel-transaction-form').reset();

            // Close chat
            this.closeChat();

        } catch (error) {
            console.error('Error submitting cancellation:', error);
            this.showError(error.message || 'Failed to submit cancellation');
        }
    }

    async respondToCancellation(cancellationId, consent, btnEl = null) {
        try {
            if (!cancellationId) return;
            
            // Optimistic UI: disable buttons and show loading state
            if (btnEl) {
                const card = btnEl.closest('.cancellation-card');
                if (card) {
                    const allButtons = card.querySelectorAll('button[data-cancel-action]');
                    allButtons.forEach(b => {
                        b.disabled = true;
                        if (b === btnEl) {
                            b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
                        }
                    });
                }
            }

            const resp = await fetch(`/api/cancellations/${cancellationId}/respond`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ consent: !!consent })
            });
            const data = await resp.json();
            if (!resp.ok) {
                throw new Error(data.error || 'Failed to submit response');
            }

            if (this.cancellationStatusOverrides && typeof this.cancellationStatusOverrides.set === 'function') {
                this.cancellationStatusOverrides.set(cancellationId, consent ? 'approved' : 'rejected');
            }

            // Update the card UI immediately with the new status
            if (btnEl) {
                const card = btnEl.closest('.cancellation-card');
                if (card) {
                    const status = consent ? 'approved' : 'rejected';
                    card.setAttribute('data-status', status);
                    
                    // Update icon in title
                    const titleIcon = card.querySelector('.cancel-title i');
                    if (titleIcon) {
                        titleIcon.className = `fas ${consent ? 'fa-check-circle' : 'fa-times-circle'}`;
                    }
                    
                    // Replace entire actions div with status badge (no wrapping container)
                    const actionsDiv = card.querySelector('.cancel-actions');
                    if (actionsDiv) {
                        actionsDiv.outerHTML = `
                            <div class="cancel-status-badge status-${status}">
                                <i class="fas ${consent ? 'fa-check-circle' : 'fa-times-circle'}"></i> 
                                ${consent ? 'Approved' : 'Rejected'}
                            </div>
                        `;
                    }
                    
                    // Remove expiration message
                    const expiresDiv = card.querySelector('.cancel-expires');
                    if (expiresDiv) {
                        expiresDiv.remove();
                    }
                }
            }

            this.showSuccess(consent ? 'Cancellation approved' : 'Cancellation rejected');

            // Reload messages to ensure consistency with server state
            setTimeout(() => {
                this.loadMessages(this.currentChatId, 0);
                this.scrollToBottom(true);
            }, 1000);
            
        } catch (err) {
            console.error('Error responding to cancellation:', err);
            this.showError(err.message || 'Failed to respond to cancellation');
            
            // Restore buttons on error
            if (btnEl) {
                const card = btnEl.closest('.cancellation-card');
                if (card) {
                    const allButtons = card.querySelectorAll('button[data-cancel-action]');
                    allButtons.forEach(b => {
                        b.disabled = false;
                        const action = b.getAttribute('data-cancel-action');
                        b.innerHTML = action === 'approve' ? 
                            '<i class="fas fa-check"></i> Approve Cancellation' : 
                            '<i class="fas fa-times"></i> Reject';
                    });
                }
            }
        }
    }

    showNotification(message) {
        // Derive preview text (supports photo bundles)
        let preview = (message && message.message) ? message.message : '';
        if (message && (message.message_type === 'img' || (typeof preview === 'string' && preview.includes('/api/chat-attachments/')))) {
            const count = (preview || '').split('\n').filter(Boolean).length;
            preview = count > 1 ? `${count} Photos` : 'Photo';
        } else if (typeof preview === 'string') {
            preview = preview.substring(0, 100);
        }

        // Browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(`New message from ${message.sender_name}`, {
                body: preview,
                icon: message.sender_avatar || '/images/logo.png',
                tag: `chat-${message.chat_id}`
            });
            notification.onclick = () => {
                window.focus();
                this.openChat(message.chat_id);
                notification.close();
            };
        }

        // In-app Smart Toast (respect user preference)
        const popupPref = localStorage.getItem('chatPopupEnabled');
        if (popupPref !== 'off') {
            if (typeof window.showChatToast === 'function') {
                window.showChatToast({
                    chatId: message.chat_id,
                    senderName: message.sender_name,
                    senderAvatar: message.sender_avatar,
                    previewText: preview,
                    duration: 5000,
                    clickToOpen: true
                });
            } else if (window.requestManager) {
                // Fallback to existing generic toast
                requestManager.showToast(`New message from ${message.sender_name}`, 'info');
            }
        }
    }

    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    closeChat() {
        const modal = document.getElementById('chat-modal');
        if (modal) {
            modal.classList.remove('active');
        }

        // Leave socket room
        if (this.socket && this.currentChatId) {
            this.socket.emit('leave_chat', {
                chatId: this.currentChatId
            });
        }

        // After closing, refresh the Active Chats list so unread highlighting matches
        try {
            if (window.requestManager && typeof window.requestManager.refreshActiveChats === 'function') {
                const p = window.requestManager.refreshActiveChats();
                if (p && typeof p.catch === 'function') p.catch(() => {});
            }
        } catch (_) { /* noop */ }

        this.currentChatId = null;
        this.currentChatInfo = null;
        this.messages = [];
        this.messageOffset = 0;
    }

    showLoadingState() {
        const container = document.getElementById('chat-messages');
        if (container) {
            container.innerHTML = `
                <div class="loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading messages...</p>
                </div>
            `;
        }
    }

    showError(message) {
        if (window.requestManager) {
            requestManager.showToast(message, 'error');
        } else {
            // Fallback to custom toast if requestManager not available
            this.showCustomToast(message, 'error');
        }
    }

    showSuccess(message) {
        if (window.requestManager) {
            requestManager.showToast(message, 'success');
        } else {
            this.showCustomToast(message, 'success');
        }
    }

    showCustomToast(message, type = 'info') {
        // Create a simple toast notification
        const toast = document.createElement('div');
        toast.className = `custom-toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            animation: slideInRight 0.3s ease;
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    scrollToBottom(smooth = true) {
        requestAnimationFrame(() => {
            const container = document.getElementById('chat-messages');
            if (container) {
                if (smooth) {
                    container.scrollTo({
                        top: container.scrollHeight,
                        behavior: 'smooth'
                    });
                } else {
                    container.scrollTop = container.scrollHeight;
                }
            }
        });
    }

    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        const newHeight = Math.min(textarea.scrollHeight, 120);
        textarea.style.height = newHeight + 'px';
    }

    updateCharacterCount(textarea) {
        const charCount = document.getElementById('character-count');
        if (!charCount) return;

        const length = textarea.value.length;
        const maxLength = 1000;
        charCount.textContent = `${length} / ${maxLength}`;

        // Update styling based on character count
        charCount.classList.remove('warning', 'error');
        if (length > maxLength * 0.9) {
            charCount.classList.add('warning');
        }
        if (length >= maxLength) {
            charCount.classList.add('error');
        }
    }

    focusInput() {
        const input = document.getElementById('chat-message-input');
        if (input) {
            // Use setTimeout to ensure the modal is fully rendered
            setTimeout(() => {
                input.focus();
            }, 100);
        }
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) {
            return 'Just now';
        } else if (diffMins < 60) {
            return `${diffMins} min ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else if (diffDays === 1) {
            return `Yesterday ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateChatCache(chatId) {
        try {
            if (!chatId) return;
            if (!this.chatCache) {
                this.chatCache = new Map();
            }
            const key = parseInt(chatId);
            this.chatCache.set(key, {
                messages: Array.isArray(this.messages) ? [...this.messages] : [],
                hasMoreMessages: this.hasMoreMessages,
                messageOffset: this.messageOffset,
                currentChatInfo: this.currentChatInfo || null
            });
        } catch (e) {
            // Cache failures should never break chat
            console.error('updateChatCache error:', e);
        }
    }
}

// Initialize global ChatManager instance
window.chatManager = new ChatManager();

// Request notification permission is triggered within user actions (e.g., opening chat)

