const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const { getOne, executeQuery } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const ocrService = require('../services/ocrService_enhanced');

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
        
        // Update user email verification status (fallback if column missing)
        try {
            await pool.query(
                'UPDATE users SET email_verified = TRUE WHERE id = ?',
                [userId]
            );
        } catch (e) {
            if (!(e && e.code === 'ER_BAD_FIELD_ERROR')) {
                throw e;
            }
            // Column missing: skip setting email_verified
        }
        
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
        let emailVerified = 0;
        try {
            const [users] = await pool.query(
                'SELECT email_verified FROM users WHERE id = ?',
                [userId]
            );
            if (users.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            emailVerified = users[0].email_verified ? 1 : 0;
        } catch (e) {
            if (e && e.code === 'ER_BAD_FIELD_ERROR') {
                const [users] = await pool.query(
                    'SELECT 1 FROM users WHERE id = ?',
                    [userId]
                );
                if (users.length === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }
                emailVerified = 0;
            } else {
                throw e;
            }
        }
        res.json({ verified: emailVerified === 1 });
    } catch (error) {
        console.error('Error checking verification status:', error);
        res.status(500).json({ error: 'Failed to check verification status' });
    }
});

// Resend verification code
router.post('/resend', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        let userRow = null;
        let emailVerified = 0;
        // Check if user is already verified
        try {
            const [users] = await pool.query(
                'SELECT email_verified, email FROM users WHERE id = ?',
                [userId]
            );
            if (users.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            userRow = users[0];
            emailVerified = users[0].email_verified ? 1 : 0;
        } catch (e) {
            if (e && e.code === 'ER_BAD_FIELD_ERROR') {
                const [users] = await pool.query(
                    'SELECT email FROM users WHERE id = ?',
                    [userId]
                );
                if (users.length === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }
                userRow = users[0];
                emailVerified = 0;
            } else {
                throw e;
            }
        }
        if (emailVerified) {
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
        console.log(`New OTP for ${userRow.email}: ${otp}`);
        res.json({ 
            message: 'Verification code resent successfully',
            otp: process.env.NODE_ENV !== 'production' ? otp : undefined
        });
    } catch (error) {
        console.error('Error resending verification code:', error);
        res.status(500).json({ error: 'Failed to resend verification code' });
    }
});

