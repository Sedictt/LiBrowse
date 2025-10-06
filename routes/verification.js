const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP for email verification
router.post('/send-otp', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Generate OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        
        // Store OTP in database
        await pool.query(
            'INSERT INTO verification_codes (user_id, code, type, expires_at) VALUES (?, ?, ?, ?)',
            [userId, otp, 'email', expiresAt]
        );
        
        // In production, send email with OTP
        // For now, just log it
        console.log(`OTP for ${email}: ${otp}`);
        
        res.json({ 
            message: 'OTP sent successfully',
            // For development only - remove in production
            otp: process.env.NODE_ENV !== 'production' ? otp : undefined
        });
    } catch (error) {
        console.error('Error sending OTP:', error);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

// Verify OTP
router.post('/verify-otp', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { otp } = req.body;
        
        if (!otp) {
            return res.status(400).json({ error: 'OTP is required' });
        }
        
        // Check if OTP is valid
        const [codes] = await pool.query(
            `SELECT * FROM verification_codes 
             WHERE user_id = ? AND code = ? AND type = 'email' 
             AND expires_at > NOW() AND used = FALSE
             ORDER BY created_at DESC LIMIT 1`,
            [userId, otp]
        );
        
        if (codes.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }
        
        // Mark OTP as used
        await pool.query(
            'UPDATE verification_codes SET used = TRUE WHERE id = ?',
            [codes[0].id]
        );
        
        // Update user email verification status
        await pool.query(
            'UPDATE users SET email_verified = TRUE WHERE id = ?',
            [userId]
        );
        
        res.json({ message: 'Email verified successfully' });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ error: 'Failed to verify OTP' });
    }
});

// Check verification status
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [users] = await pool.query(
            'SELECT email_verified FROM users WHERE id = ?',
            [userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ 
            verified: users[0].email_verified === 1
        });
    } catch (error) {
        console.error('Error checking verification status:', error);
        res.status(500).json({ error: 'Failed to check verification status' });
    }
});

// Resend verification code
router.post('/resend', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Check if user is already verified
        const [users] = await pool.query(
            'SELECT email_verified, email FROM users WHERE id = ?',
            [userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (users[0].email_verified) {
            return res.status(400).json({ error: 'Email already verified' });
        }
        
        // Generate new OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        
        // Invalidate old OTPs
        await pool.query(
            'UPDATE verification_codes SET used = TRUE WHERE user_id = ? AND type = "email" AND used = FALSE',
            [userId]
        );
        
        // Store new OTP
        await pool.query(
            'INSERT INTO verification_codes (user_id, code, type, expires_at) VALUES (?, ?, ?, ?)',
            [userId, otp, 'email', expiresAt]
        );
        
        console.log(`New OTP for ${users[0].email}: ${otp}`);
        
        res.json({ 
            message: 'Verification code resent successfully',
            otp: process.env.NODE_ENV !== 'production' ? otp : undefined
        });
    } catch (error) {
        console.error('Error resending verification code:', error);
        res.status(500).json({ error: 'Failed to resend verification code' });
    }
});

module.exports = router;
