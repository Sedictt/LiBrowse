const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const { pool, getOne, executeQuery } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const ocrService = require('../services/ocrService_enhanced');
const NotificationHelper = require('../services/notificationHelper');

// Generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Get verification reward settings from database
 * Returns default values if settings not found
 */
async function getVerificationRewardSettings() {
    try {
        const settings = await executeQuery(
            `SELECT setting_name, setting_val FROM settings 
             WHERE setting_name IN ('verification_reward_level_1', 'verification_reward_level_2', 'verification_rewards_enabled')`
        );
        
        const settingsMap = {};
        for (const row of settings) {
            settingsMap[row.setting_name] = row.setting_val;
        }
        
        return {
            level1Reward: parseInt(settingsMap.verification_reward_level_1 || '15', 10),
            level2Reward: parseInt(settingsMap.verification_reward_level_2 || '15', 10),
            enabled: settingsMap.verification_rewards_enabled !== 'false'
        };
    } catch (error) {
        console.warn('Could not load verification reward settings, using defaults:', error.message);
        return { level1Reward: 15, level2Reward: 15, enabled: true };
    }
}

/**
 * Calculate and award verification credits based on the user's verification state
 * Level 1 (Verified): Either email OR document verified - awards level1Reward
 * Level 2 (Fully Verified): Both email AND document verified - awards level2Reward
 * 
 * @param {number} userId - The user's ID
 * @param {string} verificationMethod - 'email' or 'document'
 * @returns {Object} - { creditsAwarded, level, oldBalance, newBalance }
 */
