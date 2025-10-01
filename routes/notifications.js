// PLV BookSwap - Notifications Routes (minimal)
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getConnection } = require('../config/database');

const router = express.Router();

// GET /api/notifications - list current user's notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const conn = await getConnection();
    const [rows] = await conn.execute(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    conn.release();
    res.json(rows || []);
  } catch (err) {
    console.error('GET /notifications error:', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

// PUT /api/notifications/:id/read - mark as read
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const conn = await getConnection();
    await conn.execute('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    conn.release();
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('PUT /notifications/:id/read error:', err);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// PUT /api/notifications/read-all - mark all as read
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    const conn = await getConnection();
    await conn.execute('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.user.id]);
    conn.release();
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('PUT /notifications/read-all error:', err);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

module.exports = router;
