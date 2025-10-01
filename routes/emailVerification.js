// Booqy - Email Verification Routes
const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { authenticateToken } = require('../middleware/auth');
const { getConnection } = require('../config/database');

const router = express.Router();

// Email transporter configuration - Using SendGrid for PLV compatibility
const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.sendgrid.net',
        port: process.env.EMAIL_PORT || 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER || 'apikey',
            pass: process.env.EMAIL_PASSWORD || 'your-sendgrid-api-key'
        }
    });
};

// Generate 6-digit verification code
const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// POST /api/verification/send-email-code - Send verification code to user's email
router.post('/send-email-code', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const conn = await getConnection();
        
        // Get user details
        const [userRows] = await conn.execute(
            'SELECT email, first_name, last_name FROM users WHERE id = ?',
            [userId]
        );
        
        if (userRows.length === 0) {
            conn.release();
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const user = userRows[0];
        const verificationCode = generateVerificationCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
        
        // Store verification code in database
        await conn.execute(`
            INSERT INTO email_verification_codes (user_id, code, expires_at, created_at) 
            VALUES (?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE 
            code = VALUES(code), 
            expires_at = VALUES(expires_at), 
            created_at = NOW()
        `, [userId, verificationCode, expiresAt]);
        
        conn.release();
        
        // Send email
        const transporter = createTransporter();
        const isPLVEmail = user.email.includes('@plv.edu.ph');
        
        const mailOptions = {
            from: process.env.EMAIL_FROM || '"Booqy Team" <noreply@booqy.com>',
            to: user.email,
            subject: 'Booqy - Email Verification Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #667eea; margin: 0;">📚 Booqy</h1>
                        <p style="color: #666; margin: 5px 0;">Smart Academic Book Exchange</p>
                    </div>
                    
                    <div style="background: #f8f9ff; padding: 30px; border-radius: 12px; border-left: 4px solid #667eea;">
                        <h2 style="color: #333; margin-top: 0;">Email Verification</h2>
                        <p style="color: #666; line-height: 1.6;">
                            Hi ${user.first_name} ${user.last_name},
                        </p>
                        <p style="color: #666; line-height: 1.6;">
                            Thank you for verifying your email address with Booqy! 
                            ${isPLVEmail ? 'We see you\'re using a PLV email address - that\'s great for building trust in our academic community!' : ''}
                        </p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <div style="background: #667eea; color: white; font-size: 32px; font-weight: bold; padding: 20px; border-radius: 8px; letter-spacing: 8px; display: inline-block;">
                                ${verificationCode}
                            </div>
                        </div>
                        
                        <p style="color: #666; line-height: 1.6;">
                            Enter this 6-digit code in the Booqy app to complete your email verification.
                        </p>
                        
                        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="color: #856404; margin: 0; font-size: 14px;">
                                <strong>⏰ Important:</strong> This code will expire in 10 minutes for security reasons.
                            </p>
                        </div>
                        
                        <p style="color: #666; line-height: 1.6; font-size: 14px;">
                            If you didn't request this verification, please ignore this email or contact our support team.
                        </p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                        <p style="color: #999; font-size: 12px; margin: 0;">
                            This email was sent by Booqy - Smart Academic Book Exchange Platform
                        </p>
                        <p style="color: #999; font-size: 12px; margin: 5px 0 0 0;">
                            Pamantasan ng Lungsod ng Valenzuela (PLV)
                        </p>
                    </div>
                </div>
            `
        };
        
        try {
            await transporter.sendMail(mailOptions);
            console.log(`📧 Verification code sent to ${user.email}: ${verificationCode}`);
            
            res.json({
                success: true,
                message: isPLVEmail ? 
                    'Verification code sent! Note: PLV emails may take longer to arrive or go to spam folder.' : 
                    'Verification code sent successfully',
                email: user.email,
                isPLVEmail: isPLVEmail,
                note: isPLVEmail ? 'If you don\'t receive the email, check your spam folder or contact support.' : null,
                // Show code for PLV emails in development mode
                devCode: (isPLVEmail && process.env.NODE_ENV === 'development') ? verificationCode : undefined
            });
        } catch (emailError) {
            console.error('Email sending error:', emailError);
            
            // For development, still return success but log the code
            console.log(`🔬 [DEV] Verification code for ${user.email}: ${verificationCode}`);
            
            res.json({
                success: true,
                message: 'Verification code generated (check console in development)',
                email: user.email,
                isPLVEmail: isPLVEmail,
                devCode: process.env.NODE_ENV === 'development' ? verificationCode : undefined
            });
        }
        
    } catch (error) {
        console.error('Send email verification error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send verification code' 
        });
    }
});

// POST /api/verification/verify-email-code - Verify the email code
router.post('/verify-email-code', authenticateToken, async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.user.id;
        
        if (!code || code.length !== 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide a valid 6-digit verification code' 
            });
        }
        
        const conn = await getConnection();
        
        // Check if code exists and is not expired
        const [codeRows] = await conn.execute(`
            SELECT * FROM email_verification_codes 
            WHERE user_id = ? AND code = ? AND expires_at > NOW() AND used_at IS NULL
            ORDER BY created_at DESC LIMIT 1
        `, [userId, code]);
        
        if (codeRows.length === 0) {
            conn.release();
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired verification code' 
            });
        }
        
        // Mark code as used
        await conn.execute(`
            UPDATE email_verification_codes 
            SET used_at = NOW() 
            WHERE user_id = ? AND code = ?
        `, [userId, code]);
        
        // Update user verification status
        await conn.execute(`
            UPDATE users 
            SET email_verified = 1, 
                is_verified = 1, 
                verification_method = 'email',
                verification_date = NOW(),
                updated_at = NOW()
            WHERE id = ?
        `, [userId]);
        
        // Get updated user data
        const [userRows] = await conn.execute(
            'SELECT email, first_name, last_name, email_verified, is_verified, verification_method FROM users WHERE id = ?',
            [userId]
        );
        
        conn.release();
        
        const user = userRows[0];
        console.log(`✅ Email verified successfully for user ${userId}: ${user.email}`);
        
        res.json({
            success: true,
            message: 'Email verified successfully!',
            user: {
                email: user.email,
                email_verified: user.email_verified,
                is_verified: user.is_verified,
                verification_method: user.verification_method
            }
        });
        
    } catch (error) {
        console.error('Verify email code error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify email code' 
        });
    }
});

// GET /api/verification/status - Get current verification status
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const conn = await getConnection();
        
        const [userRows] = await conn.execute(`
            SELECT email, email_verified, is_verified, verification_method, verification_date
            FROM users WHERE id = ?
        `, [userId]);
        
        conn.release();
        
        if (userRows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const user = userRows[0];
        
        res.json({
            success: true,
            verification: {
                email: user.email,
                email_verified: user.email_verified,
                is_verified: user.is_verified,
                verification_method: user.verification_method,
                verification_date: user.verification_date,
                isPLVEmail: user.email.includes('@plv.edu.ph')
            }
        });
        
    } catch (error) {
        console.error('Get verification status error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get verification status' 
        });
    }
});

module.exports = router;
