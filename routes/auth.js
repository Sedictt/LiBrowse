// LiBrowse - Authentication Routes
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const {
    authenticateToken,
    authRateLimit,
    validatePLVEmail,
    generateToken, 
    generateOTP,
    checkPasswordStrength,
    sanitizeUser
} = require('../middleware/auth');

const { getConnection } = require('../config/database');
const { verifyCaptcha, captchaService } = require('../middleware/captcha');

const router = express.Router();

// Email transporter setup
const createEmailTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        }
    });
};

// Send OTP email
const sendOTPEmail = async (email, otp, name) => {
    const transporter = createEmailTransporter();
    
    const mailOptions = {
        from: `"LiBrowse" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'LiBrowse - Email Verification',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0;">LiBrowse</h1>
                </div>
                <div style="padding: 30px; background: #f8f9fa;">
                    <h2 style="color: #333;">Welcome to LiBrowse, ${name}!</h2>
                    <p style="color: #666; font-size: 16px;">
                        Thank you for joining our book exchange community. To complete your registration, 
                        please verify your email address using the code below:
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <div style="background: #667eea; color: white; font-size: 32px; font-weight: bold; 
                                    padding: 20px; border-radius: 10px; display: inline-block; letter-spacing: 5px;">
                            ${otp}
                        </div>
                    </div>
                    <p style="color: #666; font-size: 14px;">
                        This code will expire in 10 minutes. If you didn't create an account with LiBrowse, 
                        please ignore this email.
                    </p>
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                        <p style="color: #999; font-size: 12px; text-align: center;">
                            LiBrowse - Connecting PLV Students Through Books
                        </p>
                    </div>
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

// Register new user
router.post('/register', [
    authRateLimit(3, 15 * 60 * 1000), // 3 attempts per 15 minutes
    verifyCaptcha({ 
        customErrorMessage: 'Please complete the CAPTCHA to register',
        expectedAction: 'register'
    }),
    validatePLVEmail,
    checkPasswordStrength,
    body('firstname').trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
    body('lastname').trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
    body('student_id').matches(/^\d{2}-\d{4}$/).withMessage('Student ID must be in format 00-0000'),
    body('program').trim().notEmpty().withMessage('Program is required')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { firstname, lastname, email, student_id, program, password } = req.body;
        const connection = await getConnection();

        // Check if user already exists
        const [existingUsers] = await connection.execute(
            'SELECT id, is_verified FROM users WHERE email = ? OR student_id = ?',
            [email, student_id]
        );

        if (existingUsers.length > 0) {
            const existingUser = existingUsers[0];
            if (existingUser.is_verified) {
                return res.status(400).json({ error: 'User already exists and is verified' });
            } else {
                // User exists but not verified, update their info
                const hashedPassword = await bcrypt.hash(password, 12);
                const otp = generateOTP();
                const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

                await connection.execute(
                    `UPDATE users SET 
                     first_name = ?, last_name = ?, password_hash = ?, program = ?, 
                     verification_token = ?, verification_expires = ?, updated_at = NOW()
                     WHERE email = ?`,
                    [firstname, lastname, hashedPassword, program, otp, otpExpires, email]
                );

                connection.release();

                return res.json({ 
                    message: 'Registration updated! Please choose your verification method.',
                    userId: existingUser.id,
                    email: email,
                    requiresVerification: true
                });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Generate OTP
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Insert new user (always unverified, user will choose verification method)
        const yearLevel = 1;
        
        const [result] = await connection.execute(
            `INSERT INTO users (first_name, last_name, email, student_id, program, year_level, password_hash, is_verified, verification_token, verification_expires, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, ?, ?, NOW())`,
            [firstname, lastname, email, student_id, program, yearLevel, hashedPassword, otp, otpExpires]
        );

        connection.release();

        res.status(201).json({ 
            message: 'Registration successful! Please choose your verification method.',
            userId: result.insertId,
            email: email,
            requiresVerification: true
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Verify OTP
router.post('/verify-otp', [
    authRateLimit(5, 15 * 60 * 1000),
    body('email').isEmail().withMessage('Valid email required'),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { email, otp } = req.body;
        const connection = await getConnection();

        // Find user with matching email and OTP
        const [users] = await connection.execute(
            'SELECT * FROM users WHERE email = ? AND verification_token = ? AND verification_expires > NOW()',
            [email, otp]
        );

        if (users.length === 0) {
            connection.release();
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        const user = users[0];

        // Mark user as verified and clear OTP
        await connection.execute(
            'UPDATE users SET is_verified = TRUE, verification_token = NULL, verification_expires = NULL WHERE id = ?',
            [user.id]
        );

        connection.release();

        // Generate JWT token
        const token = generateToken({ 
            id: user.id, 
            email: user.email,
            firstname: user.first_name,
            lastname: user.last_name
        });

        res.json({
            message: 'Email verified successfully',
            token,
            user: sanitizeUser({
                id: user.id,
                firstname: user.first_name,
                lastname: user.last_name,
                email: user.email,
                program: user.program,
                student_id: user.student_id
            })
        });

    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({ error: 'OTP verification failed' });
    }
});

// Send OTP for verification choice
router.post('/send-otp', [
    authRateLimit(3, 5 * 60 * 1000), // 3 attempts per 5 minutes
    body('email').isEmail().withMessage('Valid email required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { email } = req.body;
        const connection = await getConnection();

        // Find unverified user
        const [users] = await connection.execute(
            'SELECT * FROM users WHERE email = ? AND is_verified = FALSE',
            [email]
        );

        if (users.length === 0) {
            connection.release();
            return res.status(400).json({ error: 'User not found or already verified' });
        }

        const user = users[0];
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        // Update OTP
        await connection.execute(
            'UPDATE users SET verification_token = ?, verification_expires = ? WHERE id = ?',
            [otp, otpExpires, user.id]
        );

        // Send OTP email (with error handling for development)
        try {
            await sendOTPEmail(email, otp, user.first_name);
            connection.release();
            res.json({ message: 'Verification code sent to your email' });
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
            connection.release();
            
            // In development, provide the OTP in response for testing
            if (process.env.NODE_ENV === 'development') {
                res.json({ 
                    message: 'Email service unavailable. For testing, use this OTP:', 
                    otp: otp 
                });
            } else {
                res.status(500).json({ error: 'Failed to send verification email' });
            }
        }

    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

// Document verification (static demo)
router.post('/verify-document', [
    authRateLimit(5, 15 * 60 * 1000),
    body('email').isEmail().withMessage('Valid email required'),
    body('documentType').isIn(['cor', 'school_id']).withMessage('Document type must be cor or school_id')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { email, documentType } = req.body;
        const connection = await getConnection();

        // Find unverified user
        const [users] = await connection.execute(
            'SELECT * FROM users WHERE email = ? AND is_verified = FALSE',
            [email]
        );

        if (users.length === 0) {
            connection.release();
            return res.status(400).json({ error: 'User not found or already verified' });
        }

        const user = users[0];

        // Static demo: Auto-approve document verification
        await connection.execute(
            'UPDATE users SET is_verified = TRUE, verification_token = NULL, verification_expires = NULL WHERE id = ?',
            [user.id]
        );

        connection.release();

        // Generate JWT token for immediate login
        const token = generateToken({ 
            id: user.id, 
            email: user.email,
            firstname: user.first_name,
            lastname: user.last_name
        });

        res.json({
            message: `Document verification successful! Your ${documentType.toUpperCase()} has been verified.`,
            token,
            user: sanitizeUser({
                id: user.id,
                firstname: user.first_name,
                lastname: user.last_name,
                email: user.email,
                program: user.program,
                student_id: user.student_id
            })
        });

    } catch (error) {
        console.error('Document verification error:', error);
        res.status(500).json({ error: 'Document verification failed' });
    }
});

// Resend OTP
router.post('/resend-otp', [
    authRateLimit(3, 5 * 60 * 1000), // 3 attempts per 5 minutes
    body('email').isEmail().withMessage('Valid email required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { email } = req.body;
        const connection = await getConnection();

        // Find unverified user
        const [users] = await connection.execute(
            'SELECT * FROM users WHERE email = ? AND is_verified = FALSE',
            [email]
        );

        if (users.length === 0) {
            connection.release();
            return res.status(400).json({ error: 'User not found or already verified' });
        }

        const user = users[0];
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        // Update OTP
        await connection.execute(
            'UPDATE users SET verification_token = ?, verification_expires = ? WHERE id = ?',
            [otp, otpExpires, user.id]
        );

        // Send new OTP
        await sendOTPEmail(email, otp, user.first_name);
        connection.release();

        res.json({ message: 'New verification code sent' });

    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({ error: 'Failed to resend OTP' });
    }
});

// Login
router.post('/login', [
    authRateLimit(5, 15 * 60 * 1000),
    verifyCaptcha({ 
        customErrorMessage: 'Please complete the CAPTCHA to login',
        expectedAction: 'login'
    }),
    body('email').isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { email, password } = req.body;
        const normalizedEmail = (email || '').trim().toLowerCase();
        const connection = await getConnection();

        // Find user
        const [users] = await connection.execute(
            'SELECT * FROM users WHERE LOWER(TRIM(email)) = ?',
            [normalizedEmail]
        );

        if (users.length === 0) {
            if (process.env.NODE_ENV !== 'production') {
                console.log('[AUTH][LOGIN] user not found for email:', normalizedEmail);
            }
            connection.release();
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = users[0];

        // Check if email is verified
        if (!user.is_verified) {
            if (process.env.NODE_ENV !== 'production') {
                console.log('[AUTH][LOGIN] user not verified:', normalizedEmail);
            }
            connection.release();
            return res.status(401).json({ 
                error: 'Email not verified. Please check your email for verification code.' 
            });
        }

        // Verify password (with fallback to trimmed password in dev)
        const hash = user.password_hash || user.password; // support legacy field if present
        let isValidPassword = false;
        if (hash) {
            isValidPassword = await bcrypt.compare(password, hash);
            if (!isValidPassword && process.env.NODE_ENV !== 'production') {
                const trimmed = (password || '').trim();
                if (trimmed !== password) {
                    isValidPassword = await bcrypt.compare(trimmed, hash);
                }
            }
        }
        if (process.env.NODE_ENV !== 'production') {
            console.log('[AUTH][LOGIN] compare result:', {
                email: normalizedEmail,
                hasHash: !!hash,
                hashPrefix: hash ? String(hash).slice(0, 7) : null,
                isValidPassword
            });
        }
        if (!isValidPassword) {
            connection.release();
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Update last login
        await connection.execute(
            'UPDATE users SET updated_at = NOW() WHERE id = ?',
            [user.id]
        );

        connection.release();

        // Generate JWT token
        const token = generateToken({ 
            id: user.id, 
            email: user.email,
            firstname: user.first_name,
            lastname: user.last_name
        });

        res.json({
            message: 'Login successful',
            token,
            user: sanitizeUser({
                id: user.id,
                firstname: user.first_name,
                lastname: user.last_name,
                email: user.email,
                program: user.program,
                student_id: user.student_id
            })
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Verify token
router.get('/verify', authenticateToken, async (req, res) => {
    try {
        const connection = await getConnection();
        
        // Get fresh user data
        const [users] = await connection.execute(
            'SELECT * FROM users WHERE id = ?',
            [req.user.id]
        );

        connection.release();

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            valid: true,
            user: sanitizeUser({
                id: users[0].id,
                firstname: users[0].first_name,
                lastname: users[0].last_name,
                email: users[0].email,
                program: users[0].program,
                student_id: users[0].student_id,
                credits: users[0].credits,
                is_verified: users[0].is_verified
            })
        });

    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).json({ error: 'Token verification failed' });
    }
});

// Get user profile with credits
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const connection = await getConnection();
        
        // Get user data with credits
        const [users] = await connection.execute(
            'SELECT id, first_name, last_name, email, student_id, program, credits, is_verified, created_at FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        // Get user stats
        const [bookStats] = await connection.execute(
            'SELECT COUNT(*) as books_count FROM books WHERE owner_id = ?',
            [req.user.id]
        );

        const [transactionStats] = await connection.execute(
            'SELECT COUNT(*) as transactions_count FROM transactions WHERE borrower_id = ? OR lender_id = ?',
            [req.user.id, req.user.id]
        );

        const [ratingStats] = await connection.execute(
            'SELECT AVG(rating) as average_rating FROM feedback WHERE reviewee_id = ?',
            [req.user.id]
        );

        connection.release();

        res.json({
            user: sanitizeUser({
                id: user.id,
                firstname: user.first_name,
                lastname: user.last_name,
                email: user.email,
                program: user.program,
                student_id: user.student_id,
                credits: user.credits,
                is_verified: user.is_verified,
                created_at: user.created_at
            }),
            stats: {
                books_count: bookStats[0].books_count || 0,
                transactions_count: transactionStats[0].transactions_count || 0,
                average_rating: ratingStats[0].average_rating || 0,
                credits: user.credits || 0
            }
        });

    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Forgot password (future implementation)
router.post('/forgot-password', (req, res) => {
    res.status(501).json({ error: 'Forgot password feature coming soon' });
});

// Reset password (future implementation)
router.post('/reset-password', (req, res) => {
    res.status(501).json({ error: 'Reset password feature coming soon' });
});

// Get CAPTCHA configuration
router.get('/captcha-config', (req, res) => {
    res.json({
        siteKey: captchaService.getSiteKey(),
        enabled: captchaService.isConfigured(),
        development: process.env.NODE_ENV === 'development'
    });
});

module.exports = router;
