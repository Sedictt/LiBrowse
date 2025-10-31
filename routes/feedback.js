// LiBrowse - Feedback Routes (Fixed)
const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { getConnection } = require('../config/database');
const router = express.Router();

// Helper function to update user credits based on feedback
async function updateUserCreditsFromFeedback(connection, userId, rating, transactionId) {
    let creditChange = 0;
    let reason = '';

    // Credit system based on feedback rating
    if (rating === 5) {
        creditChange = 3;
        reason = 'Received 5-star feedback';
    } else if (rating === 4) {
        creditChange = 1;
        reason = 'Received 4-star feedback';
    } else if (rating <= 2) {
        creditChange = -2;
        reason = 'Received poor feedback';
    }

    if (creditChange !== 0) {
        // Get current credits
        const [users] = await connection.execute('SELECT credits FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return false;

        const currentCredits = users[0].credits;
        const newCredits = Math.max(0, currentCredits + creditChange);

        // Update user credits
        await connection.execute('UPDATE users SET credits = ? WHERE id = ?', [newCredits, userId]);

        // Log credit history
        await connection.execute(
            'INSERT INTO credit_history (user_id, transaction_id, credit_change, reason, previous_credits, new_credits) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, transactionId, creditChange, reason, currentCredits, newCredits]
        );

        // Send notification (FIXED: removed related_id)
        await connection.execute(
            'INSERT INTO notifications (user_id, title, message, created, is_read) VALUES (?, ?, ?, NOW(), 0)',
            [userId, 'Feedback Received', `You received a ${rating}-star rating. ${creditChange > 0 ? `+${creditChange}` : creditChange} credits!`]
        );
    }

    return true;
}

// GET /api/feedback/:userId - Get feedback received by a user
router.get('/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const connection = await getConnection();

        // FIXED: fname/lname instead of first_name/last_name
        const [feedback] = await connection.execute(`
            SELECT 
                f.*,
                CONCAT(reviewer.fname, ' ', reviewer.lname) AS reviewer_name,
                b.title as book_title,
                t.status as transaction_status
            FROM feedback f
            JOIN users reviewer ON reviewer.id = f.reviewer_id
            JOIN transactions t ON t.id = f.transaction_id
            JOIN books b ON b.id = t.book_id
            WHERE f.reviewee_id = ?
            ORDER BY f.created DESC
        `, [userId]);

        connection.release();
        res.json(feedback);
    } catch (error) {
        console.error('Get feedback error:', error);
        res.status(500).json({ error: 'Failed to load feedback' });
    }
});

