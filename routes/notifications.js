const express = require('express');
const router = express.Router();
const { getConnection } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get all notifications for a user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 20, offset = 0, unreadOnly = false } = req.query;

        const connection = await getConnection();

        // Ensure valid integers (convert to number, not NaN)
        const limitNum = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
        const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

        // Validate they are actual numbers
        if (!Number.isFinite(limitNum) || !Number.isFinite(offsetNum)) {
            connection.release();
            return res.status(400).json({ error: 'Invalid pagination parameters' });
        }

        let query = `
            SELECT * FROM notifications
            WHERE user_id = ?
        `;

        if (unreadOnly === 'true') {
            query += ' AND is_read = FALSE';
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

        const [notifications] = await connection.execute(query, [
            userId,
            limitNum,
            offsetNum
        ]);

        // Get unread count
        const [countResult] = await connection.execute(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );

        connection.release();

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
        const connection = await getConnection();

        const [result] = await connection.execute(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );

        connection.release();

        res.json({ unreadCount: result[0].count });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({ error: 'Failed to fetch unread count' });
    }
});

// Mark notification as read
router.put('/:id/read', authenticateToken, async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.user.id;
        const connection = await getConnection();

        await connection.execute(
            'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
            [notificationId, userId]
        );

        connection.release();

        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// Mark all notifications as read
router.put('/mark-all-read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const connection = await getConnection();

        const result = await connection.execute(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );

        connection.release();

        res.json({
            message: 'All notifications marked as read',
            count: result.affectedRows
        });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
});

// Delete a notification
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.user.id;
        const connection = await getConnection();

        await connection.execute(
            'DELETE FROM notifications WHERE id = ? AND user_id = ?',
            [notificationId, userId]
        );

        connection.release();

        res.json({ message: 'Notification deleted' });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

module.exports = router;
