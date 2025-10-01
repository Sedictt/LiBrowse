// PLV BookSwap - Feedback Routes (Following SRS Specifications)
const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { getConnection } = require('../config/database');

const router = express.Router();

// Helper function to update user credits based on feedback
async function updateUserCreditsFromFeedback(connection, userId, rating, transactionId) {
    let creditChange = 0;
    let reason = '';

    // Credit system based on feedback rating (Following SRS specifications)
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

        // Send notification
        await connection.execute(
            'INSERT INTO notifications (user_id, title, message, type, related_id) VALUES (?, ?, ?, ?, ?)',
            [userId, 'Feedback Received', `You received a ${rating}-star rating. ${creditChange > 0 ? `+${creditChange}` : creditChange} credits!`, 'credit', transactionId]
        );
    }

    return true;
}

// GET /api/feedback/:userId - Get feedback received by a user
router.get('/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const connection = await getConnection();
        
        const [feedback] = await connection.execute(`
            SELECT 
                f.*,
                CONCAT(reviewer.first_name, ' ', reviewer.last_name) AS reviewer_name,
                b.title as book_title,
                t.status as transaction_status
            FROM feedback f
            JOIN users reviewer ON reviewer.id = f.reviewer_id
            JOIN transactions t ON t.id = f.transaction_id
            JOIN books b ON b.id = t.book_id
            WHERE f.reviewee_id = ?
            ORDER BY f.created_at DESC
        `, [userId]);
        
        connection.release();
        res.json(feedback);
    } catch (error) {
        console.error('Get feedback error:', error);
        res.status(500).json({ error: 'Failed to load feedback' });
    }
});

// POST /api/feedback - Submit feedback for a transaction (Following SRS flowchart)
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

        const { 
            transaction_id, 
            rating, 
            comment, 
            book_condition_rating, 
            return_timeliness 
        } = req.body;

        const connection = await getConnection();

        // Get transaction details
        const [transactions] = await connection.execute(`
            SELECT t.*, b.title as book_title,
                   CONCAT(borrower.first_name, ' ', borrower.last_name) as borrower_name,
                   CONCAT(lender.first_name, ' ', lender.last_name) as lender_name
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

        // Determine feedback type and reviewee
        let reviewee_id, feedback_type;
        if (transaction.borrower_id === req.user.id) {
            // Borrower giving feedback to lender
            reviewee_id = transaction.lender_id;
            feedback_type = 'borrower_to_lender';
        } else if (transaction.lender_id === req.user.id) {
            // Lender giving feedback to borrower
            reviewee_id = transaction.borrower_id;
            feedback_type = 'lender_to_borrower';
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

        // Insert feedback
        await connection.execute(`
            INSERT INTO feedback (
                transaction_id, reviewer_id, reviewee_id, rating, comment, 
                feedback_type, book_condition_rating, return_timeliness
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            transaction_id, req.user.id, reviewee_id, rating, comment,
            feedback_type, book_condition_rating, return_timeliness
        ]);

        // Update credits based on feedback (Following SRS credit system)
        await updateUserCreditsFromFeedback(connection, reviewee_id, rating, transaction_id);

        // Check if both parties have given feedback to mark transaction as completed
        const [allFeedback] = await connection.execute(`
            SELECT COUNT(*) as feedback_count 
            FROM feedback 
            WHERE transaction_id = ?
        `, [transaction_id]);

        if (allFeedback[0].feedback_count >= 2) {
            // Both parties have given feedback, mark transaction as completed
            await connection.execute(`
                UPDATE transactions SET status = 'completed' WHERE id = ?
            `, [transaction_id]);
        }

        connection.release();

        res.status(201).json({
            message: 'Feedback submitted successfully',
            reviewee_name: feedback_type === 'borrower_to_lender' ? transaction.lender_name : transaction.borrower_name
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

        // Get all feedback for this transaction
        const [feedback] = await connection.execute(`
            SELECT 
                f.*,
                CONCAT(reviewer.first_name, ' ', reviewer.last_name) AS reviewer_name,
                CONCAT(reviewee.first_name, ' ', reviewee.last_name) AS reviewee_name
            FROM feedback f
            JOIN users reviewer ON reviewer.id = f.reviewer_id
            JOIN users reviewee ON reviewee.id = f.reviewee_id
            WHERE f.transaction_id = ?
            ORDER BY f.created_at DESC
        `, [transactionId]);

        connection.release();
        res.json(feedback);

    } catch (error) {
        console.error('Get transaction feedback error:', error);
        res.status(500).json({ error: 'Failed to load transaction feedback' });
    }
});

module.exports = router;
