const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const { getOne, executeQuery } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const ocrService = require('../services/ocrService_enhanced');
const NotificationHelper = require('../services/notificationHelper');

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

        // ✅ Check if ALREADY VERIFIED (by any method)
        const [userRows] = await pool.query(
            `SELECT is_verified, credits FROM users WHERE id = ?`,
            [userId]
        );

        const isFirstTimeVerification = !userRows[0].is_verified; // Check is_verified, not just email_verified
        const oldCredits = userRows[0].credits;

        console.log('🎯 Is first time verification?', isFirstTimeVerification);

        // Update user - mark as FULLY verified
        try {
            await pool.query(
                `UPDATE users 
                 SET email_verified = TRUE, 
                     verification_status = 'verified',
                     verification_method = 'email',
                     is_verified = 1,
                     credits = credits + ?,
                     modified = NOW()
                 WHERE id = ?`,
                [isFirstTimeVerification ? 15 : 0, userId]
            );
        } catch (e) {
            if (e && e.code === 'ER_BAD_FIELD_ERROR') {
                await pool.query(
                    `UPDATE users 
                     SET verification_status = 'verified',
                         verification_method = 'email',
                         is_verified = 1,
                         credits = credits + ?,
                         modified = NOW()
                     WHERE id = ?`,
                    [isFirstTimeVerification ? 15 : 0, userId]
                );
            } else {
                throw e;
            }
        }

        // Log credit history if bonus was awarded
        if (isFirstTimeVerification) {
            const newCredits = oldCredits + 15;

            await pool.query(
                `INSERT INTO credit_history (user_id, credit_change, reason, old_balance, new_balance, created_at)
                 VALUES (?, 15, 'Account verification bonus', ?, ?, NOW())`,
                [userId, oldCredits, newCredits]
            );

            console.log(`✅ Verification bonus awarded: User ${userId} received +15 credits (${oldCredits} → ${newCredits})`);
        }

        // Get updated user data
        const [updatedUser] = await pool.query(
            `SELECT id, email, first_name, last_name, credits, is_verified, 
                    email_verified, verification_status, verification_method 
             FROM users 
             WHERE id = ?`,
            [userId]
        );

        res.json({
            message: 'Email verified successfully',
            bonusAwarded: isFirstTimeVerification,
            creditsEarned: isFirstTimeVerification ? 15 : 0,
            user: updatedUser[0]
        });

    } catch (error) {
        console.error('❌ Error verifying OTP:', error);
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

// Upload and verify documents with OCR (now processed asynchronously in background)
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

            const frontIdPath = files.frontId[0].path;
            const backIdPath = files.backId && files.backId[0] ? files.backId[0].path : null;
            console.log(`Queuing OCR processing for user ${user.id}: front=${frontIdPath}, back=${backIdPath}`);

            // Respond immediately so the frontend isn't blocked by OCR duration
            res.json({
                success: true,
                status: 'queued',
                message: 'Documents uploaded. We\'ll notify you once processing is complete.'
            });

            // Run OCR + verification in background (fire-and-forget)
            (async () => {
                await runOcrAndFinalizeVerification({
                    user,
                    userInfo,
                    frontIdPath,
                    backIdPath
                });
            })().catch(err => {
                console.error('Background OCR job crashed:', err);
                // Best-effort: notify user of failure
                if (user && user.id) {
                    NotificationHelper.notifyVerificationFailure(user.id, err.message).catch(e => {
                        console.error('Failed to send verification failure notification:', e);
                    });
                }
            });

        } catch (error) {
            console.error('Document upload error:', error);

            // Clean up uploaded files on error (only if response not yet sent)
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

            return res.status(500).json({
                success: false,
                message: 'Document upload failed',
                error: error.message
            });
        }
    }
);

