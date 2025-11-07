/**
 * Socket.IO Client Initialization
 * Handles WebSocket connection for real-time chat
 */

let socket = null;
let isSocketConnected = false;

/**
 * Initialize Socket.IO connection
 */
function initializeSocket() {
    if (socket) {
        console.log('Socket already initialized');
        return socket;
    }

    console.log('Initializing Socket.IO client...');

    socket = io({
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        timeout: 10000
    });

    // Connection successful
    socket.on('connect', () => {
        console.log('✅ Socket.IO connected:', socket.id);
        isSocketConnected = true;

        if (authManager && authManager.currentUser) {
            socket.emit('authenticate', {
                userId: authManager.currentUser.id
            });
        }

        if (window.app) {
            const p = window.app.updateChatBadge();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        }

        // Rejoin current chat room on initial connect if a chat is already open
        if (window.chatManager && window.chatManager.currentChatId && authManager && authManager.currentUser) {
            socket.emit('join_chat', {
                chatId: window.chatManager.currentChatId,
                userId: authManager.currentUser.id
            });
        }
    });

    // Authentication successful
    socket.on('authenticated', (data) => {
        console.log('✅ Socket authenticated:', data);
    });

    // Disconnection
    socket.on('disconnect', (reason) => {
        console.log('❌ Socket.IO disconnected:', reason);
        isSocketConnected = false;

        if (reason === 'io server disconnect') {
            // Server disconnected, manually reconnect
            socket.connect();
        }
    });

    // Reconnection attempt
    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`🔄 Reconnection attempt ${attemptNumber}...`);
    });

    // Reconnection successful
    socket.on('reconnect', (attemptNumber) => {
        console.log(`✅ Reconnected after ${attemptNumber} attempts`);
        isSocketConnected = true;

        if (authManager && authManager.currentUser) {
            socket.emit('authenticate', {
                userId: authManager.currentUser.id
            });
        }

        // Rejoin current chat if open
        if (window.chatManager && window.chatManager.currentChatId) {
            socket.emit('join_chat', {
                chatId: window.chatManager.currentChatId,
                userId: authManager.currentUser.id
            });
        }

        if (window.app) {
            const p = window.app.updateChatBadge();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        }
    });

    // Reconnection failed
    socket.on('reconnect_failed', () => {
        console.error('❌ Failed to reconnect to Socket.IO');
        isSocketConnected = false;
    });

    // Connection error
    socket.on('connect_error', (error) => {
        console.error('Socket.IO connection error:', error);
        isSocketConnected = false;
    });

    // Server error
    socket.on('error', (error) => {
        console.error('Socket.IO error:', error);
        if (window.chatManager) {
            window.chatManager.showError(error.message || 'Connection error');
        }
    });

    socket.on('chat_activity', () => {
        if (window.app) {
            const p = window.app.updateChatBadge();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        }

        // Refresh chats so previews/unread counts update even if the tab isn't currently active
        if (window.requestManager) {
            const fn = window.requestManager.refreshActiveChats || window.requestManager.loadRequests;
            const p2 = fn.call(window.requestManager);
            if (p2 && typeof p2.catch === 'function') p2.catch(() => {});
        }
    });

    return socket;
}

/**
 * Get the current socket instance
 */
function getSocket() {
    if (!socket) {
        return initializeSocket();
    }
    return socket;
}

/**
 * Check if socket is connected
 */
function isConnected() {
    return isSocketConnected && socket && socket.connected;
}

/**
 * Disconnect socket
 */
function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
        isSocketConnected = false;
        console.log('Socket.IO disconnected manually');
    }
}

// Auto-initialize when DOM is ready and user is logged in
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for authManager to initialize
    setTimeout(() => {
        if (authManager && authManager.currentUser) {
            initializeSocket();
        }
    }, 500);
});

// Initialize socket when user logs in
document.addEventListener('userLoggedIn', () => {
    if (!socket || !isSocketConnected) {
        initializeSocket();
    }
});

// Disconnect socket when user logs out
document.addEventListener('userLoggedOut', () => {
    disconnectSocket();
});

