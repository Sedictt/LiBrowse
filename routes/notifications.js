const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get all notifications for a user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 20, offset = 0, unreadOnly = false } = req.query;
        
        let query = `
            SELECT * FROM notifications
            WHERE user_id = ?
        `;
        
        if (unreadOnly === 'true') {
            query += ' AND is_read = FALSE';
        }
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        
        const [notifications] = await pool.query(query, [userId, parseInt(limit), parseInt(offset)]);
        
        // Get unread count
        const [countResult] = await pool.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );
        
        res.json({ 
            notifications,
            unreadCount: countResult[0].count
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Get unread notification count
router.get('/unread-count', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [result] = await pool.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );
        
        res.json({ count: result[0].count });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({ error: 'Failed to fetch unread count' });
    }
});

// Mark notification as read
router.put('/:notificationId/read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { notificationId } = req.params;
        
        // Verify notification belongs to user
        const [notification] = await pool.query(
            'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
            [notificationId, userId]
        );
        
        if (notification.length === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        
        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = ?',
            [notificationId]
        );
        
        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// Mark all notifications as read
router.put('/read-all', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );
        
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
});

// Delete a notification
router.delete('/:notificationId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { notificationId } = req.params;
        
        // Verify notification belongs to user
        const [notification] = await pool.query(
            'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
            [notificationId, userId]
        );
        
        if (notification.length === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        
        await pool.query('DELETE FROM notifications WHERE id = ?', [notificationId]);
        
        res.json({ message: 'Notification deleted successfully' });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

// Delete all read notifications
router.delete('/read/all', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        await pool.query(
            'DELETE FROM notifications WHERE user_id = ? AND is_read = TRUE',
            [userId]
        );
        
        res.json({ message: 'All read notifications deleted successfully' });
    } catch (error) {
        console.error('Error deleting read notifications:', error);
        res.status(500).json({ error: 'Failed to delete read notifications' });
    }
});

// Create a notification (internal use)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { userId, type, content, relatedId } = req.body;
        
        if (!userId || !type || !content) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const [result] = await pool.query(
            'INSERT INTO notifications (user_id, type, content, related_id) VALUES (?, ?, ?, ?)',
            [userId, type, content, relatedId || null]
        );
        
        const [notification] = await pool.query(
            'SELECT * FROM notifications WHERE id = ?',
            [result.insertId]
        );
        
        res.status(201).json({ notification: notification[0] });
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({ error: 'Failed to create notification' });
    }
});

module.exports = router;