// POST /api/feedback - Submit feedback for a transaction
router.post('/', [
    authenticateToken,
    body('transaction_id').isInt({ min: 1 }).withMessage('Valid transaction ID required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1-5'),
    body('comment').optional().isLength({ max: 500 }).withMessage('Comment too long'),
    body('book_condition_rating').optional().isIn(['excellent', 'good', 'fair', 'poor', 'damaged']),
    body('return_timeliness').optional().isIn(['early', 'on_time', 'late'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const { transaction_id, rating, comment, book_condition_rating, return_timeliness } = req.body;
        const connection = await getConnection();

        // MAP frontend values to database ENUM values
        let book_cond = null;
        if (book_condition_rating) {
            const conditionMap = {
                'excellent': 'new',
                'good': 'used_good',
                'fair': 'used_fair',
                'poor': 'used_fair',
                'damaged': 'damaged'
            };
            book_cond = conditionMap[book_condition_rating];
        }

        let return_time = null;
        if (return_timeliness) {
            const timeMap = {
                'early': 'early',
                'on_time': 'ontime',
                'late': 'late'
            };
            return_time = timeMap[return_timeliness];
        }

        // Get transaction details (FIXED: fname/lname)
        const [transactions] = await connection.execute(`
            SELECT t.*, b.title as book_title,
                CONCAT(borrower.fname, ' ', borrower.lname) as borrower_name,
                CONCAT(lender.fname, ' ', lender.lname) as lender_name
            FROM transactions t
            JOIN books b ON t.book_id = b.id
            JOIN users borrower ON t.borrower_id = borrower.id
            JOIN users lender ON t.lender_id = lender.id
            WHERE t.id = ?
        `, [transaction_id]);

        if (transactions.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Transaction not found' });
        }

        const transaction = transactions[0];

        // Determine feedback type and reviewee (FIXED: correct ENUM values)
        let reviewee_id, feedback_type;
        if (transaction.borrower_id === req.user.id) {
            reviewee_id = transaction.lender_id;
            feedback_type = 'to_lender';  // Changed from 'borrower_to_lender'
        } else if (transaction.lender_id === req.user.id) {
            reviewee_id = transaction.borrower_id;
            feedback_type = 'to_borrower';  // Changed from 'lender_to_borrower'
        } else {
            connection.release();
            return res.status(403).json({ error: 'You are not part of this transaction' });
        }

        // Check if transaction is completed or returned
        if (!['returned', 'completed'].includes(transaction.status)) {
            connection.release();
            return res.status(400).json({ error: 'Can only give feedback after book is returned' });
        }

        // Check if feedback already exists
        const [existingFeedback] = await connection.execute(`
            SELECT id FROM feedback 
            WHERE transaction_id = ? AND reviewer_id = ? AND feedback_type = ?
        `, [transaction_id, req.user.id, feedback_type]);

        if (existingFeedback.length > 0) {
            connection.release();
            return res.status(400).json({ error: 'Feedback already submitted for this transaction' });
        }

        // Insert feedback (FIXED: correct column names and values)
        await connection.execute(`
            INSERT INTO feedback (
                transaction_id, reviewer_id, reviewee_id, rating, comment,
                feedback_type, book_cond, return_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            transaction_id,
            req.user.id,
            reviewee_id,
            rating,
            comment || null,
            feedback_type,
            book_cond,      // Already mapped above
            return_time     // Already mapped above
        ]);

        // Update credits based on feedback
        await updateUserCreditsFromFeedback(connection, reviewee_id, rating, transaction_id);

        // Check if both parties have given feedback
        const [allFeedback] = await connection.execute(`
            SELECT COUNT(*) as feedback_count
            FROM feedback
            WHERE transaction_id = ?
        `, [transaction_id]);

        if (allFeedback[0].feedback_count >= 2) {
            await connection.execute(`
                UPDATE transactions SET status = 'completed' WHERE id = ?
            `, [transaction_id]);
        }

        connection.release();

        res.status(201).json({
            message: 'Feedback submitted successfully',
            reviewee_name: feedback_type === 'to_lender' ? transaction.lender_name : transaction.borrower_name
        });

    } catch (error) {
        console.error('Submit feedback error:', error);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});



// GET /api/feedback/transaction/:transactionId - Get feedback for a specific transaction
router.get('/transaction/:transactionId', authenticateToken, async (req, res) => {
    try {
        const transactionId = req.params.transactionId;
        const connection = await getConnection();

        // Verify user is part of the transaction
        const [transactions] = await connection.execute(`
            SELECT * FROM transactions
            WHERE id = ? AND (borrower_id = ? OR lender_id = ?)
        `, [transactionId, req.user.id, req.user.id]);

        if (transactions.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Transaction not found or not authorized' });
        }

        // Get all feedback for this transaction (FIXED: fname/lname)
        const [feedback] = await connection.execute(`
            SELECT 
                f.*,
                CONCAT(reviewer.fname, ' ', reviewer.lname) AS reviewer_name,
                CONCAT(reviewee.fname, ' ', reviewee.lname) AS reviewee_name
            FROM feedback f
            JOIN users reviewer ON reviewer.id = f.reviewer_id
            JOIN users reviewee ON reviewee.id = f.reviewee_id
            WHERE f.transaction_id = ?
            ORDER BY f.created DESC
        `, [transactionId]);

        connection.release();
        res.json(feedback);

    } catch (error) {
        console.error('Get transaction feedback error:', error);
        res.status(500).json({ error: 'Failed to load transaction feedback' });
    }
});

// ============================================
// DISPUTES ROUTES
// ============================================

// File a dispute
router.post('/disputes', [
    authenticateToken,
    body('feedback_id').isInt({ min: 1 }).withMessage('Valid feedback ID required'),
    body('reason').isIn(['inaccurate', 'unfair', 'abuse', 'irrelevant', 'other']).withMessage('Invalid reason'),
    body('description').optional().isLength({ max: 500 }).withMessage('Description too long')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const { feedback_id, reason, description } = req.body;
        const connection = await getConnection();

        // Get feedback to find transaction
        const [feedbackData] = await connection.execute(`
            SELECT * FROM feedback WHERE id = ?
        `, [feedback_id]);

        if (feedbackData.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Feedback not found' });
        }

        const feedback = feedbackData[0];

        // Only the person who received the feedback can dispute it
        if (feedback.reviewee_id !== req.user.id) {
            connection.release();
            return res.status(403).json({ error: 'You can only dispute feedback about yourself' });
        }

        // Check if dispute already exists for this feedback
        const [existingDispute] = await connection.execute(`
            SELECT id FROM disputes 
            WHERE feedback_id = ? AND reporter_id = ?
        `, [feedback_id, req.user.id]);

        if (existingDispute.length > 0) {
            connection.release();
            return res.status(400).json({ error: 'You have already filed a dispute for this feedback' });
        }

        // Create dispute
        await connection.execute(`
            INSERT INTO disputes (
                feedback_id, reporter_id, reason, description, status
            ) VALUES (?, ?, ?, ?, 'pending')
        `, [
            feedback_id,
            req.user.id,
            reason,
            description || null
        ]);

        connection.release();

        res.status(201).json({
            message: 'Dispute filed successfully',
            status: 'pending'
        });

    } catch (error) {
        console.error('File dispute error:', error);
        res.status(500).json({ error: 'Failed to file dispute' });
    }
});

// Get user's disputes
router.get('/disputes', authenticateToken, async (req, res) => {
    try {
        const connection = await getConnection();

        const [disputes] = await connection.execute(`
            SELECT 
                d.*,
                f.rating, f.comment,
                CONCAT(reviewer.fname, ' ', reviewer.lname) AS reviewer_name,
                b.title AS book_title
            FROM disputes d
            JOIN feedback f ON d.feedback_id = f.id
            JOIN users reviewer ON f.reviewer_id = reviewer.id
            JOIN transactions t ON f.transaction_id = t.id
            JOIN books b ON t.book_id = b.id
            WHERE d.reporter_id = ?
            ORDER BY d.created_at DESC
        `, [req.user.id]);

        connection.release();

        res.json(disputes);

    } catch (error) {
        console.error('Get disputes error:', error);
        res.status(500).json({ error: 'Failed to load disputes' });
    }
});

module.exports = router;

