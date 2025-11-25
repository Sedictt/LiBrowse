// LiBrowse - Users Routes
const express = require('express');
const { executeQuery } = require('../config/database');
const { authenticateToken, sanitizeUser } = require('../middleware/auth');
const { getConnection } = require('../config/database');
const fileUpload = require('express-fileupload');

const router = express.Router();
// Enable file upload handling (used for /api/users/profile-picture)
router.use(fileUpload());

// GET /api/users/:userId/public - Public profile for assessing credibility
// Returns limited info that helps users assess trustworthiness
router.get('/:userId/public', async (req, res) => {
  try {
    const userId = req.params.userId;
    const conn = await getConnection();
    
    // Get user basic info (limited public data)
    const [userRows] = await conn.execute(
      `SELECT 
         id,
         fname,
         lname,
         course,
         year,
         profile_pic,
         bio,
         verification_status,
         is_verified,
         email_verified,
         credits,
         created AS member_since
       FROM users 
       WHERE id = ? 
       LIMIT 1`,
      [userId]
    );

    if (userRows.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRows[0];

    // Get user stats
    const [[{ books_count }]] = await conn.query(
      'SELECT COUNT(*) AS books_count FROM books WHERE owner_id = ? AND is_available = 1',
      [userId]
    );

    const [[{ completed_transactions }]] = await conn.query(
      `SELECT COUNT(*) AS completed_transactions FROM transactions 
       WHERE (borrower_id = ? OR lender_id = ?) AND status = 'completed'`,
      [userId, userId]
    );

    const [[{ as_lender }]] = await conn.query(
      `SELECT COUNT(*) AS as_lender FROM transactions 
       WHERE lender_id = ? AND status = 'completed'`,
      [userId]
    );

    const [[{ as_borrower }]] = await conn.query(
      `SELECT COUNT(*) AS as_borrower FROM transactions 
       WHERE borrower_id = ? AND status = 'completed'`,
      [userId]
    );

    // Get average rating received
    const [[{ average_rating, total_reviews }]] = await conn.query(
      `SELECT AVG(rating) AS average_rating, COUNT(*) AS total_reviews 
       FROM feedback WHERE reviewee_id = ?`,
      [userId]
    );

    // Get recent feedback (last 5 reviews)
    const [recentFeedback] = await conn.execute(
      `SELECT 
         f.rating,
         f.comment,
         f.created,
         CONCAT(reviewer.fname, ' ', LEFT(reviewer.lname, 1), '.') AS reviewer_name,
         reviewer.profile_pic AS reviewer_pic,
         b.title AS book_title
       FROM feedback f
       JOIN users reviewer ON reviewer.id = f.reviewer_id
       JOIN transactions t ON t.id = f.transaction_id
       JOIN books b ON b.id = t.book_id
       WHERE f.reviewee_id = ?
       ORDER BY f.created DESC
       LIMIT 5`,
      [userId]
    );

    conn.release();

    // Determine verification level
    let verificationLevel = 'unverified';
    let verificationLabel = 'Not Verified';
    const isDocVerified = user.is_verified === 1 || user.verification_status === 'verified';
    const isEmailVerified = user.email_verified === 1;
    
    if (isDocVerified && isEmailVerified) {
      verificationLevel = 'fully_verified';
      verificationLabel = 'Fully Verified';
    } else if (isDocVerified || isEmailVerified) {
      verificationLevel = 'verified';
      verificationLabel = 'Verified';
    }

    // Calculate trust score (simple algorithm based on various factors)
    let trustScore = 0;
    if (verificationLevel === 'fully_verified') trustScore += 30;
    else if (verificationLevel === 'verified') trustScore += 15;
    trustScore += Math.min(30, completed_transactions * 3); // Max 30 points for transactions
    trustScore += Math.min(20, (average_rating || 0) * 4); // Max 20 points for rating
    trustScore += Math.min(10, user.credits / 20); // Max 10 points for credits
    trustScore += Math.min(10, books_count * 2); // Max 10 points for books shared
    trustScore = Math.min(100, Math.round(trustScore));

    return res.json({
      user: {
        id: user.id,
        name: `${user.fname} ${user.lname}`,
        firstName: user.fname,
        program: user.course,
        year: user.year,
        profilePic: user.profile_pic,
        bio: user.bio,
        verificationLevel,
        verificationLabel,
        credits: user.credits,
        memberSince: user.member_since,
        trustScore
      },
      stats: {
        booksShared: books_count,
        completedTransactions: completed_transactions,
        asLender: as_lender,
        asBorrower: as_borrower,
        averageRating: average_rating ? parseFloat(average_rating).toFixed(1) : null,
        totalReviews: total_reviews
      },
      recentFeedback
    });
  } catch (err) {
    console.error('GET /users/:userId/public error:', err);
    res.status(500).json({ error: 'Failed to load public profile' });
  }
});

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
         verification_status,
         verification_method,
         is_verified,
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
        verification_status: u.verification_status,
        verification_method: u.verification_method,
        is_verified: u.is_verified,
        created_at: u.created_at
      })
    });
  } catch (err) {
    console.error('GET /users/profile error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// In users.js
router.get('/violation-history/:userId', authenticateToken, async (req, res) => {
  try {
    const targetUserId = req.params.userId;

    console.log('📊 Fetching violation history for user:', targetUserId);

    // Get violation history
    const violations = await executeQuery(
      `SELECT violation_type, credits_deducted, credit_balance_after, description, created_at 
       FROM violation_history 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [targetUserId]
    );

    console.log('✅ Violations fetched:', violations.length);

    // Get user summary
    const userResult = await executeQuery(
      `SELECT times_hit_threshold, account_status, lowest_credit_reached 
       FROM users 
       WHERE id = ?`,
      [targetUserId]
    );

    console.log('✅ User data fetched:', userResult);

    // Check if user exists
    if (!userResult || userResult.length === 0) {
      console.log('❌ User not found');
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult[0];

    res.json({
      violations,
      summary: {
        offenseCount: user.times_hit_threshold || 0,
        accountStatus: user.account_status || 'active',
        lowestCreditReached: user.lowest_credit_reached || 100
      }
    });

    console.log('✅ Response sent successfully');

  } catch (error) {
    console.error('❌ Get violation history error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to fetch violation history', details: error.message });
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