// Background OCR + verification job handler
async function runOcrAndFinalizeVerification({ user, userInfo, frontIdPath, backIdPath }) {
    try {
        const fullName = `${userInfo.fname} ${userInfo.lname}`;

        // Process front ID
        console.log(`Processing front ID for user ${user.id}: ${frontIdPath}`);
        const frontResult = await ocrService.processDocument(frontIdPath, {
            student_id: userInfo.student_no,
            full_name: fullName,
            email: userInfo.email
        });

        // Process back ID if provided
        let backResult = null;
        if (backIdPath) {
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

        const bestAuthResult = backResult && backResult.confidence > frontResult.confidence ? backResult : frontResult;
        const authFailureReasons = bestAuthResult.failureReasons || [];

        const autoApproved = strictMatch;
        const verificationStatus = autoApproved ? 'verified' : 'pending_review';

        // Store verification record
        const verificationResult = await executeQuery(`
            INSERT INTO verification_documents (
                user_id, front_id_path, back_id_path, front_ocr_text, back_ocr_text,
                front_extracted_info, back_extracted_info, front_confidence, back_confidence,
                combined_confidence, status, auto_approved, processed_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [
            user.id, frontIdPath, backIdPath || null,
            frontResult.extractedText || null, backResult ? backResult.extractedText : null,
            JSON.stringify(frontResult.extractedInfo || {}),
            backResult ? JSON.stringify(backResult.extractedInfo || {}) : null,
            frontResult.confidence || 0, backResult ? backResult.confidence : null,
            combinedConfidence, verificationStatus, autoApproved ? 1 : 0
        ]);

        // ✅ Check if ALREADY VERIFIED (bonus only once, regardless of method)
        let isFirstTimeVerification = false;
        let oldCredits = 0;

        if (autoApproved) {
            const [userRows] = await executeQuery(
                `SELECT is_verified, credits FROM users WHERE id = ?`,
                [user.id]
            );

            isFirstTimeVerification = !userRows[0].is_verified; // Check is_verified, not id_verified
            oldCredits = userRows[0].credits;
        }

        console.log('🎯 Document verification - First time?', isFirstTimeVerification);

        // Update user - mark as FULLY verified if auto-approved
        try {
            await executeQuery(
                `UPDATE users 
                 SET verification_status = ?, 
                     verification_method = ?, 
                     is_verified = CASE WHEN ? THEN 1 ELSE is_verified END,
                     id_verified = CASE WHEN ? THEN TRUE ELSE id_verified END,
                     credits = credits + ?,
                     modified = NOW() 
                 WHERE id = ?`,
                [verificationStatus, 'document_upload', autoApproved, autoApproved, isFirstTimeVerification ? 15 : 0, user.id]
            );
        } catch (e) {
            const msg = (e && (e.sqlMessage || e.message || '')).toLowerCase();
            if (e && e.code === 'ER_BAD_FIELD_ERROR') {
                await executeQuery(
                    `UPDATE users 
                     SET verification_status = ?, 
                         verification_method = ?, 
                         is_verified = CASE WHEN ? THEN 1 ELSE is_verified END,
                         id_verified = CASE WHEN ? THEN TRUE ELSE id_verified END,
                         credits = credits + ?,
                         modified = NOW() 
                     WHERE id = ?`,
                    [verificationStatus, 'document_upload', autoApproved, autoApproved, isFirstTimeVerification ? 15 : 0, user.id]
                );
            } else {
                throw e;
            }
        }

        // ✅ Log credit history if bonus was awarded
        if (isFirstTimeVerification) {
            const newCredits = oldCredits + 15;

            await executeQuery(
                `INSERT INTO credit_history (user_id, credit_change, reason, old_balance, new_balance, created_at)
                 VALUES (?, 15, 'Account verification bonus (document)', ?, ?, NOW())`,
                [user.id, oldCredits, newCredits]
            );

            console.log(`✅ Verification bonus awarded: User ${user.id} received +15 credits (${oldCredits} → ${newCredits})`);
        }

        // Notify user
        await NotificationHelper.notifyVerificationResult(user.id, {
            verificationId: verificationResult.insertId,
            autoApproved,
            verificationStatus,
            failureReasons: authFailureReasons,
            bonusAwarded: isFirstTimeVerification
        });

        console.log(`OCR verification completed for user ${user.id} with status ${verificationStatus}`);

    } catch (error) {
        console.error('Background OCR processing error:', error);
        if (user && user.id) {
            await NotificationHelper.notifyVerificationFailure(user.id, error.message).catch(e => {
                console.error('Failed to send verification failure notification:', e);
            });
        }
    }
}



module.exports = router;

module.exports = router;