// Configure multer for document uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/verification');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const userId = (req.user && req.user.id) ? req.user.id : 'guest';
        cb(null, `verification-${userId}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 2 // Front and back of ID
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only JPG, PNG, and PDF files are allowed'));
        }
    }
});

// Upload and verify documents with OCR
router.post('/upload-documents',
    authenticateToken,
    upload.fields([
        { name: 'frontId', maxCount: 1 },
        { name: 'backId', maxCount: 1 }
    ]),
    async (req, res) => {
        try {
            const { files, user } = req;

            // Validate that at least front ID is uploaded
            if (!files || !files.frontId) {
                return res.status(400).json({
                    success: false,
                    message: 'Front side of student ID is required'
                });
            }

            // Get user information for validation
            const userInfo = await getOne(
                'SELECT student_no, fname, lname, email FROM users WHERE id = ?',
                [user.id]
            );

            if (!userInfo) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const fullName = `${userInfo.fname} ${userInfo.lname}`;

            // Process front ID
            const frontIdPath = files.frontId[0].path;
            console.log(`Processing front ID for user ${user.id}: ${frontIdPath}`);

            const frontResult = await ocrService.processDocument(frontIdPath, {
                student_id: userInfo.student_no,
                full_name: fullName,
                email: userInfo.email
            });

            // Process back ID if provided
            let backResult = null;
            if (files.backId && files.backId[0]) {
                const backIdPath = files.backId[0].path;
                console.log(`Processing back ID for user ${user.id}: ${backIdPath}`);

                backResult = await ocrService.processDocument(backIdPath, {
                    student_id: userInfo.student_no,
                    full_name: fullName,
                    email: userInfo.email
                });
            }

            // Calculate combined confidence
            const combinedConfidence = backResult
                ? Math.max(frontResult.confidence, backResult.confidence)
                : frontResult.confidence;

            // Strict rule: verify only if BOTH name and student ID match
            const frontStrict = !!(frontResult?.extractedInfo?.matches?.name && frontResult?.extractedInfo?.matches?.studentId);
            const backStrict = !!(backResult?.extractedInfo?.matches?.name && backResult?.extractedInfo?.matches?.studentId);
            const strictMatch = frontStrict || backStrict;

            // Collect failure reasons from the best result
            const bestAuthResult = backResult && backResult.confidence > frontResult.confidence ? backResult : frontResult;
            const authFailureReasons = bestAuthResult.failureReasons || [];

            const autoApproved = strictMatch;
            const verificationStatus = autoApproved ? 'verified' : 'pending_review';

            // Store verification record in database
            const verificationResult = await executeQuery(`
                INSERT INTO verification_documents (
                    user_id,
                    front_id_path,
                    back_id_path,
                    front_ocr_text,
                    back_ocr_text,
                    front_extracted_info,
                    back_extracted_info,
                    front_confidence,
                    back_confidence,
                    combined_confidence,
                    status,
                    auto_approved,
                    processed_at,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                user.id,
                frontIdPath,
                files.backId ? files.backId[0].path : null,
                frontResult.extractedText || null,
                backResult ? backResult.extractedText : null,
                JSON.stringify(frontResult.extractedInfo || {}),
                backResult ? JSON.stringify(backResult.extractedInfo || {}) : null,
                frontResult.confidence || 0,
                backResult ? backResult.confidence : null,
                combinedConfidence,
                verificationStatus,
                autoApproved ? 1 : 0
            ]);

            // Update user verification status
            try {
                await executeQuery(
                    "UPDATE users SET verification_status = ?, verification_method = ?, is_verified = CASE WHEN ? AND email_verified = 1 THEN 1 ELSE 0 END, modified = NOW() WHERE id = ?",
                    [verificationStatus, 'document_upload', autoApproved ? 1 : 0, user.id]
                );
            } catch (e) {
                const msg = (e && (e.sqlMessage || e.message || '')).toLowerCase();
                if (e && e.code === 'ER_BAD_FIELD_ERROR' && msg.includes('email_verified')) {
                    // Fallback when email_verified column is absent: base is_verified only on document auto-approval
                    await executeQuery(
                        "UPDATE users SET verification_status = ?, verification_method = ?, is_verified = CASE WHEN ? THEN 1 ELSE 0 END, modified = NOW() WHERE id = ?",
                        [verificationStatus, 'document_upload', autoApproved ? 1 : 0, user.id]
                    );
                } else {
                    throw e;
                }
            }

            // Generate appropriate message
            let authMessage;
            if (autoApproved) {
                authMessage = 'Documents verified successfully! Your account is now verified.';
            } else {
                if (authFailureReasons.length > 0) {
                    authMessage = `Verification pending: ${authFailureReasons.join(' ')}`;
                } else {
                    authMessage = 'Documents uploaded successfully. Admin review is in progress.';
                }
            }

            // Send response
            res.json({
                success: true,
                message: authMessage,
                verificationId: verificationResult.insertId,
                combinedConfidence: combinedConfidence,
                autoApproved: autoApproved,
                requiresReview: !autoApproved,
                status: verificationStatus,
                failureReasons: authFailureReasons,
                confidenceDetails: bestAuthResult.confidenceDetails
            });

        } catch (error) {
            console.error('Document upload error:', error);

            // Clean up uploaded files on error
            if (req.files) {
                const filesToClean = [];
                if (req.files.frontId) filesToClean.push(req.files.frontId[0].path);
                if (req.files.backId) filesToClean.push(req.files.backId[0].path);

                for (const filePath of filesToClean) {
                    try {
                        await fs.unlink(filePath);
                    } catch (cleanupError) {
                        console.warn('Failed to cleanup file:', cleanupError);
                    }
                }
            }

            res.status(500).json({
                success: false,
                message: 'Document processing failed',
                error: error.message
            });
        }
    }
);

module.exports = router;
