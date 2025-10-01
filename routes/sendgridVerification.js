// Booqy - SendGrid Email Verification (Better PLV Delivery)
const express = require('express');
const sgMail = require('@sendgrid/mail');
const { authenticateToken } = require('../middleware/auth');
const { getConnection } = require('../config/database');

const router = express.Router();

// Configure SendGrid
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Generate 6-digit verification code
const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// POST /api/verification/sendgrid-email-code - Send via SendGrid for better PLV delivery
router.post('/sendgrid-email-code', authenticateToken, async (req, res) => {
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
        
        const isPLVEmail = user.email.includes('@plv.edu.ph');
        
        // SendGrid email configuration
        const msg = {
            to: user.email,
            from: {
                email: 'booqyofficial@gmail.com',
                name: 'Booqy - PLV Book Exchange'
            },
            subject: '🔐 Your Booqy Verification Code',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Booqy Verification Code</title>
                </head>
                <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9ff;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                        
                        <!-- Header -->
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">📚 Booqy</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">PLV Smart Book Exchange</p>
                        </div>
                        
                        <!-- Content -->
                        <div style="padding: 40px 30px;">
                            <h2 style="color: #333; margin: 0 0 20px 0; font-size: 24px;">Email Verification</h2>
                            
                            <p style="color: #666; line-height: 1.6; margin: 0 0 20px 0; font-size: 16px;">
                                Hi <strong>${user.first_name} ${user.last_name}</strong>,
                            </p>
                            
                            <p style="color: #666; line-height: 1.6; margin: 0 0 30px 0; font-size: 16px;">
                                Welcome to Booqy! Please use the verification code below to complete your account setup.
                                ${isPLVEmail ? '<br><br><strong>🎓 PLV Student Detected:</strong> This email was sent using our enhanced delivery system for better PLV email compatibility.' : ''}
                            </p>
                            
                            <!-- Verification Code -->
                            <div style="text-align: center; margin: 40px 0;">
                                <div style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-size: 36px; font-weight: bold; padding: 20px 40px; border-radius: 12px; letter-spacing: 8px; box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);">
                                    ${verificationCode}
                                </div>
                            </div>
                            
                            <p style="color: #666; line-height: 1.6; margin: 30px 0 20px 0; font-size: 16px; text-align: center;">
                                Enter this 6-digit code in the Booqy app to verify your email address.
                            </p>
                            
                            <!-- Important Notice -->
                            <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 30px 0;">
                                <p style="color: #856404; margin: 0; font-size: 14px; line-height: 1.5;">
                                    <strong>⏰ Important:</strong> This code expires in 10 minutes for security.<br>
                                    <strong>🔒 Security:</strong> Never share this code with anyone.<br>
                                    ${isPLVEmail ? '<strong>🏫 PLV Users:</strong> This email uses enhanced delivery for better PLV compatibility.' : ''}
                                </p>
                            </div>
                            
                            <p style="color: #999; font-size: 14px; line-height: 1.5; margin: 30px 0 0 0;">
                                If you didn't request this verification, please ignore this email or contact our support team.
                            </p>
                        </div>
                        
                        <!-- Footer -->
                        <div style="background: #f8f9ff; padding: 30px; text-align: center; border-top: 1px solid #eee;">
                            <p style="color: #999; font-size: 12px; margin: 0 0 10px 0;">
                                This email was sent by <strong>Booqy</strong> - Smart Academic Book Exchange
                            </p>
                            <p style="color: #999; font-size: 12px; margin: 0;">
                                Pamantasan ng Lungsod ng Valenzuela (PLV) Student Platform
                            </p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            // Plain text version for email clients that don't support HTML
            text: `
Booqy - Email Verification

Hi ${user.first_name} ${user.last_name},

Your verification code is: ${verificationCode}

This code expires in 10 minutes. Enter it in the Booqy app to verify your email address.

${isPLVEmail ? 'PLV Student: This email uses enhanced delivery for better university email compatibility.' : ''}

If you didn't request this, please ignore this email.

- Booqy Team
PLV Smart Book Exchange Platform
            `.trim()
        };
        
        try {
            // Check if SendGrid is configured
            if (!process.env.SENDGRID_API_KEY) {
                throw new Error('SendGrid not configured');
            }
            
            await sgMail.send(msg);
            console.log(`📧 [SENDGRID] Verification code sent to ${user.email}: ${verificationCode}`);
            
            res.json({
                success: true,
                message: isPLVEmail ? 
                    '✅ Code sent via enhanced delivery system! Check your PLV email inbox.' : 
                    '✅ Verification code sent successfully!',
                email: user.email,
                isPLVEmail: isPLVEmail,
                provider: 'SendGrid Enhanced Delivery',
                note: isPLVEmail ? 'Using professional email service for better PLV delivery.' : null
            });
            
        } catch (emailError) {
            console.error('SendGrid sending error:', emailError);
            
            // Fallback to development mode
            console.log(`🔬 [DEV] SendGrid failed, verification code for ${user.email}: ${verificationCode}`);
            
            res.json({
                success: true,
                message: 'Verification code generated (SendGrid not configured - check console)',
                email: user.email,
                isPLVEmail: isPLVEmail,
                provider: 'Development Fallback',
                devCode: process.env.NODE_ENV === 'development' ? verificationCode : undefined,
                note: 'Configure SENDGRID_API_KEY for enhanced email delivery'
            });
        }
        
    } catch (error) {
        console.error('SendGrid email verification error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send verification code' 
        });
    }
});

module.exports = router;
