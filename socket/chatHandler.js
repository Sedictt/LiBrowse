const { getConnection } = require('../config/database');

// Store active users and their socket IDs
const activeUsers = new Map(); // userId -> Set of socketIds
const userSockets = new Map(); // socketId -> userId

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log('New socket connection:', socket.id);

        // Authenticate socket connection
        socket.on('authenticate', async (data) => {
            try {
                const { userId } = data;
                
                if (!userId) {
                    socket.emit('error', { message: 'User ID required' });
                    return;
                }

                // Store user-socket mapping
                userSockets.set(socket.id, userId);
                
                if (!activeUsers.has(userId)) {
                    activeUsers.set(userId, new Set());
                }
                activeUsers.get(userId).add(socket.id);

                console.log(`User ${userId} authenticated with socket ${socket.id}`);
                
                // Notify others that user is online
                socket.broadcast.emit('user_online', { userId, isOnline: true });
                
                socket.emit('authenticated', { success: true });
            } catch (error) {
                console.error('Authentication error:', error);
                socket.emit('error', { message: 'Authentication failed' });
            }
        });

        // Join a chat room
        socket.on('join_chat', async (data) => {
            try {
                const { chatId, userId } = data;
                const connection = await getConnection();

                // Verify user has access to this chat
                const [access] = await connection.execute(`
                    SELECT c.id
                    FROM chats c
                    INNER JOIN transactions t ON c.transaction_id = t.id
                    WHERE c.id = ? AND (t.borrower_id = ? OR t.lender_id = ?)
                `, [chatId, userId, userId]);

                const participants = access[0];

                // Get participants for notification
                const [participantsRows] = await connection.execute(`
                    SELECT t.borrower_id, t.lender_id
                    FROM chats c
                    INNER JOIN transactions t ON c.transaction_id = t.id
                    WHERE c.id = ?
                `, [chatId]);

                connection.release();

                if (access.length === 0) {
                    socket.emit('error', { message: 'Access denied to this chat' });
                    return;
                }

                socket.join(`chat_${chatId}`);
                console.log(`User ${userId} joined chat ${chatId}`);
                
                socket.emit('joined_chat', { chatId });
            } catch (error) {
                console.error('Join chat error:', error);
                socket.emit('error', { message: 'Failed to join chat' });
            }
        });

        // Leave a chat room
        socket.on('leave_chat', (data) => {
            const { chatId } = data;
            socket.leave(`chat_${chatId}`);
            console.log(`Socket ${socket.id} left chat ${chatId}`);
        });

        // Send a message
        socket.on('send_message', async (data) => {
            try {
                const { chatId, message, messageType = 'text', userId } = data;

                if (!message || message.trim().length === 0) {
                    socket.emit('error', { message: 'Message cannot be empty' });
                    return;
                }

                if (message.length > 1000) {
                    socket.emit('error', { message: 'Message too long (max 1000 characters)' });
                    return;
                }

                const connection = await getConnection();

                // Verify access
                const [access] = await connection.execute(`
                    SELECT c.id, t.borrower_id, t.lender_id
                    FROM chats c
                    INNER JOIN transactions t ON c.transaction_id = t.id
                    WHERE c.id = ? AND (t.borrower_id = ? OR t.lender_id = ?)
                `, [chatId, userId, userId]);

                if (access.length === 0) {
                    connection.release();
                    socket.emit('error', { message: 'Access denied' });
                    return;
                }

                const participants = access[0];

                // Insert message
                const [result] = await connection.execute(`
                    INSERT INTO chat_messages (chat_id, sender_id, message, message_type, created)
                    VALUES (?, ?, ?, ?, NOW())
                `, [chatId, userId, message, messageType]);

                // Update chat timestamp
                await connection.execute(`
                    UPDATE chats SET updated = NOW() WHERE id = ?
                `, [chatId]);

                // Get the inserted message with sender info
                const [newMessage] = await connection.execute(`
                    SELECT 
                        cm.*,
                        CONCAT(u.first_name, ' ', u.last_name) as sender_name,
                        u.profile_image as sender_avatar
                    FROM chat_messages cm
                    LEFT JOIN users u ON cm.sender_id = u.id
                    WHERE cm.id = ?
                `, [result.insertId]);

                connection.release();

                // Broadcast to all users in the chat room
                io.to(`chat_${chatId}`).emit('new_message', {
                    chatId,
                    message: newMessage[0]
                });

                console.log(`Message sent in chat ${chatId} by user ${userId}`);

                // Notify both participants to refresh chat badge (real-time)
                if (participants) {
                    const payload = { chatId, type: 'message', messageId: newMessage[0]?.id };
                    emitToUser(participants.borrower_id, 'chat_activity', payload);
                    emitToUser(participants.lender_id, 'chat_activity', payload);
                }
            } catch (error) {
                console.error('Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Typing indicator
        socket.on('typing', async (data) => {
            try {
                const { chatId, userId, isTyping } = data;

                const connection = await getConnection();

                // Get user name
                const [user] = await connection.execute(`
                    SELECT CONCAT(first_name, ' ', last_name) as name FROM users WHERE id = ?
                `, [userId]);

                connection.release();

                if (user.length === 0) return;

                // Broadcast to others in the chat (not to sender)
                socket.to(`chat_${chatId}`).emit('user_typing', {
                    chatId,
                    userId,
                    userName: user[0].name,
                    isTyping
                });
            } catch (error) {
                console.error('Typing indicator error:', error);
            }
        });

        // Mark message as read
        socket.on('mark_read', async (data) => {
            try {
                const { chatId, messageId, userId } = data;

                const connection = await getConnection();

                // Verify access and update
                await connection.execute(`
                    UPDATE chat_messages cm
                    INNER JOIN chats c ON cm.chat_id = c.id
                    INNER JOIN transactions t ON c.transaction_id = t.id
                    SET cm.is_read = 1, cm.read_at = NOW()
                    WHERE cm.id = ? 
                    AND cm.chat_id = ?
                    AND cm.sender_id != ?
                    AND (t.borrower_id = ? OR t.lender_id = ?)
                `, [messageId, chatId, userId, userId, userId]);

                const [updated] = await connection.execute(`
                    SELECT read_at FROM chat_messages WHERE id = ?
                `, [messageId]);

                // Get participants for notification
                const [participantsRows] = await connection.execute(`
                    SELECT t.borrower_id, t.lender_id
                    FROM chats c
                    INNER JOIN transactions t ON c.transaction_id = t.id
                    WHERE c.id = ?
                `, [chatId]);

                connection.release();

                // Broadcast read receipt to all in chat
                io.to(`chat_${chatId}`).emit('message_read', {
                    chatId,
                    messageId,
                    readAt: updated[0]?.read_at,
                    readBy: userId
                });

                // Notify both participants to refresh chat badge (real-time)
                const participants = participantsRows && participantsRows[0];
                if (participants) {
                    const payload = { chatId, type: 'read', messageId };
                    emitToUser(participants.borrower_id, 'chat_activity', payload);
                    emitToUser(participants.lender_id, 'chat_activity', payload);
                }
            } catch (error) {
                console.error('Mark read error:', error);
            }
        });

        // Mark all messages in chat as read
        socket.on('mark_all_read', async (data) => {
            try {
                const { chatId, userId } = data;

                const connection = await getConnection();

                // Update all unread messages
                await connection.execute(`
                    UPDATE chat_messages cm
                    INNER JOIN chats c ON cm.chat_id = c.id
                    INNER JOIN transactions t ON c.transaction_id = t.id
                    SET cm.is_read = 1, cm.read_at = NOW()
                    WHERE cm.chat_id = ?
                    AND cm.sender_id != ?
                    AND cm.is_read = 0
                    AND (t.borrower_id = ? OR t.lender_id = ?)
                `, [chatId, userId, userId, userId]);

                // Get participants for notification
                const [participantsRows] = await connection.execute(`
                    SELECT t.borrower_id, t.lender_id
                    FROM chats c
                    INNER JOIN transactions t ON c.transaction_id = t.id
                    WHERE c.id = ?
                `, [chatId]);

                connection.release();

                // Broadcast to chat
                io.to(`chat_${chatId}`).emit('all_messages_read', {
                    chatId,
                    readBy: userId
                });

                // Notify both participants to refresh chat badge (real-time)
                const participants = participantsRows && participantsRows[0];
                if (participants) {
                    const payload = { chatId, type: 'read_all' };
                    emitToUser(participants.borrower_id, 'chat_activity', payload);
                    emitToUser(participants.lender_id, 'chat_activity', payload);
                }
            } catch (error) {
                console.error('Mark all read error:', error);
            }
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            const userId = userSockets.get(socket.id);
            
            if (userId) {
                const userSocketSet = activeUsers.get(userId);
                if (userSocketSet) {
                    userSocketSet.delete(socket.id);
                    
                    // If user has no more active sockets, mark as offline
                    if (userSocketSet.size === 0) {
                        activeUsers.delete(userId);
                        socket.broadcast.emit('user_online', { userId, isOnline: false });
                        console.log(`User ${userId} is now offline`);
                    }
                }
                
                userSockets.delete(socket.id);
            }
            
            console.log('Socket disconnected:', socket.id);
        });
    });

    // Emit to all sockets of a specific user
    const emitToUser = (userId, event, data) => {
        try {
            const sockets = activeUsers.get(userId);
            if (!sockets) return;
            sockets.forEach(sockId => {
                io.to(sockId).emit(event, data);
            });
        } catch (e) {
            console.error('emitToUser error:', e);
        }
    };

    // Helper function to check if user is online
    const isUserOnline = (userId) => {
        return activeUsers.has(userId) && activeUsers.get(userId).size > 0;
    };

    // Helper function to get all online users
    const getOnlineUsers = () => {
        return Array.from(activeUsers.keys());
    };

    return {
        isUserOnline,
        getOnlineUsers
    };
};

