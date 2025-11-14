const express = require('express');
const router = express.Router();
const { getConnection } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Get all active chats for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        const userId = req.user.id;
        const connection = await getConnection();

        const [chats] = await connection.execute(`
            SELECT 
                c.id,
                c.transaction_id,
                c.is_active,
                c.created,
                c.updated,
                t.book_id,
                t.borrower_id,
                t.lender_id,
                t.status as transaction_status,
                b.title as book_title,
                b.cover_image as book_cover,
                CASE 
                    WHEN t.borrower_id = ? THEN t.lender_id
                    ELSE t.borrower_id
                END as other_user_id,
                CASE 
                    WHEN t.borrower_id = ? THEN CONCAT(lender.first_name, ' ', lender.last_name)
                    ELSE CONCAT(borrower.first_name, ' ', borrower.last_name)
                END as other_user_name,
                CASE 
                    WHEN t.borrower_id = ? THEN lender.profile_image
                    ELSE borrower.profile_image
                END as other_user_avatar,
                (SELECT message FROM chat_messages 
                 WHERE chat_id = c.id 
                 ORDER BY id DESC LIMIT 1) as last_message,
                (SELECT created FROM chat_messages 
                 WHERE chat_id = c.id 
                 ORDER BY id DESC LIMIT 1) as last_message_time,
                (SELECT message_type FROM chat_messages 
                 WHERE chat_id = c.id 
                 ORDER BY id DESC LIMIT 1) as last_message_type,
                (SELECT COUNT(*) FROM chat_messages 
                 WHERE chat_id = c.id 
                 AND sender_id != ? 
                 AND is_read = 0) as unread_count
            FROM chats c
            INNER JOIN transactions t ON c.transaction_id = t.id
            INNER JOIN books b ON t.book_id = b.id
            INNER JOIN users borrower ON t.borrower_id = borrower.id
            INNER JOIN users lender ON t.lender_id = lender.id
            WHERE (t.borrower_id = ? OR t.lender_id = ?)
            AND c.is_active = 1
            ORDER BY c.updated DESC
        `, [userId, userId, userId, userId, userId, userId]);

        connection.release();
        res.json(chats);
    } catch (error) {
        console.error('Error fetching chats:', error);
        res.status(500).json({ error: 'Failed to fetch chats' });
    }
});

// Get chat details by ID
router.get('/:chatId/info', authenticateToken, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        const userId = req.user.id;
        const { chatId } = req.params;
        const connection = await getConnection();

        const [chats] = await connection.execute(`
            SELECT 
                c.*,
                t.book_id,
                t.borrower_id,
                t.lender_id,
                t.status as transaction_status,
                b.title as book_title,
                b.cover_image as book_cover,
                CASE 
                    WHEN t.borrower_id = ? THEN t.lender_id
                    ELSE t.borrower_id
                END as other_user_id,
                CASE 
                    WHEN t.borrower_id = ? THEN CONCAT(lender.first_name, ' ', lender.last_name)
                    ELSE CONCAT(borrower.first_name, ' ', borrower.last_name)
                END as other_user_name,
                CASE
                    WHEN t.borrower_id = ? THEN lender.profile_image
                    ELSE borrower.profile_image
                END as other_user_avatar
            FROM chats c
            INNER JOIN transactions t ON c.transaction_id = t.id
            INNER JOIN books b ON t.book_id = b.id
            INNER JOIN users borrower ON t.borrower_id = borrower.id
            INNER JOIN users lender ON t.lender_id = lender.id
            WHERE c.id = ?
            AND (t.borrower_id = ? OR t.lender_id = ?)
        `, [userId, userId, userId, chatId, userId, userId]);

        if (chats.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Chat not found or access denied' });
        }

        connection.release();
        res.json(chats[0]);
    } catch (error) {
        console.error('Error fetching chat info:', error);
        res.status(500).json({ error: 'Failed to fetch chat info' });
    }
});

