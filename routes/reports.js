const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { calculateConfidence, isInCooldown } = require('../services/reports/logic');

// Configuration - Adjudication Thresholds
const CONFIG = {
    CONFIDENCE_THRESHOLD: 70, // Auto-resolve if confidence >= 70%
    MIN_SIGNAL_COUNT: 2, // Require at least 2 signals for auto-resolution
    DUPLICATE_TIME_WINDOW: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    REPORT_COOLDOWN: 15 * 60 * 1000, // 15 minutes between reports from same user
    MAX_REPORTS_PER_DAY: 10, // Max reports per user per day
    TRUST_SCORE_WEIGHT: 0.3, // Weight of reporter trust score in final confidence
    
    // Penalties
    PENALTIES: {
        spam: 50,
        abuse: 100,
        scam: 200,
        other: 25
    },
    
    // Trust score adjustments
    TRUST_ADJUSTMENTS: {
        valid_report: +5,
        false_report: -10,
        spam_report: -15
    },
    
    // Signal weights
    SIGNAL_WEIGHTS: {
        keyword_match: 30,
        pattern_match: 25,
        user_history: 20,
        multiple_reports: 35,
        time_cluster: 15
    }
};

// Harmful keyword patterns
const HARMFUL_KEYWORDS = [
    /scam|fraud|fake/i,
    /send\s+money|payment|wire\s+transfer/i,
    /personal\s+information|password|credit\s+card/i,
    /harassment|threat|harm/i,
    /spam|advertisement|promotion/i
];

// Initialize or get reporter trust score
async function getReporterTrust(connection, userId) {
    const [trust] = await connection.query(
        'SELECT * FROM reporter_trust_scores WHERE user_id = ?',
        [userId]
    );
    
    if (trust.length === 0) {
        await connection.query(
            'INSERT INTO reporter_trust_scores (user_id) VALUES (?)',
            [userId]
        );
        return { trust_score: 50.0, total_reports: 0, is_flagged: 0, cooldown_until: null };
    }
    
    return trust[0];
}

// Check if reporter is in cooldown - moved to services/reports/logic.js

// Check rate limiting
async function checkRateLimit(connection, userId) {
    const [counts] = await connection.query(`
        SELECT COUNT(*) as report_count
        FROM chat_reports
        WHERE reporter_id = ? AND created >= DATE_SUB(NOW(), INTERVAL 1 DAY)
    `, [userId]);
    
    return counts[0].report_count < CONFIG.MAX_REPORTS_PER_DAY;
}

// Detect duplicate reports
async function findDuplicateReport(connection, reporterId, reportedId, chatId, messageId, reason) {
    const [duplicates] = await connection.query(`
        SELECT id FROM chat_reports
        WHERE reporter_id = ? 
        AND reported_id = ?
        AND chat_id = ?
        AND (message_id = ? OR message_id IS NULL)
        AND reason = ?
        AND created >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        AND status != 'closed'
        LIMIT 1
    `, [reporterId, reportedId, chatId, messageId, reason]);
    
    return duplicates.length > 0 ? duplicates[0].id : null;
}

