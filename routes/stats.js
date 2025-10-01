// PLV BookSwap - Stats Routes (platform-wide)
const express = require('express');
const { getConnection } = require('../config/database');

const router = express.Router();

// GET /api/stats/platform
router.get('/platform', async (req, res) => {
  try {
    const conn = await getConnection();

    const [[{ total_users }]] = await conn.query('SELECT COUNT(*) AS total_users FROM users');
    const [[{ total_books }]] = await conn.query('SELECT COUNT(*) AS total_books FROM books');
    const [[{ total_transactions }]] = await conn.query('SELECT COUNT(*) AS total_transactions FROM transactions');
    const [[{ avg_rating }]] = await conn.query('SELECT AVG(rating) AS avg_rating FROM feedback');

    conn.release();

    res.json({
      total_users: Number(total_users || 0),
      total_books: Number(total_books || 0),
      total_transactions: Number(total_transactions || 0),
      average_rating: Number(avg_rating || 0)
    });
  } catch (err) {
    console.error('GET /stats/platform error:', err);
    res.status(500).json({ error: 'Failed to load platform stats' });
  }
});

module.exports = router;
