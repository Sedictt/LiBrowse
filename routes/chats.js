const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get all conversations for a user
router.get('/conversations', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [conversations] = await pool.query(`
            SELECT 
                c.*,
                u1.username as user1_name,
                u2.username as user2_name,
                u1.email as user1_email,
                u2.email as user2_email,
                (SELECT content FROM chats WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM chats WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
                (SELECT COUNT(*) FROM chats WHERE conversation_id = c.id AND sender_id != ? AND is_read = FALSE) as unread_count
            FROM conversations c
            LEFT JOIN users u1 ON c.user1_id = u1.id
            LEFT JOIN users u2 ON c.user2_id = u2.id
            WHERE c.user1_id = ? OR c.user2_id = ?
            ORDER BY c.updated_at DESC
        `, [userId, userId, userId]);
        
        res.json({ conversations });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Get or create a conversation between two users
router.post('/conversations', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { otherUserId } = req.body;
        
        if (!otherUserId) {
            return res.status(400).json({ error: 'Other user ID is required' });
        }
        
        // Check if conversation already exists
        const [existing] = await pool.query(`
            SELECT * FROM conversations
            WHERE (user1_id = ? AND user2_id = ?)
               OR (user1_id = ? AND user2_id = ?)
        `, [userId, otherUserId, otherUserId, userId]);
        
        if (existing.length > 0) {
            return res.json({ conversation: existing[0] });
        }
        
        // Create new conversation
        const [result] = await pool.query(`
            INSERT INTO conversations (user1_id, user2_id)
            VALUES (?, ?)
        `, [userId, otherUserId]);
        
        const [conversation] = await pool.query(`
            SELECT 
                c.*,
                u1.username as user1_name,
                u2.username as user2_name
            FROM conversations c
            LEFT JOIN users u1 ON c.user1_id = u1.id
            LEFT JOIN users u2 ON c.user2_id = u2.id
            WHERE c.id = ?
        `, [result.insertId]);
        
        res.status(201).json({ conversation: conversation[0] });
    } catch (error) {
        console.error('Error creating conversation:', error);
        res.status(500).json({ error: 'Failed to create conversation' });
    }
});

// Get messages in a conversation
router.get('/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;
        const { limit = 50, offset = 0 } = req.query;
        
        // Verify user is part of the conversation
        const [conversation] = await pool.query(`
            SELECT * FROM conversations
            WHERE id = ? AND (user1_id = ? OR user2_id = ?)
        `, [conversationId, userId, userId]);
        
        if (conversation.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const [messages] = await pool.query(`
            SELECT 
                c.*,
                u.username as sender_name
            FROM chats c
            LEFT JOIN users u ON c.sender_id = u.id
            WHERE c.conversation_id = ?
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `, [conversationId, parseInt(limit), parseInt(offset)]);
        
        // Mark messages as read
        await pool.query(`
            UPDATE chats
            SET is_read = TRUE
            WHERE conversation_id = ? AND sender_id != ? AND is_read = FALSE
        `, [conversationId, userId]);
        
        res.json({ messages: messages.reverse() });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Send a message
router.post('/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;
        const { content } = req.body;
        
        if (!content || content.trim() === '') {
            return res.status(400).json({ error: 'Message content is required' });
        }
        
        // Verify user is part of the conversation
        const [conversation] = await pool.query(`
            SELECT * FROM conversations
            WHERE id = ? AND (user1_id = ? OR user2_id = ?)
        `, [conversationId, userId, userId]);
        
        if (conversation.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Insert message
        const [result] = await pool.query(`
            INSERT INTO chats (conversation_id, sender_id, content)
            VALUES (?, ?, ?)
        `, [conversationId, userId, content]);
        
        // Update conversation timestamp
        await pool.query(`
            UPDATE conversations
            SET updated_at = NOW()
            WHERE id = ?
        `, [conversationId]);
        
        const [message] = await pool.query(`
            SELECT 
                c.*,
                u.username as sender_name
            FROM chats c
            LEFT JOIN users u ON c.sender_id = u.id
            WHERE c.id = ?
        `, [result.insertId]);
        
        // Create notification for the other user
        const otherUserId = conversation[0].user1_id === userId 
            ? conversation[0].user2_id 
            : conversation[0].user1_id;
        
        await pool.query(`
            INSERT INTO notifications (user_id, type, content)
            VALUES (?, 'message', ?)
        `, [otherUserId, `New message from ${req.user.username}`]);
        
        res.status(201).json({ message: message[0] });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Delete a message
router.delete('/messages/:messageId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { messageId } = req.params;
        
        // Verify message belongs to user
        const [message] = await pool.query(`
            SELECT * FROM chats WHERE id = ? AND sender_id = ?
        `, [messageId, userId]);
        
        if (message.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        await pool.query('DELETE FROM chats WHERE id = ?', [messageId]);
        
        res.json({ message: 'Message deleted successfully' });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// Mark conversation as read
router.put('/conversations/:conversationId/read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;
        
        await pool.query(`
            UPDATE chats
            SET is_read = TRUE
            WHERE conversation_id = ? AND sender_id != ?
        `, [conversationId, userId]);
        
        res.json({ message: 'Conversation marked as read' });
    } catch (error) {
        console.error('Error marking conversation as read:', error);
        res.status(500).json({ error: 'Failed to mark conversation as read' });
    }
});

module.exports = router;
