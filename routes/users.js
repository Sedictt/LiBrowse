// PLV BookSwap - Users Routes
const express = require('express');
const { authenticateToken, sanitizeUser } = require('../middleware/auth');
const { getConnection } = require('../config/database');

const router = express.Router();

// GET /api/users/profile - current user's profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const conn = await getConnection();
    const [rows] = await conn.execute(
      'SELECT id, first_name, last_name, email, student_id, program, year_level, credits, profile_image, status, created_at FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    conn.release();

    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const u = rows[0];
    return res.json({
      user: sanitizeUser({
        id: u.id,
        firstname: u.first_name,
        lastname: u.last_name,
        email: u.email,
        student_id: u.student_id,
        program: u.program,
        year_level: u.year_level,
        credits: u.credits,
        profile_image: u.profile_image,
        status: u.status,
        created_at: u.created_at
      })
    });
  } catch (err) {
    console.error('GET /users/profile error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// PUT /api/users/profile - update profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    // Map frontend field names to database field names
    const fieldMapping = {
      'firstname': 'first_name',
      'lastname': 'last_name',
      'email': 'email',
      'student_id': 'student_id',
      'program': 'program',
      'year_level': 'year_level',
      'bio': 'bio',
      'profile_image': 'profile_image'
    };

    const fields = [];
    const values = [];

    // Process each field from the request
    for (const [frontendKey, dbKey] of Object.entries(fieldMapping)) {
      if (req.body[frontendKey] !== undefined) {
        fields.push(`${dbKey} = ?`);
        values.push(req.body[frontendKey]);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(req.user.id);

    const conn = await getConnection();
    await conn.execute(`UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);

    const [rows] = await conn.execute(
      'SELECT id, first_name, last_name, email, student_id, program, year_level, credits, profile_image, status, created_at, bio FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    conn.release();

    const u = rows[0];
    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: sanitizeUser({
        id: u.id,
        firstname: u.first_name,
        lastname: u.last_name,
        email: u.email,
        student_id: u.student_id,
        program: u.program,
        year_level: u.year_level,
        credits: u.credits,
        profile_image: u.profile_image,
        status: u.status,
        created_at: u.created_at,
        bio: u.bio
      })
    });
  } catch (err) {
    console.error('PUT /users/profile error:', err);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// GET /api/users/stats - current user stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const conn = await getConnection();

    const [[{ books_count }]] = await conn.query(
      'SELECT COUNT(*) AS books_count FROM books WHERE owner_id = ?',
      [req.user.id]
    );

    const [[{ transactions_count }]] = await conn.query(
      'SELECT COUNT(*) AS transactions_count FROM transactions WHERE borrower_id = ? OR lender_id = ?',
      [req.user.id, req.user.id]
    );

    const [[{ average_rating }]] = await conn.query(
      'SELECT AVG(rating) AS average_rating FROM feedback WHERE reviewee_id = ?',
      [req.user.id]
    );

    conn.release();

    res.json({ books_count, transactions_count, average_rating: Number(average_rating || 0) });
  } catch (err) {
    console.error('GET /users/stats error:', err);
    res.status(500).json({ error: 'Failed to load user stats' });
  }
});

module.exports = router;
