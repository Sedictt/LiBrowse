const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Create email transporter (using environment variables)
let transporter = null;

try {
    if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT || '587'),
            secure: process.env.EMAIL_SECURE === 'true',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
    }
} catch (error) {
    console.error('Failed to create email transporter:', error);
}

// Generate verification token
function generateToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Send email verification link
router.post('/send-email-link', authenticateToken, async (req, res) => {
    try {
        if (!transporter) {
            return res.status(503).json({ 
                error: 'Email service not configured',
                message: 'Please configure email settings in environment variables'
            });
        }
        
        const userId = req.user.id;
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Generate verification token
        const token = generateToken();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        // Store token in database
        await pool.query(
            'INSERT INTO verification_codes (user_id, code, type, expires_at) VALUES (?, ?, ?, ?)',
            [userId, token, 'email_link', expiresAt]
        );
        
        // Create verification link
        const verificationLink = `${process.env.APP_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
        
        // Send email
        const mailOptions = {
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: email,
            subject: 'Verify your email - LiBrowse',
            html: `
                <h2>Email Verification</h2>
                <p>Thank you for registering with LiBrowse!</p>
                <p>Please click the link below to verify your email address:</p>
                <a href="${verificationLink}" style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a>
                <p>Or copy and paste this link into your browser:</p>
                <p>${verificationLink}</p>
                <p>This link will expire in 24 hours.</p>
                <p>If you didn't request this verification, please ignore this email.</p>
            `
        };
        
        await transporter.sendMail(mailOptions);
        
        res.json({ message: 'Verification email sent successfully' });
    } catch (error) {
        console.error('Error sending verification email:', error);
        res.status(500).json({ error: 'Failed to send verification email' });
    }
});

// Verify email with token
router.get('/verify-email-token', async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }
        
        // Check if token is valid
        const [codes] = await pool.query(
            `SELECT * FROM verification_codes 
             WHERE code = ? AND type = 'email_link' 
             AND expires_at > NOW() AND used = FALSE
             ORDER BY created_at DESC LIMIT 1`,
            [token]
        );
        
        if (codes.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired verification token' });
        }
        
        // Mark token as used
        await pool.query(
            'UPDATE verification_codes SET used = TRUE WHERE id = ?',
            [codes[0].id]
        );
        
        // Update user email verification status
        await pool.query(
            'UPDATE users SET email_verified = TRUE WHERE id = ?',
            [codes[0].user_id]
        );
        
        res.json({ message: 'Email verified successfully' });
    } catch (error) {
        console.error('Error verifying email token:', error);
        res.status(500).json({ error: 'Failed to verify email' });
    }
});

module.exports = router;
