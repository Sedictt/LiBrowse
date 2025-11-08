const express = require('express');
const router = express.Router();
const { getConnection, pool: dbPool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Configuration
const CONFIG = {
    CANCELLATION_TIMEOUT: 48 * 60 * 60 * 1000, // 48 hours in milliseconds
    REFUND_PERCENTAGE_PARTIAL: 0.5, // 50% refund for partial
};

// Initiate cancellation request
router.post('/initiate', authenticateToken, async (req, res) => {
    const connection = await getConnection();
    
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
            SELECT 
                t.id, t.book_id, t.borrower_id, t.lender_id,
                LOWER(COALESCE(t.status, 'waiting')) AS txn_status,
                b.title as book_title,
                b.minimum_credits
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
        
        // Check if there's already an active cancellation request (do this first)
        const [existing] = await connection.query(`
            SELECT id FROM cancellation_requests
            WHERE transaction_id = ? AND status IN ('pending', 'consented')
        `, [transactionId]);
        if (existing.length > 0) {
            await connection.rollback();
            return res.status(409).json({ error: 'A cancellation request is already in progress for this transaction' });
        }

        // Check transaction status - allow waiting/approved/ongoing
        const cancellableStatuses = ['waiting', 'approved', 'ongoing'];
        const txnStatus = String(txn.txn_status || '').trim();
        if (!txnStatus || !cancellableStatuses.includes(txnStatus)) {
            await connection.rollback();
            return res.status(400).json({ 
                error: `Cannot cancel transaction with status: ${txnStatus || '(unknown)'}` 
            });
        }
        
        // Determine the other party
        const otherPartyId = txn.borrower_id === initiatorId ? txn.lender_id : txn.borrower_id;
        
        // Calculate refund amount if partial
        let calculatedRefundAmount = null;
        const baseCredits = Number(txn.minimum_credits) || 0;
        if (refundTypeValue === 'partial') {
            if (refundAmount !== undefined && refundAmount !== null) {
                calculatedRefundAmount = refundAmount;
            } else {
                // Default to 50% of held/minimum credits
                calculatedRefundAmount = Math.floor(baseCredits * CONFIG.REFUND_PERCENTAGE_PARTIAL);
            }
        } else if (refundTypeValue === 'full') {
            calculatedRefundAmount = baseCredits;
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
            INSERT INTO notifications (user_id, title, body, category, related_id)
            VALUES (?, ?, ?, 'transaction', ?)
        `, [
            otherPartyId,
            'Cancellation Request',
            `A cancellation request has been made for \"${txn.book_title}\". Please review and respond within 48 hours.`,
            transactionId
        ]);
        
        // Ensure there is a chat for this transaction and post a system message with action buttons
        let chatId = null;
        const [existingChats] = await connection.query('SELECT id FROM chats WHERE transaction_id = ?', [transactionId]);
        if (existingChats.length > 0) {
            chatId = existingChats[0].id;
        } else {
            const [chatInsert] = await connection.query('INSERT INTO chats (transaction_id, created) VALUES (?, NOW())', [transactionId]);
            chatId = chatInsert.insertId;
        }

        const cancelPayload = {
            type: 'cancellation_request',
            cancellation_id: cancellationId,
            transaction_id: transactionId,
            initiator_id: initiatorId,
            other_party_id: otherPartyId,
            book_title: txn.book_title,
            reason,
            refund_type: refundTypeValue,
            refund_amount: calculatedRefundAmount,
            expires_at: new Date(expiresAt).toISOString()
        };

        const [msgInsert] = await connection.query(`
            INSERT INTO chat_messages (chat_id, sender_id, message, message_type, created)
            VALUES (?, ?, ?, 'sys', NOW())
        `, [chatId, initiatorId, JSON.stringify(cancelPayload)]);

        await connection.commit();

        // Broadcast chat notification so the other party sees it in chatbox immediately
        try {
            const io = req.app.get('socketio');
            if (io && chatId && msgInsert.insertId) {
                const [newMsgRows] = await connection.query(`
                    SELECT cm.*, CONCAT(u.first_name, ' ', u.last_name) as sender_name, u.profile_image as sender_avatar
                    FROM chat_messages cm
                    LEFT JOIN users u ON cm.sender_id = u.id
                    WHERE cm.id = ?
                `, [msgInsert.insertId]);
                const newMsg = newMsgRows && newMsgRows[0] ? newMsgRows[0] : null;
                if (newMsg) {
                    io.to(`chat_${chatId}`).emit('new_message', { chatId, message: newMsg });
                    io.emit('chat_activity', { chatId, type: 'message', messageId: newMsg.id });
                }
            }
        } catch (e) {
            console.error('Socket broadcast error (cancellation initiate):', e);
        }
        
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
    const connection = await getConnection();
    
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
            SELECT cr.*, t.borrower_id, t.lender_id,
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
                INSERT INTO notifications (user_id, title, body, category, related_id)
                VALUES (?, ?, ?, 'transaction', ?)
            `, [
                cancel.initiator_id,
                'Cancellation Approved',
                `Your cancellation request for \"${cancel.book_title}\" has been approved. The transaction has been cancelled.`,
                cancel.transaction_id
            ]);

            // Post system message in chat
            let chatId = null;
            const [existingChats] = await connection.query('SELECT id FROM chats WHERE transaction_id = ?', [cancel.transaction_id]);
            if (existingChats.length > 0) chatId = existingChats[0].id;
            let msgId = null;
            if (chatId) {
                const responsePayload = {
                    type: 'cancellation_response',
                    status: 'approved',
                    cancellation_id: cancel.id,
                    transaction_id: cancel.transaction_id,
                    responder_id: userId,
                    book_title: cancel.book_title
                };
                const [msgInsert] = await connection.query(`
                    INSERT INTO chat_messages (chat_id, sender_id, message, message_type, created)
                    VALUES (?, ?, ?, 'sys', NOW())
                `, [chatId, userId, JSON.stringify(responsePayload)]);
                msgId = msgInsert.insertId;
            }

            await connection.commit();

            // Broadcast to chat participants
            try {
                const io = req.app.get('socketio');
                if (io && chatId && msgId) {
                    const [newMsgRows] = await connection.query(`
                        SELECT cm.*, CONCAT(u.first_name, ' ', u.last_name) as sender_name, u.profile_image as sender_avatar
                        FROM chat_messages cm
                        LEFT JOIN users u ON cm.sender_id = u.id
                        WHERE cm.id = ?
                    `, [msgId]);
                    const newMsg = newMsgRows && newMsgRows[0] ? newMsgRows[0] : null;
                    if (newMsg) {
                        io.to(`chat_${chatId}`).emit('new_message', { chatId, message: newMsg });
                        io.emit('chat_activity', { chatId, type: 'message', messageId: newMsg.id });
                    }
                }
            } catch (e) {
                console.error('Socket broadcast error (cancellation approve):', e);
            }

            res.json({
                success: true,
                message: 'Cancellation approved. Transaction has been cancelled.'
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
                `Your cancellation request for \"${cancel.book_title}\" has been rejected. The transaction continues.`,
                cancel.transaction_id
            ]);

            // Post system message in chat
            let chatId = null;
            const [existingChats] = await connection.query('SELECT id FROM chats WHERE transaction_id = ?', [cancel.transaction_id]);
            if (existingChats.length > 0) chatId = existingChats[0].id;
            let msgId = null;
            if (chatId) {
                const responsePayload = {
                    type: 'cancellation_response',
                    status: 'rejected',
                    cancellation_id: cancel.id,
                    transaction_id: cancel.transaction_id,
                    responder_id: userId,
                    book_title: cancel.book_title
                };
                const [msgInsert] = await connection.query(`
                    INSERT INTO chat_messages (chat_id, sender_id, message, message_type, created)
                    VALUES (?, ?, ?, 'sys', NOW())
                `, [chatId, userId, JSON.stringify(responsePayload)]);
                msgId = msgInsert.insertId;
            }

            await connection.commit();

            // Broadcast to chat participants
            try {
                const io = req.app.get('socketio');
                if (io && chatId && msgId) {
                    const [newMsgRows] = await connection.query(`
                        SELECT cm.*, CONCAT(u.first_name, ' ', u.last_name) as sender_name, u.profile_image as sender_avatar
                        FROM chat_messages cm
                        LEFT JOIN users u ON cm.sender_id = u.id
                        WHERE cm.id = ?
                    `, [msgId]);
                    const newMsg = newMsgRows && newMsgRows[0] ? newMsgRows[0] : null;
                    if (newMsg) {
                        io.to(`chat_${chatId}`).emit('new_message', { chatId, message: newMsg });
                        io.emit('chat_activity', { chatId, type: 'message', messageId: newMsg.id });
                    }
                }
            } catch (e) {
                console.error('Socket broadcast error (cancellation reject):', e);
            }
            
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
        SET status = 'processed'
        WHERE id = ?
    `, [cancel.id]);
    
    // Update transaction status
    await connection.query(`
        UPDATE transactions
        SET status = 'cancelled'
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
        (cancellation_id, action, actor_id, details)
        VALUES (?, 'system', NULL, ?)
    `, [cancel.id, JSON.stringify({ event: 'completed', refundAmount: cancel.refund_amount })]);
}

// Get cancellation status
router.get('/transaction/:transactionId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { transactionId } = req.params;
        
        // Verify user is part of transaction
        const [transaction] = await dbPool.query(
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
        const [cancellation] = await dbPool.query(`
            SELECT cr.*, 
                   u1.first_name as initiator_first, u1.last_name as initiator_last,
                   u2.first_name as other_first, u2.last_name as other_last
            FROM cancellation_requests cr
            JOIN users u1 ON cr.initiator_id = u1.id
            JOIN users u2 ON cr.other_party_id = u2.id
            WHERE cr.transaction_id = ?
            ORDER BY cr.created DESC
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
        const [cancellation] = await dbPool.query(`
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
        const [history] = await dbPool.query(`
            SELECT ch.*, u.first_name, u.last_name
            FROM cancellation_history ch
            LEFT JOIN users u ON ch.actor_id = u.id
            WHERE ch.cancellation_id = ?
            ORDER BY ch.created ASC
        `, [cancellationId]);
        
        res.json({ history });
        
    } catch (error) {
        console.error('Error fetching cancellation history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Cron job to expire old cancellation requests (should be called periodically)
router.post('/expire-old-requests', async (req, res) => {
    const connection = await getConnection();
    
    try {
        await connection.beginTransaction();
        
        // Find expired requests (auto-approve after timeout)
        const [expired] = await connection.query(`
            SELECT cr.*, t.borrower_id, t.lender_id, b.title as book_title
            FROM cancellation_requests cr
            JOIN transactions t ON cr.transaction_id = t.id
            JOIN books b ON t.book_id = b.id
            WHERE cr.status = 'pending' AND cr.expires_at < NOW()
        `);

        // Collect broadcasts to emit after commit
        const broadcasts = [];

        for (const request of expired) {
            // Mark as consented by system and process cancellation
            await connection.query(`
                UPDATE cancellation_requests
                SET other_confirmed = 1, other_response_date = NOW(), status = 'consented'
                WHERE id = ?
            `, [request.id]);

            // Log auto-approval
            await connection.query(`
                INSERT INTO cancellation_history 
                (cancellation_id, action, actor_id, details)
                VALUES (?, 'system', NULL, ?)
            `, [request.id, JSON.stringify({ event: 'auto_approved' })]);

            // Process the cancellation (updates transaction, refunds, etc.)
            await processCancellation(connection, request);

            // Post system message in chat
            const [chatRows] = await connection.query('SELECT id FROM chats WHERE transaction_id = ?', [request.transaction_id]);
            const chatId = chatRows.length ? chatRows[0].id : null;
            if (chatId) {
                const payload = {
                    type: 'cancellation_auto_approved',
                    cancellation_id: request.id,
                    transaction_id: request.transaction_id,
                    book_title: request.book_title
                };
                const [msgInsert] = await connection.query(`
                    INSERT INTO chat_messages (chat_id, sender_id, message, message_type, created)
                    VALUES (?, ?, ?, 'sys', NOW())
                `, [chatId, request.initiator_id, JSON.stringify(payload)]);
                const [newMsgRows] = await connection.query(`
                    SELECT cm.*, CONCAT(u.first_name, ' ', u.last_name) as sender_name, u.profile_image as sender_avatar
                    FROM chat_messages cm
                    LEFT JOIN users u ON cm.sender_id = u.id
                    WHERE cm.id = ?
                `, [msgInsert.insertId]);
                const newMsg = newMsgRows && newMsgRows[0] ? newMsgRows[0] : null;
                broadcasts.push({ chatId, message: newMsg });
            }
        }
        
        await connection.commit();

        // Emit broadcasts after commit
        try {
            const io = req.app.get('socketio');
            if (io) {
                for (const b of broadcasts) {
                    if (b && b.chatId && b.message) {
                        io.to(`chat_${b.chatId}`).emit('new_message', { chatId: b.chatId, message: b.message });
                        io.emit('chat_activity', { chatId: b.chatId, type: 'message', messageId: b.message.id });
                    }
                }
            }
        } catch (e) {
            console.error('Socket broadcast error (expire-old-requests):', e);
        }
        
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
