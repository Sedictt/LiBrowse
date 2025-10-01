/**
 * Verification Routes - Handle document upload and OCR processing
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const ocrService = require('../services/ocrService_enhanced');
const { pool } = require('../config/database');
const router = express.Router();

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
        // Fallback to a safe identifier when unauthenticated (e.g., test endpoint)
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

/**
 * POST /api/verification/upload-documents-test
 * Upload student ID documents for OCR verification (test version without auth)
 */
router.post('/upload-documents-test', 
    upload.fields([
        { name: 'frontId', maxCount: 1 },
        { name: 'backId', maxCount: 1 }
    ]),
    async (req, res) => {
        try {
            const { files } = req;
            
            // Validate that at least front ID is uploaded
            if (!files || !files.frontId) {
                return res.status(400).json({
                    success: false,
                    message: 'Front side of student ID is required'
                });
            }

            // Use test user info if no user is authenticated
            // Check if custom test data is provided in the request
            const customStudentId = req.body.test_student_id;
            const customFullName = req.body.test_full_name;
            
            const testUserInfo = {
                student_id: customStudentId || '2021-12345',
                full_name: customFullName || 'Test Student',
                email: 'test@plv.edu.ph'
            };
            
            console.log('🔬 [OCR DEBUG] Using test user info:', testUserInfo);

            // Process front ID
            const frontIdPath = files.frontId[0].path;
            console.log('🔬 [OCR DEBUG] Processing front ID:', frontIdPath);
            console.log('🔬 [OCR DEBUG] Test user info:', testUserInfo);
            
            const frontResult = await ocrService.processDocument(frontIdPath, testUserInfo);
            console.log('🔬 [OCR DEBUG] Front ID OCR result:', JSON.stringify(frontResult, null, 2));

            let backResult = null;
            if (files.backId) {
                const backIdPath = files.backId[0].path;
                console.log('Processing back ID:', backIdPath);
                backResult = await ocrService.processDocument(backIdPath, testUserInfo);
                console.log('Back ID OCR result:', backResult);
            }

            // Calculate combined confidence (for reference/analytics)
            const combinedConfidence = backResult 
                ? Math.max(frontResult.confidence, backResult.confidence)
                : frontResult.confidence;

            // Strict rule: verify only if BOTH name and student ID match (front or back)
            const frontStrict = !!(frontResult?.extractedInfo?.matches?.name && frontResult?.extractedInfo?.matches?.studentId);
            const backStrict = !!(backResult?.extractedInfo?.matches?.name && backResult?.extractedInfo?.matches?.studentId);
            const strictMatch = frontStrict || backStrict;

            // Collect failure reasons from the best result
            const bestResult = backResult && backResult.confidence > frontResult.confidence ? backResult : frontResult;
            const failureReasons = bestResult.failureReasons || [];
            
            console.log('🔬 [OCR DEBUG] Strict matching results:');
            console.log('🔬 [OCR DEBUG] Front strict match:', frontStrict);
            console.log('🔬 [OCR DEBUG] Back strict match:', backStrict);
            console.log('🔬 [OCR DEBUG] Overall strict match:', strictMatch);
            console.log('🔬 [OCR DEBUG] Failure reasons:', failureReasons);

            const autoApproved = strictMatch;
            const verificationStatus = autoApproved ? 'verified' : 'pending_review';
            
            console.log('🔬 [OCR DEBUG] Final decision:');
            console.log('🔬 [OCR DEBUG] Auto-approved:', autoApproved);
            console.log('🔬 [OCR DEBUG] Status:', verificationStatus);

            // Resolve a valid user id to avoid FK constraint issues during testing
            let resolvedUserId = null;
            try {
                const [anyUser] = await pool.execute('SELECT id FROM users ORDER BY id ASC LIMIT 1');
                if (anyUser.length) {
                    resolvedUserId = anyUser[0].id;
                }
            } catch (_) { /* ignore */ }

            let verificationId = null;
            if (resolvedUserId) {
                // Store verification record in database (using first available user)
                verificationId = await storeVerificationRecord({
                    userId: resolvedUserId,
                    frontIdPath: frontIdPath,
                    backIdPath: files.backId ? files.backId[0].path : null,
                    frontResult: frontResult,
                    backResult: backResult,
                    combinedConfidence: combinedConfidence,
                    status: verificationStatus,
                    autoApproved: autoApproved
                });
            }

            // Generate appropriate message based on verification result
            let message;
            if (autoApproved) {
                message = 'Documents verified successfully! Your account is now verified.';
            } else {
                if (failureReasons.length > 0) {
                    message = `Verification failed: ${failureReasons.join(' ')}`;
                } else {
                    message = 'Documents uploaded successfully. Admin review is in progress.';
                }
            }

            // Send response
            res.json({
                success: true,
                message: message,
                verificationId: verificationId,
                results: {
                    front: frontResult,
                    back: backResult
                },
                combinedConfidence: combinedConfidence,
                autoApproved: autoApproved,
                requiresReview: !autoApproved,
                extractedText: frontResult.extractedText,
                extractedInfo: frontResult.extractedInfo,
                failureReasons: failureReasons,
                confidenceDetails: bestResult.confidenceDetails
            });

        } catch (error) {
            console.error('Document verification error:', error);
            res.status(500).json({
                success: false,
                message: 'Document processing failed',
                error: error.message
            });
        }
    }
);

