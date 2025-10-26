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
        this.messageLimit = 50;
        this.hasMoreMessages = false;
        this.isLoadingMessages = false;

        this.init();
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
        this.socket.on('user_typing', (data) => this.handleUserTyping(data));
        this.socket.on('user_online', (data) => this.handleUserOnline(data));
        this.socket.on('joined_chat', (data) => this.handleJoinedChat(data));

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
                this.handleFileUpload(e.target.files[0]);
            }
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
            if (e.key === 'Escape' &&
                document.getElementById('chat-modal').classList.contains('active')) {
                this.closeChat();
            }
        });
    }

    async openChat(chatId) {
        try {
            console.log('Opening chat:', chatId);

            this.currentChatId = chatId;
            this.messages = [];
            this.messageOffset = 0;

            // Show modal
            const modal = document.getElementById('chat-modal');
            if (!modal) {
                console.error('Chat modal not found');
                return;
            }
            modal.classList.add('active');

            // Show loading state
            this.showLoadingState();

            // Load chat info
            await this.loadChatInfo(chatId);

            // Load messages
            await this.loadMessages(chatId);

            // Join socket room
            if (this.socket && authManager.currentUser) {
                this.socket.emit('join_chat', {
                    chatId: chatId,
                    userId: authManager.currentUser.id
                });
            }

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
                }
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

            const response = await fetch(`/api/chats/${chatId}/messages?limit=${this.messageLimit}&offset=${offset}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load messages');
            }

            const data = await response.json();

            if (offset === 0) {
                this.messages = data.messages;
            } else {
                // Prepend older messages
                this.messages = [...data.messages, ...this.messages];
            }

            this.hasMoreMessages = data.has_more;
            this.messageOffset = offset + data.messages.length;

            this.renderMessages();

            // Scroll to bottom only on initial load
            if (offset === 0) {
                this.scrollToBottom();
            }

            this.isLoadingMessages = false;

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
                avatar.src = '/images/default-avatar.png';
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

        return `
            <div class="chat-message ${isOwnMessage ? 'own-message' : 'other-message'} ${stateClass} message-${position}"
                 data-message-id="${message.id}"
                 data-state="${messageState}">
                <div class="message-content">${this.escapeHtml(message.message)}</div>
                ${messageState === 'error' ? '<div class="message-error-indicator" title="Failed to send"><i class="fas fa-exclamation-circle"></i></div>' : ''}
            </div>
        `;
    }

    renderSystemMessage(message) {
        return `
            <div class="chat-message message-system">
                <i class="fas fa-info-circle"></i>
                <span>${this.escapeHtml(message.message)}</span>
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
        if (data.chatId !== this.currentChatId) {
            // Message for different chat, show notification
            this.showNotification(data.message);
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

            this.renderMessages();

            // Only auto-scroll if user was near bottom or it's their own message
            if (isNearBottom || data.message.sender_id === authManager.currentUser.id) {
                this.scrollToBottom(true);
            }
        }

        // Mark as read if chat is open
        if (data.message.sender_id !== authManager.currentUser.id) {
            this.markMessageAsRead(data.message.id);
        }

        // Play notification sound (optional)
        // this.playNotificationSound();
    }

    handleMessageRead(data) {
        if (data.chatId !== this.currentChatId) return;

        // Update message read status
        const message = this.messages.find(m => m.id === data.messageId);
        if (message) {
            message.is_read = true;
            message.read_at = data.readAt;
            this.renderMessages();
        }
    }

    handleUserTyping(data) {
        if (data.chatId !== this.currentChatId) return;

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

    async handleFileUpload(file) {
        if (!file) return;

        // Validate file
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            this.showError('File too large (max 5MB)');
            return;
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            this.showError('Invalid file type. Only images and PDFs allowed.');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`/api/chats/${this.currentChatId}/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error('File upload failed');
            }

            const data = await response.json();

            // Send message with file URL
            this.socket.emit('send_message', {
                chatId: this.currentChatId,
                message: data.fileUrl,
                messageType: 'img',
                userId: authManager.currentUser.id
            });

            // Clear file input
            document.getElementById('file-input').value = '';

        } catch (error) {
            console.error('Error uploading file:', error);
            this.showError('Failed to upload file');
        }
    }

    showNotification(message) {
        // Browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(`New message from ${message.sender_name}`, {
                body: message.message.substring(0, 100),
                icon: '/images/logo.png',
                tag: `chat-${message.chat_id}`
            });

            notification.onclick = () => {
                window.focus();
                this.openChat(message.chat_id);
                notification.close();
            };
        }

        // In-app toast notification
        if (window.requestManager) {
            requestManager.showToast(`New message from ${message.sender_name}`, 'info');
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
}

// Initialize global ChatManager instance
window.chatManager = new ChatManager();

// Request notification permission on load
document.addEventListener('DOMContentLoaded', () => {
    if (window.chatManager) {
        window.chatManager.requestNotificationPermission();
    }
});

