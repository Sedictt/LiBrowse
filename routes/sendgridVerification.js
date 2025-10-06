const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// SendGrid setup (only if API key is provided)
let sgMail = null;

try {
    if (process.env.SENDGRID_API_KEY) {
        sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    }
} catch (error) {
    console.error('SendGrid not configured:', error);
}

// Generate verification token
function generateToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Send email verification via SendGrid
router.post('/sendgrid/send-verification', authenticateToken, async (req, res) => {
    try {
        if (!sgMail) {
            return res.status(503).json({ 
                error: 'SendGrid not configured',
                message: 'Please set SENDGRID_API_KEY in environment variables'
            });
        }
        
        const userId = req.user.id;
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Generate verification token
        const token = generateToken();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        
        // Store token in database
        await pool.query(
            'INSERT INTO verification_codes (user_id, code, type, expires_at) VALUES (?, ?, ?, ?)',
            [userId, token, 'sendgrid_link', expiresAt]
        );
        
        // Create verification link
        const verificationLink = `${process.env.APP_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
        
        // Send email via SendGrid
        const msg = {
            to: email,
            from: process.env.SENDGRID_FROM_EMAIL || 'noreply@librowse.com',
            subject: 'Verify your email - LiBrowse',
            html: `<h2>Email Verification</h2><p>Click to verify: <a href="${verificationLink}">Verify Email</a></p>`
        };
        
        await sgMail.send(msg);
        
        res.json({ message: 'Verification email sent via SendGrid' });
    } catch (error) {
        console.error('Error sending email via SendGrid:', error);
        res.status(500).json({ error: 'Failed to send verification email' });
    }
});

module.exports = router;
