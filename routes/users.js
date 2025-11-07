// LiBrowse - Users Routes
const express = require('express');
const { authenticateToken, sanitizeUser } = require('../middleware/auth');
const { getConnection } = require('../config/database');

const router = express.Router();

// GET /api/users/profile - current user's profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const conn = await getConnection();
    const [rows] = await conn.execute(
       `SELECT 
         id,
         email,
         student_no,
         fname,
         lname,
         course,
         year,
         credits,
         profile_pic,
         status,
         bio,
         created AS created_at
       FROM users 
       WHERE id = ? 
       LIMIT 1`,
      [req.user.id]
    );
    conn.release();

    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const u = rows[0];
    return res.json({
      user: sanitizeUser({
        id: u.id,
        email: u.email,
        firstname: u.fname,
        lastname: u.lname,
        student_id: u.student_no,
        program: u.course,
        year: u.year,
        credits: u.credits,
        profileimage: u.profile_pic,
        status: u.status,
        bio: u.bio,
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
  console.log('=== PUT /users/profile called ===');
  console.log('Request body:', req.body);
  console.log('User ID:', req.user?.id);

  try {
    // Disallow identity changes for verified users
    try {
      const connV = await getConnection();
      const [vr] = await connV.execute(
        'SELECT is_verified, verification_status FROM users WHERE id = ? LIMIT 1',
        [req.user.id]
      );
      connV.release();
      const isLocked = !!(vr && vr[0] && (vr[0].is_verified === 1 || vr[0].verification_status === 'verified'));
      if (isLocked && (req.body.firstname !== undefined || req.body.lastname !== undefined || req.body.studentid !== undefined || req.body['student_id'] !== undefined)) {
        return res.status(403).json({ success: false, message: 'Verified users cannot change their name or student number.' });
      }
    } catch (_) { /* ignore verification check errors */ }

    // Map frontend field names to database field names
    const fieldMapping = {
      firstname: 'fname',
      lastname: 'lname',
      studentid: 'student_no',
      'student_id': 'student_no',
      program: 'course',
      year: 'year',
      year_level: 'year',
      bio: 'bio',
    };

    const fields = [];
    const values = [];

    // Process each field from the request
    for (const [frontendKey, dbKey] of Object.entries(fieldMapping)) {
      if (Object.prototype.hasOwnProperty.call(req.body, frontendKey) && req.body[frontendKey] !== undefined) {
        fields.push(`${dbKey} = ?`);
        values.push(req.body[frontendKey]);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(req.user.id);

    const conn = await getConnection();
    await conn.execute(`UPDATE users SET ${fields.join(', ')}, modified = NOW() WHERE id = ?`, values);

    const [rows] = await conn.execute(
       `SELECT 
         id,
         email,
         student_no,
         fname,
         lname,
         course,
         year,
         credits,
         profile_pic,
         status,
         bio,
         created AS created_at
       FROM users WHERE id = ? LIMIT 1`,
      [req.user.id]
    );
    conn.release();

    const u = rows[0];
    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: sanitizeUser({
        id: u.id,
        email: u.email,
        firstname: u.fname,
        lastname: u.lname,
        student_id: u.student_no,
        program: u.course,
        year: u.year,
        credits: u.credits,
        profileimage: u.profile_pic,
        status: u.status,
        bio: u.bio,
        created_at: u.created_at
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

// POST /api/users/profile-picture - upload profile picture
router.post('/profile-picture', authenticateToken, async (req, res) => {
  console.log('=== POST /users/profile-picture called ===');

  try {
    // Check if file exists
    if (!req.files || !req.files.profilepicture) {
      console.log('No file uploaded');
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const file = req.files.profilepicture;
    console.log('File received:', file.name, 'Size:', file.size, 'Type:', file.mimetype);

    // Validation
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];

    if (file.size > maxSize) {
      console.log('File too large:', file.size);
      return res.status(400).json({
        success: false,
        message: 'File too large. Max 5MB'
      });
    }

    if (!allowedMimes.includes(file.mimetype)) {
      console.log('Invalid mimetype:', file.mimetype);
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only JPG, PNG allowed'
      });
    }

    // Create uploads directory if it doesn't exist
    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.join(__dirname, '../public/uploads/profiles');

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log('Created uploads directory:', uploadsDir);
    }

    // Save file with timestamp
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop();
    const filename = `profile_${req.user.id}_${timestamp}.${fileExtension}`;
    const uploadPath = path.join(uploadsDir, filename);

    await file.mv(uploadPath);
    console.log('File saved to:', uploadPath);

    // Update database
    const conn = await getConnection();
    await conn.execute(
      'UPDATE users SET profile_pic = ?, modified = NOW() WHERE id = ?',
      [`/uploads/profiles/${filename}`, req.user.id]
    );
    conn.release();

    console.log('Database updated successfully');

    return res.json({
      success: true,
      message: 'Profile picture updated successfully',
      imageUrl: `/uploads/profiles/${filename}`
    });

  } catch (err) {
    console.error('=== POST /users/profile-picture ERROR ===', err);
    res.status(500).json({
      success: false,
      message: 'Failed to upload profile picture',
      error: err.message
    });
  }
});

module.exports = router;