// Analyze message for harmful content
async function analyzeMessage(connection, messageId) {
    const signals = [];
    
    const [messages] = await connection.query(
        'SELECT message FROM chat_messages WHERE id = ?',
        [messageId]
    );
    
    if (messages.length === 0) return signals;
    
    const messageText = messages[0].message;
    
    // Keyword matching
    let keywordMatches = 0;
    for (const pattern of HARMFUL_KEYWORDS) {
        if (pattern.test(messageText)) {
            keywordMatches++;
        }
    }
    
    if (keywordMatches > 0) {
        signals.push({
            type: 'keyword_match',
            weight: Math.min(CONFIG.SIGNAL_WEIGHTS.keyword_match * keywordMatches, 40),
            data: { matches: keywordMatches }
        });
    }
    
    // Pattern detection (excessive caps, special chars, URLs)
    const capsRatio = (messageText.match(/[A-Z]/g) || []).length / messageText.length;
    const hasUrls = /https?:\/\//.test(messageText);
    const specialCharRatio = (messageText.match(/[!@#$%^&*]/g) || []).length / messageText.length;
    
    if (capsRatio > 0.7 || specialCharRatio > 0.3 || (hasUrls && messageText.length < 50)) {
        signals.push({
            type: 'pattern_match',
            weight: CONFIG.SIGNAL_WEIGHTS.pattern_match,
            data: { capsRatio, hasUrls, specialCharRatio }
        });
    }
    
    return signals;
}

// Check user history
async function checkUserHistory(connection, reportedId) {
    const signals = [];
    
    // Check previous reports against this user
    const [previousReports] = await connection.query(`
        SELECT COUNT(*) as count, 
               SUM(CASE WHEN auto_resolved = 1 THEN 1 ELSE 0 END) as valid_count
        FROM chat_reports
        WHERE reported_id = ? AND created >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `, [reportedId]);
    
    if (previousReports[0].count >= 3) {
        const validRatio = previousReports[0].valid_count / previousReports[0].count;
        signals.push({
            type: 'user_history',
            weight: CONFIG.SIGNAL_WEIGHTS.user_history * validRatio,
            data: { total: previousReports[0].count, valid: previousReports[0].valid_count }
        });
    }
    
    return signals;
}

// Check for multiple reports in time window
async function checkMultipleReports(connection, reportedId, chatId) {
    const signals = [];
    
    const [recentReports] = await connection.query(`
        SELECT COUNT(DISTINCT reporter_id) as reporter_count
        FROM chat_reports
        WHERE reported_id = ? 
        AND chat_id = ?
        AND created >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
    `, [reportedId, chatId]);
    
    if (recentReports[0].reporter_count >= 2) {
        signals.push({
            type: 'multiple_reports',
            weight: CONFIG.SIGNAL_WEIGHTS.multiple_reports,
            data: { reporters: recentReports[0].reporter_count }
        });
    }
    
    return signals;
}

// Calculate confidence score - moved to services/reports/logic.js

// Apply penalty
async function applyPenalty(connection, reportedId, reason, reportId) {
    const penalty = CONFIG.PENALTIES[reason] || CONFIG.PENALTIES.other;
    
    // Deduct credits
    const [user] = await connection.query(
        'SELECT credits FROM users WHERE id = ?',
        [reportedId]
    );
    
    if (user.length > 0) {
        const oldBalance = user[0].credits;
        const newBalance = Math.max(0, oldBalance - penalty);
        
        await connection.query(
            'UPDATE users SET credits = ? WHERE id = ?',
            [newBalance, reportedId]
        );
        
        // Log credit change
        await connection.query(`
            INSERT INTO credit_history 
            (user_id, credit_change, reason, old_balance, new_balance, remark)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            reportedId,
            -penalty,
            `Penalty for ${reason} violation`,
            oldBalance,
            newBalance,
            `Report ID: ${reportId}`
        ]);
        
        // Create notification
        await connection.query(`
            INSERT INTO notifications (user_id, title, body, category, type)
            VALUES (?, ?, ?, 'system', 'system')
        `, [
            reportedId,
            'Account Penalty',
            `You have been penalized ${penalty} credits for violating community guidelines (${reason}).`
        ]);
        
        return penalty;
    }
    
    return 0;
}

// Submit a report
router.post(
    '/submit',
    authenticateToken,
    [
        body('chatId').isInt({ min: 1 }).withMessage('chatId must be a positive integer').toInt(),
        body('reportedUserId').isInt({ min: 1 }).withMessage('reportedUserId must be a positive integer').toInt(),
        body('messageId').optional().isInt({ min: 1 }).withMessage('messageId must be a positive integer').toInt(),
        body('reason').isIn(['spam', 'abuse', 'scam', 'other']).withMessage('Invalid reason'),
        body('description').optional().isString().isLength({ max: 1000 }).trim()
    ],
    async (req, res) => {
        const connection = await pool.getConnection();

        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                await connection.release();
                return res.status(400).json({ error: 'Validation failed', details: errors.array() });
            }

            const reporterId = req.user.id;
            const { chatId, reportedUserId, messageId, reason, description } = req.body;

            if (reporterId === reportedUserId) {
                await connection.release();
                return res.status(400).json({ error: 'Cannot report yourself' });
            }

            await connection.beginTransaction();

            // Get reporter trust score
            const trust = await getReporterTrust(connection, reporterId);

            // Check cooldown
            if (isInCooldown(trust)) {
                await connection.rollback();
                return res.status(429).json({
                    error: 'You are in cooldown period',
                    cooldownUntil: trust.cooldown_until
                });
            }

            // Check rate limit
            const withinLimit = await checkRateLimit(connection, reporterId);
            if (!withinLimit) {
                await connection.rollback();
                return res.status(429).json({
                    error: `Maximum ${CONFIG.MAX_REPORTS_PER_DAY} reports per day exceeded`
                });
            }

            // Check for duplicate
            const duplicateId = await findDuplicateReport(
                connection, reporterId, reportedUserId, chatId, messageId, reason
            );

            if (duplicateId) {
                await connection.rollback();
                return res.status(409).json({
                    error: 'You have already reported this',
                    duplicateReportId: duplicateId
                });
            }

            // Gather signals
            let signals = [];

            if (messageId) {
                const messageSignals = await analyzeMessage(connection, messageId);
                signals = signals.concat(messageSignals);
            }

            const historySignals = await checkUserHistory(connection, reportedUserId);
            signals = signals.concat(historySignals);

            const multipleSignals = await checkMultipleReports(connection, reportedUserId, chatId);
            signals = signals.concat(multipleSignals);

// Calculate confidence
            const confidence = calculateConfidence(signals, trust.trust_score, {
                trustScoreWeight: CONFIG.TRUST_SCORE_WEIGHT,
                combine: { signals: 0.7, trust: 0.3 }
            });

            // Determine if auto-resolve
            const shouldAutoResolve = (
                confidence >= CONFIG.CONFIDENCE_THRESHOLD &&
                signals.length >= CONFIG.MIN_SIGNAL_COUNT
            );

            // Create report
            const [reportResult] = await connection.query(`
                INSERT INTO chat_reports 
                (chat_id, reporter_id, reported_id, message_id, reason, description,
                 evidence_type, confidence_score, signal_count, auto_resolved, status)
                VALUES (?, ?, ?, ?, ?, ?, 'message', ?, ?, ?, ?)
            `, [
                chatId,
                reporterId,
                reportedUserId,
                messageId,
                reason,
                description,
                confidence,
                signals.length,
                shouldAutoResolve ? 1 : 0,
                shouldAutoResolve ? 'checked' : 'pending'
            ]);

            const reportId = reportResult.insertId;

            // Store signals
            for (const signal of signals) {
                await connection.query(`
                    INSERT INTO report_signals (report_id, signal_type, signal_weight, signal_data)
                    VALUES (?, ?, ?, ?)
                `, [reportId, signal.type, signal.weight, JSON.stringify(signal.data)]);
            }

            // Audit log
            await connection.query(`
                INSERT INTO report_audit_log 
                (report_id, action, actor_type, actor_id, new_status, details)
                VALUES (?, 'created', 'user', ?, 'pending', ?)
            `, [reportId, reporterId, JSON.stringify({ confidence, signalCount: signals.length })]);

            let penaltyApplied = 0;

            // Auto-resolve if threshold met
            if (shouldAutoResolve) {
                penaltyApplied = await applyPenalty(connection, reportedUserId, reason, reportId);

                await connection.query(`
                    UPDATE chat_reports 
                    SET resolution_reason = ?, penalty_applied = ?
                    WHERE id = ?
                `, [
                    'Automatically resolved based on confidence score and signals',
                    penaltyApplied,
                    reportId
                ]);

                await connection.query(`
                    INSERT INTO report_audit_log 
                    (report_id, action, actor_type, old_status, new_status, details)
                    VALUES (?, 'resolved', 'system', 'pending', 'checked', ?)
                `, [reportId, JSON.stringify({ penalty: penaltyApplied, reason })]);

                // Update trust score (valid report)
                await connection.query(`
                    UPDATE reporter_trust_scores
                    SET trust_score = LEAST(100, trust_score + ?),
                        valid_reports = valid_reports + 1,
                        total_reports = total_reports + 1,
                        last_report_date = NOW()
                    WHERE user_id = ?
                `, [CONFIG.TRUST_ADJUSTMENTS.valid_report, reporterId]);
            } else {
                // Update trust (pending report)
                await connection.query(`
                    UPDATE reporter_trust_scores
                    SET total_reports = total_reports + 1,
                        last_report_date = NOW()
                    WHERE user_id = ?
                `, [reporterId]);
            }

            // Notify reported user if auto-resolved
            if (shouldAutoResolve) {
                await connection.query(`
                    INSERT INTO notifications (user_id, title, body, category, type)
                    VALUES (?, ?, ?, 'system', 'system')
                `, [
                    reportedUserId,
                    'Community Guidelines Violation',
                    `Your account has been flagged for ${reason}. ${penaltyApplied} credits have been deducted. You may appeal this decision.`
                ]);
            }

            await connection.commit();

            res.status(201).json({
                success: true,
                reportId,
                autoResolved: shouldAutoResolve,
                confidence: confidence.toFixed(2),
                signalCount: signals.length,
                penaltyApplied,
                message: shouldAutoResolve
                    ? 'Report submitted and automatically resolved'
                    : 'Report submitted and pending review'
            });

        } catch (error) {
            await connection.rollback();
            console.error('Error submitting report:', error);
            res.status(500).json({ error: 'Failed to submit report' });
        } finally {
            connection.release();
        }
    }
);

// Appeal a report
router.post(
    '/appeal/:reportId',
    authenticateToken,
    [body('appealReason').isString().isLength({ min: 20, max: 2000 }).withMessage('Appeal reason must be at least 20 characters').trim()],
    async (req, res) => {
        const connection = await pool.getConnection();

        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                await connection.release();
                return res.status(400).json({ error: 'Validation failed', details: errors.array() });
            }

            const userId = req.user.id;
            const { reportId } = req.params;
            const { appealReason } = req.body;

            await connection.beginTransaction();

            // Get report
            const [report] = await connection.query(
                'SELECT * FROM chat_reports WHERE id = ? AND reported_id = ?',
                [reportId, userId]
            );

            if (report.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Report not found' });
            }

            if (report[0].appeal_status !== 'none') {
                await connection.rollback();
                return res.status(409).json({ error: 'Appeal already submitted' });
            }

            // Update report
            await connection.query(`
                UPDATE chat_reports
                SET appeal_status = 'pending',
                    appeal_date = NOW(),
                    appeal_reason = ?
                WHERE id = ?
            `, [appealReason, reportId]);

            // Audit log
            await connection.query(`
                INSERT INTO report_audit_log 
                (report_id, action, actor_type, actor_id, details)
                VALUES (?, 'appealed', 'user', ?, ?)
            `, [reportId, userId, JSON.stringify({ reason: appealReason })]);

            await connection.commit();

            res.json({
                success: true,
                message: 'Appeal submitted successfully. It will be reviewed by staff.'
            });

        } catch (error) {
            await connection.rollback();
            console.error('Error submitting appeal:', error);
            res.status(500).json({ error: 'Failed to submit appeal' });
        } finally {
            connection.release();
        }
    }
);

// Get user's reports (reporter view)
router.get('/my-reports', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [reports] = await pool.query(`
            SELECT cr.*, u.first_name, u.last_name
            FROM chat_reports cr
            JOIN users u ON cr.reported_id = u.id
            WHERE cr.reporter_id = ?
            ORDER BY cr.created DESC
            LIMIT 50
        `, [userId]);
        
        res.json({ reports });
        
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

// Get reports against user
router.get('/against-me', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [reports] = await pool.query(`
            SELECT id, chat_id, reason, description, status, confidence_score,
                   auto_resolved, penalty_applied, appeal_status, created
            FROM chat_reports
            WHERE reported_id = ?
            ORDER BY created DESC
            LIMIT 50
        `, [userId]);
        
        res.json({ reports });
        
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

// Get trust score
router.get('/trust-score', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [trust] = await pool.query(
            'SELECT * FROM reporter_trust_scores WHERE user_id = ?',
            [userId]
        );
        
        if (trust.length === 0) {
            return res.json({ 
                trustScore: 50.0, 
                totalReports: 0,
                validReports: 0,
                falseReports: 0
            });
        }
        
        res.json({ 
            trustScore: trust[0].trust_score,
            totalReports: trust[0].total_reports,
            validReports: trust[0].valid_reports,
            falseReports: trust[0].false_reports,
            isFlagged: trust[0].is_flagged === 1,
            cooldownUntil: trust[0].cooldown_until
        });
        
    } catch (error) {
        console.error('Error fetching trust score:', error);
        res.status(500).json({ error: 'Failed to fetch trust score' });
    }
});

module.exports = router;