async function processVerificationRewards(userId, verificationMethod) {
    const rewardSettings = await getVerificationRewardSettings();
    
    if (!rewardSettings.enabled) {
        console.log('🔕 Verification rewards are disabled');
        return { creditsAwarded: 0, level: null, oldBalance: 0, newBalance: 0 };
    }
    
    // Get current user state including reward claim flags
    let userState;
    try {
        const [rows] = await pool.query(
            `SELECT is_verified, email_verified, verification_status, credits,
                    COALESCE(verification_reward_l1_claimed, FALSE) as l1_claimed,
                    COALESCE(verification_reward_l2_claimed, FALSE) as l2_claimed
             FROM users WHERE id = ?`,
            [userId]
        );
        userState = rows[0];
    } catch (e) {
        // Fallback if new columns don't exist yet
        if (e.code === 'ER_BAD_FIELD_ERROR') {
            const [rows] = await pool.query(
                `SELECT is_verified, email_verified, verification_status, credits
                 FROM users WHERE id = ?`,
                [userId]
            );
            userState = { ...rows[0], l1_claimed: false, l2_claimed: false };
        } else {
            throw e;
        }
    }
    
    if (!userState) {
        throw new Error('User not found');
    }
    
    const oldBalance = userState.credits || 0;
    let creditsToAward = 0;
    let rewardLevel = null;
    
    // Determine current verification state AFTER this verification
    const emailVerified = verificationMethod === 'email' ? true : !!userState.email_verified;
    const docVerified = verificationMethod === 'document' ? true : (userState.verification_status === 'verified');
    const isNowVerified = emailVerified || docVerified;
    const isNowFullyVerified = emailVerified && docVerified;
    
    console.log('📊 Verification state check:', {
        userId,
        verificationMethod,
        emailVerified,
        docVerified,
        isNowVerified,
        isNowFullyVerified,
        l1Claimed: userState.l1_claimed,
        l2Claimed: userState.l2_claimed
    });
    
    // Check for Level 1 reward (first time reaching Verified status)
    if (isNowVerified && !userState.l1_claimed) {
        creditsToAward += rewardSettings.level1Reward;
        rewardLevel = 1;
        console.log(`🎯 Level 1 (Verified) reward eligible: +${rewardSettings.level1Reward} credits`);
    }
    
    // Check for Level 2 reward (first time reaching Fully Verified status)
    if (isNowFullyVerified && !userState.l2_claimed) {
        creditsToAward += rewardSettings.level2Reward;
        rewardLevel = userState.l1_claimed ? 2 : 'both'; // 'both' means claiming L1 and L2 together
        console.log(`🎯 Level 2 (Fully Verified) reward eligible: +${rewardSettings.level2Reward} credits`);
    }
    
    if (creditsToAward === 0) {
        console.log('ℹ️ No verification rewards to claim (already claimed or not eligible)');
        return { creditsAwarded: 0, level: null, oldBalance, newBalance: oldBalance };
    }
    
    // Award credits and update claim flags
    const newBalance = oldBalance + creditsToAward;
    const updateL1 = isNowVerified && !userState.l1_claimed;
    const updateL2 = isNowFullyVerified && !userState.l2_claimed;
    
    try {
        await pool.query(
            `UPDATE users SET 
                credits = credits + ?,
                verification_reward_l1_claimed = CASE WHEN ? THEN TRUE ELSE verification_reward_l1_claimed END,
                verification_reward_l2_claimed = CASE WHEN ? THEN TRUE ELSE verification_reward_l2_claimed END,
                modified = NOW()
             WHERE id = ?`,
            [creditsToAward, updateL1, updateL2, userId]
        );
    } catch (e) {
        // Fallback if new columns don't exist
        if (e.code === 'ER_BAD_FIELD_ERROR') {
            await pool.query(
                `UPDATE users SET credits = credits + ?, modified = NOW() WHERE id = ?`,
                [creditsToAward, userId]
            );
        } else {
            throw e;
        }
    }
    
    // Log to credit history
    const reason = rewardLevel === 'both' 
        ? 'Full account verification bonus (Verified + Fully Verified)'
        : rewardLevel === 1 
            ? `Account verification bonus (Verified via ${verificationMethod})`
            : `Full account verification bonus (Fully Verified via ${verificationMethod})`;
    
    await executeQuery(
        `INSERT INTO credit_history (user_id, credit_change, reason, old_balance, new_balance, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [userId, creditsToAward, reason, oldBalance, newBalance]
    );
    
    console.log(`✅ Verification reward awarded: User ${userId} received +${creditsToAward} credits (${oldBalance} → ${newBalance})`);
    
    return { creditsAwarded, level: rewardLevel, oldBalance, newBalance };
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

        // Update user - mark email as verified
        try {
            await pool.query(
                `UPDATE users 
                 SET email_verified = TRUE, 
                     verification_status = 'verified',
                     verification_method = COALESCE(verification_method, 'email'),
                     is_verified = 1,
                     modified = NOW()
                 WHERE id = ?`,
                [userId]
            );
        } catch (e) {
            if (e && e.code === 'ER_BAD_FIELD_ERROR') {
                await pool.query(
                    `UPDATE users 
                     SET verification_status = 'verified',
                         verification_method = 'email',
                         is_verified = 1,
                         modified = NOW()
                     WHERE id = ?`,
                    [userId]
                );
            } else {
                throw e;
            }
        }

        // Process verification rewards (handles both L1 and L2 rewards)
        const rewardResult = await processVerificationRewards(userId, 'email');

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
            bonusAwarded: rewardResult.creditsAwarded > 0,
            creditsEarned: rewardResult.creditsAwarded,
            rewardLevel: rewardResult.level,
            user: updatedUser[0]
        });

    } catch (error) {
        console.error('❌ Error verifying OTP:', error);
        res.status(500).json({ error: 'Failed to verify OTP' });
    }
});


// Get verification reward settings (public endpoint for UI)
router.get('/rewards', async (req, res) => {
    try {
        const settings = await getVerificationRewardSettings();
        res.json({
            level1: {
                name: 'Verified',
                description: 'Complete either email or document verification',
                credits: settings.level1Reward
            },
            level2: {
                name: 'Fully Verified',
                description: 'Complete both email AND document verification',
                credits: settings.level2Reward
            },
            enabled: settings.enabled,
            totalPossible: settings.level1Reward + settings.level2Reward
        });
    } catch (error) {
        console.error('Error fetching verification rewards:', error);
        res.status(500).json({ error: 'Failed to fetch verification rewards' });
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

        // Update user - mark as verified if auto-approved
        if (autoApproved) {
            try {
                await executeQuery(
                    `UPDATE users 
                     SET verification_status = ?, 
                         verification_method = COALESCE(verification_method, ?),
                         is_verified = 1,
                         id_verified = TRUE,
                         modified = NOW() 
                     WHERE id = ?`,
                    [verificationStatus, 'document_upload', user.id]
                );
            } catch (e) {
                if (e && e.code === 'ER_BAD_FIELD_ERROR') {
                    await executeQuery(
                        `UPDATE users 
                         SET verification_status = ?, 
                             verification_method = 'document_upload',
                             is_verified = 1,
                             modified = NOW() 
                         WHERE id = ?`,
                        [verificationStatus, user.id]
                    );
                } else {
                    throw e;
                }
            }
        } else {
            // Just update status to pending_review
            await executeQuery(
                `UPDATE users SET verification_status = ?, modified = NOW() WHERE id = ?`,
                [verificationStatus, user.id]
            );
        }

        // Process verification rewards if auto-approved (handles both L1 and L2 rewards)
        let rewardResult = { creditsAwarded: 0, level: null };
        if (autoApproved) {
            rewardResult = await processVerificationRewards(user.id, 'document');
        }

        // Notify user
        await NotificationHelper.notifyVerificationResult(user.id, {
            verificationId: verificationResult.insertId,
            autoApproved,
            verificationStatus,
            failureReasons: authFailureReasons,
            bonusAwarded: rewardResult.creditsAwarded > 0,
            creditsEarned: rewardResult.creditsAwarded,
            rewardLevel: rewardResult.level
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