/**
 * POST /api/verification/upload-documents
 * Upload student ID documents for OCR verification
 */
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
            const [userRows] = await pool.execute(
                'SELECT student_id, first_name, last_name, email FROM users WHERE id = ?',
                [user.id]
            );

            if (userRows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const userInfo = userRows[0];
            const fullName = `${userInfo.first_name} ${userInfo.last_name}`;
            const results = [];

            // Process front ID
            const frontIdPath = files.frontId[0].path;
            console.log(`Processing front ID for user ${user.id}: ${frontIdPath}`);
            
            const frontResult = await ocrService.processDocument(frontIdPath, {
                student_id: userInfo.student_id,
                full_name: fullName,
                email: userInfo.email
            });

            results.push({
                side: 'front',
                filename: files.frontId[0].filename,
                ...frontResult
            });

            // Process back ID if provided
            let backResult = null;
            if (files.backId && files.backId[0]) {
                const backIdPath = files.backId[0].path;
                console.log(`Processing back ID for user ${user.id}: ${backIdPath}`);
                
                backResult = await ocrService.processDocument(backIdPath, {
                    student_id: userInfo.student_id,
                    full_name: fullName,
                    email: userInfo.email
                });

                results.push({
                    side: 'back',
                    filename: files.backId[0].filename,
                    ...backResult
                });
            }

            // Calculate combined confidence (for reference/analytics)
            const combinedConfidence = backResult 
                ? Math.max(frontResult.confidence, backResult.confidence)
                : frontResult.confidence;

            // Strict rule: verify only if BOTH name and student ID match (front or back)
            const frontStrict = !!(frontResult?.extractedInfo?.matches?.name && frontResult?.extractedInfo?.matches?.studentId);
            const backStrict = !!(backResult?.extractedInfo?.matches?.name && backResult?.extractedInfo?.matches?.studentId);
            const strictMatch = frontStrict || backStrict;

            // Collect failure reasons from the best result
            const bestAuthResult = backResult && backResult.confidence > frontResult.confidence ? backResult : frontResult;
            const authFailureReasons = bestAuthResult.failureReasons || [];

            const autoApproved = strictMatch;
            const verificationStatus = autoApproved ? 'verified' : 'pending_review';

            // Store verification record in database
            const verificationId = await storeVerificationRecord({
                userId: user.id,
                frontIdPath: frontIdPath,
                backIdPath: files.backId ? files.backId[0].path : null,
                frontResult: frontResult,
                backResult: backResult,
                combinedConfidence: combinedConfidence,
                status: verificationStatus,
                autoApproved: autoApproved
            });

            // Update user verification status
            await pool.execute(
                'UPDATE users SET verification_status = ?, verification_method = ?, updated_at = NOW() WHERE id = ?',
                [verificationStatus, 'document_upload', user.id]
            );

            // Generate appropriate message based on verification result
            let authMessage;
            if (autoApproved) {
                authMessage = 'Documents verified successfully! Your account is now verified.';
            } else {
                if (authFailureReasons.length > 0) {
                    authMessage = `Verification failed: ${authFailureReasons.join(' ')}`;
                } else {
                    authMessage = 'Documents uploaded successfully. Admin review is in progress.';
                }
            }

            // Send response
            res.json({
                success: true,
                message: authMessage,
                verificationId: verificationId,
                results: results,
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

/**
 * Store verification record in database
 */
async function storeVerificationRecord(data) {
    const {
        userId,
        frontIdPath,
        backIdPath,
        frontResult,
        backResult,
        combinedConfidence,
        status,
        autoApproved
    } = data;

    const [result] = await pool.execute(`
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
        userId,
        frontIdPath,
        backIdPath,
        frontResult.extractedText || null,
        backResult ? backResult.extractedText : null,
        JSON.stringify(frontResult.extractedInfo || {}),
        backResult ? JSON.stringify(backResult.extractedInfo || {}) : null,
        frontResult.confidence || 0,
        backResult ? backResult.confidence : null,
        combinedConfidence,
        status,
        autoApproved ? 1 : 0
    ]);

    return result.insertId;
}

/**
 * GET /api/verification/status
 * Get current verification status for user
 */
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const [userRows] = await pool.execute(
            'SELECT verification_status, verification_method FROM users WHERE id = ?',
            [req.user.id]
        );

        if (userRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = userRows[0];

        // Get latest verification attempt if exists
        const [verificationRows] = await pool.execute(`
            SELECT 
                id,
                status,
                combined_confidence,
                auto_approved,
                processed_at,
                created_at,
                admin_notes
            FROM verification_documents 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `, [req.user.id]);

        const latestVerification = verificationRows.length > 0 ? verificationRows[0] : null;

        res.json({
            success: true,
            verificationStatus: user.verification_status,
            verificationMethod: user.verification_method,
            latestAttempt: latestVerification
        });

    } catch (error) {
        console.error('Verification status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get verification status',
            error: error.message
        });
    }
});

/**
 * POST /api/verification/retry
 * Allow user to retry verification with new documents
 */
router.post('/retry', authenticateToken, async (req, res) => {
    try {
        // Check if user can retry (not already verified)
        const [userRows] = await pool.execute(
            'SELECT verification_status FROM users WHERE id = ?',
            [req.user.id]
        );

        if (userRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (userRows[0].verification_status === 'verified') {
            return res.status(400).json({
                success: false,
                message: 'Account is already verified'
            });
        }

        // Reset verification status to allow new upload
        await pool.execute(
            'UPDATE users SET verification_status = ?, updated_at = NOW() WHERE id = ?',
            ['pending', req.user.id]
        );

        res.json({
            success: true,
            message: 'Verification reset. You can now upload new documents.'
        });

    } catch (error) {
        console.error('Verification retry error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset verification',
            error: error.message
        });
    }
});

/**
 * GET /api/verification/history
 * Get verification attempt history for user
 */
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const [verificationRows] = await pool.execute(`
            SELECT 
                id,
                status,
                combined_confidence,
                auto_approved,
                processed_at,
                created_at,
                admin_notes,
                admin_reviewed_at,
                admin_reviewed_by
            FROM verification_documents 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `, [req.user.id]);

        res.json({
            success: true,
            attempts: verificationRows
        });

    } catch (error) {
        console.error('Verification history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get verification history',
            error: error.message
        });
    }
});

/**
 * GET /api/verification/stats
 * Get OCR service statistics (for debugging/monitoring)
 */
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const stats = ocrService.getProcessingStats();
        
        // Get system verification statistics
        const [systemStats] = await pool.execute(`
            SELECT 
                COUNT(*) as total_attempts,
                SUM(CASE WHEN auto_approved = 1 THEN 1 ELSE 0 END) as auto_approved,
                SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
                SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) as pending_review,
                AVG(combined_confidence) as avg_confidence
            FROM verification_documents
        `);

        res.json({
            success: true,
            ocrStats: stats,
            systemStats: systemStats[0]
        });

    } catch (error) {
        console.error('Verification stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get verification statistics',
            error: error.message
        });
    }
});

module.exports = router;
