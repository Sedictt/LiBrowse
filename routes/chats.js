// PLV BookSwap - Chat Routes
const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { getConnection } = require('../config/database');

const router = express.Router();

// Helper function to create notification
async function createNotification(connection, userId, title, message, type, relatedId = null) {
    await connection.execute(`
        INSERT INTO notifications (user_id, title, message, type, related_id, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
    `, [userId, title, message, type, relatedId]);
}

// GET /api/chats - Get user's active chats
router.get('/', authenticateToken, async (req, res) => {
    try {
        const connection = await getConnection();
        
        const [chats] = await connection.execute(`
            SELECT 
                c.*,
                t.book_id,
                t.borrower_id,
                t.lender_id,
                t.status as transaction_status,
                b.title as book_title,
                b.cover_image,
                CASE 
                    WHEN t.borrower_id = ? THEN CONCAT(lender.first_name, ' ', lender.last_name)
                    ELSE CONCAT(borrower.first_name, ' ', borrower.last_name)
                END as other_user_name,
                CASE 
                    WHEN t.borrower_id = ? THEN t.lender_id
                    ELSE t.borrower_id
                END as other_user_id,
                (SELECT COUNT(*) FROM chat_messages cm WHERE cm.chat_id = c.id AND cm.sender_id != ? AND cm.is_read = FALSE) as unread_count,
                (SELECT message FROM chat_messages cm WHERE cm.chat_id = c.id ORDER BY cm.created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM chat_messages cm WHERE cm.chat_id = c.id ORDER BY cm.created_at DESC LIMIT 1) as last_message_time
            FROM chats c
            JOIN transactions t ON c.transaction_id = t.id
            JOIN books b ON t.book_id = b.id
            JOIN users borrower ON t.borrower_id = borrower.id
            JOIN users lender ON t.lender_id = lender.id
            WHERE (t.borrower_id = ? OR t.lender_id = ?) 
                AND c.is_active = TRUE
                AND t.status IN ('approved', 'borrowed', 'returned')
            ORDER BY c.updated_at DESC
        `, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]);
        
        connection.release();
        res.json(chats);
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ error: 'Failed to load chats' });
    }
});

// GET /api/chats/:id/messages - Get chat messages
router.get('/:id/messages', authenticateToken, async (req, res) => {
    try {
        const chatId = req.params.id;
        const connection = await getConnection();
        
        // Verify user is part of this chat
        const [chats] = await connection.execute(`
            SELECT c.*, t.borrower_id, t.lender_id
            FROM chats c
            JOIN transactions t ON c.transaction_id = t.id
            WHERE c.id = ? AND (t.borrower_id = ? OR t.lender_id = ?)
        `, [chatId, req.user.id, req.user.id]);
        
        if (chats.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Chat not found or access denied' });
        }
        
        // Get messages
        const [messages] = await connection.execute(`
            SELECT 
                cm.*,
                CONCAT(u.first_name, ' ', u.last_name) as sender_name
            FROM chat_messages cm
            JOIN users u ON cm.sender_id = u.id
            WHERE cm.chat_id = ?
            ORDER BY cm.created_at ASC
        `, [chatId]);
        
        // Mark messages as read for current user
        await connection.execute(`
            UPDATE chat_messages 
            SET is_read = TRUE 
            WHERE chat_id = ? AND sender_id != ?
        `, [chatId, req.user.id]);
        
        connection.release();
        res.json(messages);
    } catch (error) {
        console.error('Get chat messages error:', error);
        res.status(500).json({ error: 'Failed to load messages' });
    }
});

// POST /api/chats/:id/messages - Send message
router.post('/:id/messages', [
    authenticateToken,
    body('message').trim().isLength({ min: 1, max: 1000 }).withMessage('Message must be 1-1000 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }
        
        const chatId = req.params.id;
        const { message } = req.body;
        const connection = await getConnection();
        
        // Verify user is part of this chat
        const [chats] = await connection.execute(`
            SELECT c.*, t.borrower_id, t.lender_id, b.title as book_title
            FROM chats c
            JOIN transactions t ON c.transaction_id = t.id
            JOIN books b ON t.book_id = b.id
            WHERE c.id = ? AND (t.borrower_id = ? OR t.lender_id = ?) AND c.is_active = TRUE
        `, [chatId, req.user.id, req.user.id]);
        
        if (chats.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Chat not found or access denied' });
        }
        
        const chat = chats[0];
        const otherUserId = chat.borrower_id === req.user.id ? chat.lender_id : chat.borrower_id;
        
        // Insert message
        const [result] = await connection.execute(`
            INSERT INTO chat_messages (chat_id, sender_id, message, created_at)
            VALUES (?, ?, ?, NOW())
        `, [chatId, req.user.id, message]);
        
        // Update chat timestamp
        await connection.execute(`
            UPDATE chats SET updated_at = NOW() WHERE id = ?
        `, [chatId]);
        
        // Create notification for other user
        await createNotification(
            connection,
            otherUserId,
            'New Message',
            `New message about "${chat.book_title}"`,
            'chat_message',
            chatId
        );
        
        // Get the created message with sender info
        const [newMessage] = await connection.execute(`
            SELECT 
                cm.*,
                CONCAT(u.first_name, ' ', u.last_name) as sender_name
            FROM chat_messages cm
            JOIN users u ON cm.sender_id = u.id
            WHERE cm.id = ?
        `, [result.insertId]);
        
        connection.release();
        res.status(201).json(newMessage[0]);
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// POST /api/chats/:id/report - Report chat/user
router.post('/:id/report', [
    authenticateToken,
    body('reported_user_id').isInt({ min: 1 }).withMessage('Valid reported user ID is required'),
    body('reason').isIn(['spam', 'harassment', 'inappropriate_content', 'scam', 'other']).withMessage('Valid reason is required'),
    body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
    body('message_id').optional().isInt({ min: 1 }).withMessage('Valid message ID required if provided')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }
        
        const chatId = req.params.id;
        const { reported_user_id, reason, description, message_id } = req.body;
        const connection = await getConnection();
        
        // Verify user is part of this chat
        const [chats] = await connection.execute(`
            SELECT c.*, t.borrower_id, t.lender_id
            FROM chats c
            JOIN transactions t ON c.transaction_id = t.id
            WHERE c.id = ? AND (t.borrower_id = ? OR t.lender_id = ?)
        `, [chatId, req.user.id, req.user.id]);
        
        if (chats.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Chat not found or access denied' });
        }
        
        // Verify reported user is part of this chat
        const chat = chats[0];
        if (reported_user_id !== chat.borrower_id && reported_user_id !== chat.lender_id) {
            connection.release();
            return res.status(400).json({ error: 'Can only report users in this chat' });
        }
        
        // Check if user already reported this chat/user
        const [existingReports] = await connection.execute(`
            SELECT id FROM chat_reports 
            WHERE chat_id = ? AND reporter_id = ? AND reported_user_id = ?
        `, [chatId, req.user.id, reported_user_id]);
        
        if (existingReports.length > 0) {
            connection.release();
            return res.status(400).json({ error: 'You have already reported this user in this chat' });
        }
        
        // Create report
        await connection.execute(`
            INSERT INTO chat_reports (chat_id, reporter_id, reported_user_id, message_id, reason, description, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [chatId, req.user.id, reported_user_id, message_id || null, reason, description || null]);
        
        connection.release();
        res.json({ message: 'Report submitted successfully. Our team will review it shortly.' });
    } catch (error) {
        console.error('Report chat error:', error);
        res.status(500).json({ error: 'Failed to submit report' });
    }
});

module.exports = router;
