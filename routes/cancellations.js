const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Configuration
const CONFIG = {
    CANCELLATION_TIMEOUT: 72 * 60 * 60 * 1000, // 72 hours in milliseconds
    REFUND_PERCENTAGE_PARTIAL: 0.5, // 50% refund for partial
};

// Initiate cancellation request
router.post('/initiate', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const initiatorId = req.user.id;
        const { transactionId, reason, description, refundType, refundAmount } = req.body;
        
        // Validation
        if (!transactionId || !reason) {
            return res.status(400).json({ error: 'Transaction ID and reason are required' });
        }
        
        const validReasons = ['changed_mind', 'found_alternative', 'condition_mismatch', 
                             'arrangement_issue', 'personal_reason', 'other'];
        if (!validReasons.includes(reason)) {
            return res.status(400).json({ error: 'Invalid cancellation reason' });
        }
        
        const validRefundTypes = ['full', 'partial', 'none'];
        const refundTypeValue = refundType || 'full';
        if (!validRefundTypes.includes(refundTypeValue)) {
            return res.status(400).json({ error: 'Invalid refund type' });
        }
        
        await connection.beginTransaction();
        
        // Get transaction details
        const [transaction] = await connection.query(`
            SELECT t.*, b.title as book_title, b.minimum_credits
            FROM transactions t
            JOIN books b ON t.book_id = b.id
            WHERE t.id = ?
        `, [transactionId]);
        
        if (transaction.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        const txn = transaction[0];
        
        // Verify user is part of transaction
        if (txn.borrower_id !== initiatorId && txn.lender_id !== initiatorId) {
            await connection.rollback();
            return res.status(403).json({ error: 'You are not part of this transaction' });
        }
        
        // Check transaction status - can only cancel approved or borrowed transactions
        if (!['approved', 'borrowed'].includes(txn.status)) {
            await connection.rollback();
            return res.status(400).json({ 
                error: `Cannot cancel transaction with status: ${txn.status}` 
            });
        }
        
        // Check if there's already an active cancellation request
        const [existing] = await connection.query(`
            SELECT id FROM cancellation_requests
            WHERE transaction_id = ? AND status IN ('pending', 'consented')
        `, [transactionId]);
        
        if (existing.length > 0) {
            await connection.rollback();
            return res.status(409).json({ 
                error: 'A cancellation request is already in progress for this transaction' 
            });
        }
        
        // Determine the other party
        const otherPartyId = txn.borrower_id === initiatorId ? txn.lender_id : txn.borrower_id;
        
        // Calculate refund amount if partial
        let calculatedRefundAmount = null;
        if (refundTypeValue === 'partial') {
            if (refundAmount !== undefined && refundAmount !== null) {
                calculatedRefundAmount = refundAmount;
            } else {
                // Default to 50% of held credits
                calculatedRefundAmount = Math.floor(txn.escrow_held * CONFIG.REFUND_PERCENTAGE_PARTIAL);
            }
        } else if (refundTypeValue === 'full') {
            calculatedRefundAmount = txn.escrow_held || txn.minimum_credits;
        }
        
        // Create cancellation request
        const expiresAt = new Date(Date.now() + CONFIG.CANCELLATION_TIMEOUT);
        
        const [result] = await connection.query(`
            INSERT INTO cancellation_requests 
            (transaction_id, initiator_id, other_party_id, reason, description, 
             refund_type, refund_amount, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            transactionId,
            initiatorId,
            otherPartyId,
            reason,
            description,
            refundTypeValue,
            calculatedRefundAmount,
            expiresAt
        ]);
        
        const cancellationId = result.insertId;
        
        // Update transaction status
        await connection.query(`
            UPDATE transactions
            SET status = 'cancellation_pending'
            WHERE id = ?
        `, [transactionId]);
        
        // Log in history
        await connection.query(`
            INSERT INTO cancellation_history 
            (cancellation_id, action, actor_id, details)
            VALUES (?, 'initiated', ?, ?)
        `, [
            cancellationId,
            initiatorId,
            JSON.stringify({ reason, refundType: refundTypeValue, refundAmount: calculatedRefundAmount })
        ]);
        
        // Notify the other party
        await connection.query(`
            INSERT INTO notifications (user_id, title, body, category, type, related_id)
            VALUES (?, ?, ?, 'transaction', 'transaction', ?)
        `, [
            otherPartyId,
            'Cancellation Request',
            `A cancellation request has been made for "${txn.book_title}". Please review and respond within 72 hours.`,
            transactionId
        ]);
        
        await connection.commit();
        
        res.status(201).json({
            success: true,
            cancellationId,
            expiresAt,
            message: 'Cancellation request initiated. Awaiting response from the other party.'
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Error initiating cancellation:', error);
        res.status(500).json({ error: 'Failed to initiate cancellation' });
    } finally {
        connection.release();
    }
});

// Respond to cancellation request (consent or reject)
router.post('/:cancellationId/respond', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const userId = req.user.id;
        const { cancellationId } = req.params;
        const { consent } = req.body; // true to consent, false to reject
        
        if (consent === undefined || consent === null) {
            return res.status(400).json({ error: 'Consent decision (true/false) is required' });
        }
        
        await connection.beginTransaction();
        
        // Get cancellation request
        const [cancellation] = await connection.query(`
            SELECT cr.*, t.borrower_id, t.lender_id, t.escrow_held, t.escrow_status,
                   b.title as book_title, b.minimum_credits
            FROM cancellation_requests cr
            JOIN transactions t ON cr.transaction_id = t.id
            JOIN books b ON t.book_id = b.id
            WHERE cr.id = ?
        `, [cancellationId]);
        
        if (cancellation.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Cancellation request not found' });
        }
        
        const cancel = cancellation[0];
        
        // Verify user is the other party
        if (cancel.other_party_id !== userId) {
            await connection.rollback();
            return res.status(403).json({ error: 'You are not authorized to respond to this request' });
        }
        
        // Check if already responded
        if (cancel.other_confirmed === 1) {
            await connection.rollback();
            return res.status(409).json({ error: 'You have already responded to this request' });
        }
        
        // Check status
        if (cancel.status !== 'pending') {
            await connection.rollback();
            return res.status(400).json({ 
                error: `Cannot respond to cancellation with status: ${cancel.status}` 
            });
        }
        
        // Check if expired
        if (new Date(cancel.expires_at) < new Date()) {
            await connection.query(`
                UPDATE cancellation_requests SET status = 'expired' WHERE id = ?
            `, [cancellationId]);
            await connection.commit();
            return res.status(410).json({ error: 'This cancellation request has expired' });
        }
        
        if (consent) {
            // Other party consents
            await connection.query(`
                UPDATE cancellation_requests
                SET other_confirmed = 1, 
                    other_response_date = NOW(),
                    status = 'consented'
                WHERE id = ?
            `, [cancellationId]);
            
            // Log history
            await connection.query(`
                INSERT INTO cancellation_history 
                (cancellation_id, action, actor_id)
                VALUES (?, 'consented', ?)
            `, [cancellationId, userId]);
            
            // Process cancellation - both parties agreed
            await processCancellation(connection, cancel);
            
            // Notify initiator
            await connection.query(`
                INSERT INTO notifications (user_id, title, body, category, type, related_id)
                VALUES (?, ?, ?, 'transaction', 'transaction', ?)
            `, [
                cancel.initiator_id,
                'Cancellation Approved',
                `Your cancellation request for "${cancel.book_title}" has been approved. The transaction has been cancelled.`,
                cancel.transaction_id
            ]);
            
            await connection.commit();
            
            res.json({
                success: true,
                message: 'Cancellation approved. Transaction has been cancelled and refund processed.'
            });
            
        } else {
            // Other party rejects
            await connection.query(`
                UPDATE cancellation_requests
                SET other_confirmed = 0,
                    other_response_date = NOW(),
                    status = 'rejected'
                WHERE id = ?
            `, [cancellationId]);
            
            // Restore transaction status
            await connection.query(`
                UPDATE transactions
                SET status = ?
                WHERE id = ?
            `, [cancel.status === 'borrowed' ? 'borrowed' : 'approved', cancel.transaction_id]);
            
            // Log history
            await connection.query(`
                INSERT INTO cancellation_history 
                (cancellation_id, action, actor_id)
                VALUES (?, 'rejected', ?)
            `, [cancellationId, userId]);
            
            // Notify initiator
            await connection.query(`
                INSERT INTO notifications (user_id, title, body, category, type, related_id)
                VALUES (?, ?, ?, 'transaction', 'transaction', ?)
            `, [
                cancel.initiator_id,
                'Cancellation Rejected',
                `Your cancellation request for "${cancel.book_title}" has been rejected. The transaction continues.`,
                cancel.transaction_id
            ]);
            
            await connection.commit();
            
            res.json({
                success: true,
                message: 'Cancellation request rejected. Transaction continues.'
            });
        }
        
    } catch (error) {
        await connection.rollback();
        console.error('Error responding to cancellation:', error);
        res.status(500).json({ error: 'Failed to process response' });
    } finally {
        connection.release();
    }
});

// Process the actual cancellation (helper function)
async function processCancellation(connection, cancel) {
    // Update cancellation status
    await connection.query(`
        UPDATE cancellation_requests
        SET status = 'completed', completed_at = NOW()
        WHERE id = ?
    `, [cancel.id]);
    
    // Update transaction status
    await connection.query(`
        UPDATE transactions
        SET status = 'cancelled'
        WHERE id = ?
    `, [cancel.transaction_id]);
    
    // Process refund
    if (cancel.refund_type !== 'none' && cancel.refund_amount > 0) {
        // Get borrower's current credits
        const [borrower] = await connection.query(
            'SELECT credits FROM users WHERE id = ?',
            [cancel.borrower_id]
        );
        
        if (borrower.length > 0) {
            const oldBalance = borrower[0].credits;
            const newBalance = oldBalance + cancel.refund_amount;
            
            // Refund credits to borrower
            await connection.query(
                'UPDATE users SET credits = ? WHERE id = ?',
                [newBalance, cancel.borrower_id]
            );
            
            // Log credit change
            await connection.query(`
                INSERT INTO credit_history 
                (user_id, transaction_id, credit_change, reason, old_balance, new_balance, remark)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                cancel.borrower_id,
                cancel.transaction_id,
                cancel.refund_amount,
                'Cancellation refund',
                oldBalance,
                newBalance,
                `${cancel.refund_type} refund for cancelled transaction`
            ]);
            
            // Notify borrower
            await connection.query(`
                INSERT INTO notifications (user_id, title, body, category, type)
                VALUES (?, ?, ?, 'credit', 'credit')
            `, [
                cancel.borrower_id,
                'Refund Processed',
                `You have been refunded ${cancel.refund_amount} credits from the cancelled transaction.`
            ]);
        }
    }
    
    // Update escrow status
    await connection.query(`
        UPDATE transactions
        SET escrow_status = 'refunded'
        WHERE id = ?
    `, [cancel.transaction_id]);
    
    // Make book available again
    await connection.query(`
        UPDATE books
        SET is_available = 1
        WHERE id = (SELECT book_id FROM transactions WHERE id = ?)
    `, [cancel.transaction_id]);
    
    // Log in history
    await connection.query(`
        INSERT INTO cancellation_history 
        (cancellation_id, action, actor_type, details)
        VALUES (?, 'completed', 'system', ?)
    `, [cancel.id, JSON.stringify({ refundAmount: cancel.refund_amount })]);
}