// Get messages for a chat with pagination
router.get('/:chatId/messages', authenticateToken, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        const userId = req.user.id;
        const { chatId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const markReadParam = req.query.markRead;
        const shouldMarkRead = (markReadParam === undefined || markReadParam === '1');
        
        const connection = await getConnection();

        // Verify user has access to this chat
        const [chatAccess] = await connection.execute(`
            SELECT c.id
            FROM chats c
            INNER JOIN transactions t ON c.transaction_id = t.id
            WHERE c.id = ? AND (t.borrower_id = ? OR t.lender_id = ?)
        `, [chatId, userId, userId]);

        if (chatAccess.length === 0) {
            connection.release();
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get total message count
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as total FROM chat_messages WHERE chat_id = ?
        `, [chatId]);

        const total = countResult[0].total;

        // Get messages
        const [messages] = await connection.execute(`
            SELECT 
                cm.*,
                CONCAT(u.first_name, ' ', u.last_name) as sender_name,
                u.profile_image as sender_avatar
            FROM chat_messages cm
            LEFT JOIN users u ON cm.sender_id = u.id
            WHERE cm.chat_id = ?
            ORDER BY cm.created DESC
            LIMIT ? OFFSET ?
        `, [chatId, limit, offset]);

        // Mark unread messages as read (only when requested)
        if (shouldMarkRead) {
            await connection.execute(`
                UPDATE chat_messages
                SET is_read = 1, read_at = NOW()
                WHERE chat_id = ? AND sender_id != ? AND is_read = 0
            `, [chatId, userId]);
        }

        connection.release();

        res.json({
            messages: messages.reverse(), // Reverse to show oldest first
            total,
            has_more: (offset + limit) < total
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Send a message
router.post('/:chatId/messages', [
    authenticateToken,
    body('message').trim().isLength({ min: 1, max: 1000 }).withMessage('Message must be 1-1000 characters'),
    body('message_type').optional().isIn(['text', 'img', 'sys']).withMessage('Invalid message type')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const userId = req.user.id;
        const { chatId } = req.params;
        const { message, message_type = 'text' } = req.body;

        const connection = await getConnection();

        // Verify user has access to this chat
        const [chatAccess] = await connection.execute(`
            SELECT c.id, t.borrower_id, t.lender_id
            FROM chats c
            INNER JOIN transactions t ON c.transaction_id = t.id
            WHERE c.id = ? AND (t.borrower_id = ? OR t.lender_id = ?)
        `, [chatId, userId, userId]);

        if (chatAccess.length === 0) {
            connection.release();
            return res.status(403).json({ error: 'Access denied' });
        }

        // Insert message
        const [result] = await connection.execute(`
            INSERT INTO chat_messages (chat_id, sender_id, message, message_type, created)
            VALUES (?, ?, ?, ?, NOW())
        `, [chatId, userId, message, message_type]);

        // Update chat updated timestamp
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

        // Broadcast to chat room so recipients get the message even if sender used HTTP fallback
        try {
            const io = req.app.get('socketio');
            if (io) {
                io.to(`chat_${chatId}`).emit('new_message', {
                    chatId: parseInt(chatId),
                    message: newMessage[0]
                });
                // Also notify clients to refresh badges/lists
                io.emit('chat_activity', {
                    chatId: parseInt(chatId),
                    type: 'message',
                    messageId: newMessage[0]?.id
                });
            }
        } catch (e) {
            console.error('HTTP send broadcast error:', e);
        }

        res.status(201).json(newMessage[0]);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Mark a specific message as read
router.put('/:chatId/messages/:messageId/read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { chatId, messageId } = req.params;

        const connection = await getConnection();

        // Verify user has access and message exists
        const [messageCheck] = await connection.execute(`
            SELECT cm.id
            FROM chat_messages cm
            INNER JOIN chats c ON cm.chat_id = c.id
            INNER JOIN transactions t ON c.transaction_id = t.id
            WHERE cm.id = ? 
            AND cm.chat_id = ?
            AND cm.sender_id != ?
            AND (t.borrower_id = ? OR t.lender_id = ?)
        `, [messageId, chatId, userId, userId, userId]);

        if (messageCheck.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Message not found or access denied' });
        }

        // Mark as read
        await connection.execute(`
            UPDATE chat_messages
            SET is_read = 1, read_at = NOW()
            WHERE id = ?
        `, [messageId]);

        const [updated] = await connection.execute(`
            SELECT read_at FROM chat_messages WHERE id = ?
        `, [messageId]);

        connection.release();

        res.json({
            success: true,
            read_at: updated[0].read_at
        });
    } catch (error) {
        console.error('Error marking message as read:', error);
        res.status(500).json({ error: 'Failed to mark message as read' });
    }
});

module.exports = router;