// Get cancellation status
router.get('/transaction/:transactionId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { transactionId } = req.params;
        
        // Verify user is part of transaction
        const [transaction] = await pool.query(
            'SELECT borrower_id, lender_id FROM transactions WHERE id = ?',
            [transactionId]
        );
        
        if (transaction.length === 0) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        if (transaction[0].borrower_id !== userId && transaction[0].lender_id !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Get cancellation request
        const [cancellation] = await pool.query(`
            SELECT cr.*, 
                   u1.first_name as initiator_first, u1.last_name as initiator_last,
                   u2.first_name as other_first, u2.last_name as other_last
            FROM cancellation_requests cr
            JOIN users u1 ON cr.initiator_id = u1.id
            JOIN users u2 ON cr.other_party_id = u2.id
            WHERE cr.transaction_id = ?
            ORDER BY cr.created_at DESC
            LIMIT 1
        `, [transactionId]);
        
        if (cancellation.length === 0) {
            return res.json({ hasCancellation: false });
        }
        
        res.json({ 
            hasCancellation: true,
            cancellation: cancellation[0]
        });
        
    } catch (error) {
        console.error('Error fetching cancellation:', error);
        res.status(500).json({ error: 'Failed to fetch cancellation status' });
    }
});

// Get cancellation history
router.get('/:cancellationId/history', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { cancellationId } = req.params;
        
        // Verify access
        const [cancellation] = await pool.query(`
            SELECT cr.*, t.borrower_id, t.lender_id
            FROM cancellation_requests cr
            JOIN transactions t ON cr.transaction_id = t.id
            WHERE cr.id = ?
        `, [cancellationId]);
        
        if (cancellation.length === 0) {
            return res.status(404).json({ error: 'Cancellation not found' });
        }
        
        if (cancellation[0].borrower_id !== userId && cancellation[0].lender_id !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Get history
        const [history] = await pool.query(`
            SELECT ch.*, u.first_name, u.last_name
            FROM cancellation_history ch
            LEFT JOIN users u ON ch.actor_id = u.id
            WHERE ch.cancellation_id = ?
            ORDER BY ch.created_at ASC
        `, [cancellationId]);
        
        res.json({ history });
        
    } catch (error) {
        console.error('Error fetching cancellation history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Cron job to expire old cancellation requests (should be called periodically)
router.post('/expire-old-requests', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        // Find expired requests
        const [expired] = await connection.query(`
            SELECT id, transaction_id
            FROM cancellation_requests
            WHERE status = 'pending' AND expires_at < NOW()
        `);
        
        for (const request of expired) {
            // Mark as expired
            await connection.query(`
                UPDATE cancellation_requests
                SET status = 'expired'
                WHERE id = ?
            `, [request.id]);
            
            // Restore transaction status
            await connection.query(`
                UPDATE transactions
                SET status = 'approved'
                WHERE id = ? AND status = 'cancellation_pending'
            `, [request.transaction_id]);
            
            // Log
            await connection.query(`
                INSERT INTO cancellation_history 
                (cancellation_id, action, actor_type)
                VALUES (?, 'expired', 'system')
            `, [request.id]);
        }
        
        await connection.commit();
        
        res.json({ 
            success: true,
            expiredCount: expired.length,
            message: `${expired.length} expired cancellation requests processed`
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Error expiring requests:', error);
        res.status(500).json({ error: 'Failed to process expired requests' });
    } finally {
        connection.release();
    }
});

module.exports = router;
