// LiBrowse - Transactions Routes (Following SRS Specifications)
const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { getConnection } = require('../config/database');
const NotificationHelper = require('../services/notificationHelper');


const router = express.Router();

// Test endpoint to verify route is working
router.get('/test', authenticateToken, (req, res) => {
    res.json({
        message: 'Transactions route is working',
        user: req.user.id,
        timestamp: new Date().toISOString()
    });
});

// --- Date/Due date helpers ---
function toYYYYMMDD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function durationToDays(val) {
    const map = { '1w': 7, '2w': 14, '3w': 21, '1m': 30, '1-week': 7, '2-weeks': 14, '3-weeks': 21, '1-month': 30 };
    return map[val] || 0;
}

function addDaysYYYYMMDD(dateStr, days) {
    if (!dateStr) return null;
    const [yy, mm, dd] = dateStr.split('-').map(Number);
    const base = new Date(yy, mm - 1, dd, 12);
    base.setDate(base.getDate() + days);
    return toYYYYMMDD(base);
}

function getLibraryConfigFromEnv() {
    const closuresEnabled = String(process.env.LIB_CLOSURES_ENABLED || 'false').toLowerCase() === 'true';
    const weeklyClosedDays = (process.env.LIB_WEEKLY_CLOSED_DAYS || '').split(',').map(s => s.trim()).filter(Boolean).map(n => parseInt(n, 10));
    const holidays = (process.env.LIB_HOLIDAYS || '').split(',').map(s => s.trim()).filter(Boolean);
    return { closuresEnabled, weeklyClosedDays, holidays };
}

function adjustDateForClosure(dateStr, cfg) {
    if (!dateStr) return dateStr;
    if (!cfg || !cfg.closuresEnabled) return dateStr;
    const [yy, mm, dd] = dateStr.split('-').map(Number);
    const d = new Date(yy, mm - 1, dd, 12);
    const isClosed = (dt) => (cfg.weeklyClosedDays || []).includes(dt.getDay()) || (cfg.holidays || []).includes(toYYYYMMDD(dt));
    while (isClosed(d)) { d.setDate(d.getDate() + 1); }
    return toYYYYMMDD(d);
}


// Helper function to update user credits
async function updateUserCredits(connection, userId, creditChange, reason, transactionId = null) {
    // Get current credits
    const [users] = await connection.execute('SELECT credits FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return false;

    const currentCredits = users[0].credits;
    const newCredits = Math.max(0, currentCredits + creditChange); // Prevent negative credits

    // Update user credits
    await connection.execute('UPDATE users SET credits = ? WHERE id = ?', [newCredits, userId]);

    // Log credit history
    await connection.execute(
        'INSERT INTO credit_history (user_id, transaction_id, credit_change, remark, old_balance, new_balance) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, transactionId, creditChange, reason, currentCredits, newCredits]
    );

    return true;
}

// Helper function to send notification
async function createNotification(connection, userId, title, body, category, relatedId = null) {
    await connection.execute(
        'INSERT INTO notifications (user_id, title, body, category, related_id) VALUES (?, ?, ?, ?, ?)',
        [userId, title, body, category, relatedId]
    );
}

// GET /api/transactions - Get user's transactions
router.get('/', authenticateToken, async (req, res) => {
    try {
        const connection = await getConnection();

        const [transactions] = await connection.execute(`
    SELECT
        t.*,
        b.title as book_title,
        b.author as book_author,
        b.cover_image as book_cover,
        CASE WHEN t.borrower_id = ? THEN 'borrowing' ELSE 'lending' END AS type,
        CONCAT(borrower.fname, ' ', borrower.lname) AS borrower_name,
        CONCAT(lender.fname, ' ', lender.lname) AS lender_name,
        borrower.email as borrower_email,
        lender.email as lender_email,
        borrower.is_verified as borrower_verified,
        borrower.credits as borrower_credits,
        lender.is_verified as lender_verified,
        lender.credits as lender_credits,
        -- Borrower reputation badges
        COALESCE((SELECT AVG(rating) FROM feedback WHERE reviewee_id = borrower.id), 0) as borrower_rating,
        COALESCE((SELECT COUNT(*) FROM transactions t2 WHERE t2.borrower_id = borrower.id AND t2.status IN ('done', 'ongoing')), 0) as borrower_completed_transactions,
        -- Check if feedback has been given (simplified approach)
        COALESCE((SELECT COUNT(*) FROM feedback f WHERE f.transaction_id = t.id AND f.reviewer_id = t.borrower_id), 0) as borrower_feedback_given,
        COALESCE((SELECT COUNT(*) FROM feedback f WHERE f.transaction_id = t.id AND f.reviewer_id = t.lender_id), 0) as lender_feedback_given,
        -- Check if feedback has been given (simplified approach)
COALESCE((SELECT COUNT(*) FROM feedback f WHERE f.transaction_id = t.id AND f.reviewer_id = t.borrower_id), 0) as borrower_feedback_given,
COALESCE((SELECT COUNT(*) FROM feedback f WHERE f.transaction_id = t.id AND f.reviewer_id = t.lender_id), 0) as lender_feedback_given,
-- ✅ ADD THIS: Check if current user gave feedback
COALESCE((SELECT COUNT(*) FROM feedback f WHERE f.transaction_id = t.id AND f.reviewer_id = ?), 0) as user_gave_feedback,

        -- ✅ ADD THIS: Calculate if overdue
        CASE 
            WHEN t.status = 'borrowed' AND t.expected_return_date < CURDATE() 
            THEN 1 
            ELSE 0 
        END as is_overdue,
        -- ✅ ADD THIS: Calculate days overdue
        CASE 
            WHEN t.status = 'borrowed' AND t.expected_return_date < CURDATE()
            THEN DATEDIFF(CURDATE(), t.expected_return_date)
            ELSE 0
        END as days_overdue
    FROM transactions t
    JOIN books b ON t.book_id = b.id
    JOIN users borrower ON t.borrower_id = borrower.id
    JOIN users lender ON t.lender_id = lender.id
    WHERE t.borrower_id = ? OR t.lender_id = ?
    ORDER BY t.request_date DESC
`, [req.user.id, req.user.id, req.user.id, req.user.id]);


        connection.release();
        res.json({ transactions });
    } catch (error) {
        console.error('Get transactions error:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ error: 'Failed to load transactions', details: error.message });
    }
});

// POST /api/transactions/request - Create borrow request (Following SRS flowchart)
router.post('/request', [
    authenticateToken,
    body('book_id').isInt({ min: 1 }).withMessage('Valid book ID is required'),
    body('borrower_contact').trim().isLength({ min: 1 }).withMessage('Contact information is required'),

    body('request_message').trim().isLength({ min: 10 }).withMessage('Please provide a detailed reason for borrowing (minimum 10 characters)'),
    body('borrow_start_date').isISO8601().withMessage('Valid start date is required'),
    body('borrow_duration').isIn(['1w', '2w', '3w', '1m', '1-week', '2-weeks', '3-weeks', '1-month']).withMessage('Valid borrow duration is required'),
    body('borrower_address').optional({ nullable: true }).trim().isLength({ max: 255 }).withMessage('Address must be less than 255 characters'),
    body('pickup_method').isIn(['pickup', 'meet', 'ship', 'meetup', 'delivery']).withMessage('Valid pickup method is required'),
    body('pickup_location').trim().isLength({ min: 1, max: 255 }).withMessage('Meeting location is required'),
    body('preferred_pickup_time').optional({ nullable: true }).isISO8601().withMessage('Valid pickup time required if provided')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const {
            book_id,
            request_message,
            borrower_contact,
            borrower_address,
            pickup_method,
            pickup_location,
            preferred_pickup_time,
            borrow_duration,
            borrow_start_date
        } = req.body;

        // Normalize optional values: undefined -> null
        const toNull = (v) => (v === undefined ? null : v);
        const borrower_address_norm = toNull(borrower_address);
        const preferred_pickup_time_norm = preferred_pickup_time ? new Date(preferred_pickup_time) : null;

        // Normalize to new schema enums
        const pickup_method_db = (pickup_method === 'meet') ? 'meetup' : (pickup_method === 'ship' ? 'delivery' : pickup_method);
        const borrower_duration_db = (function (val) {
            if (val == null) return null;
            const map = { '1w': '1-week', '2w': '2-weeks', '3w': '3-weeks', '1m': '1-month', '1-week': '1-week', '2-weeks': '2-weeks', '3-weeks': '3-weeks', '1-month': '1-month', 'custom': 'custom' };
            return map[val] || null;
        })(borrow_duration);

        const connection = await getConnection();

        // Step 1: Check if book exists and is available
        const [books] = await connection.execute(`
            SELECT b.*, CONCAT(u.fname, ' ', u.lname) as owner_name
            FROM books b
            JOIN users u ON b.owner_id = u.id
            WHERE b.id = ? AND b.is_available = TRUE
        `, [book_id]);

        if (books.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Book not found or not available' });
        }

        const book = books[0];

        // Step 2: Check if user is trying to borrow their own book
        if (book.owner_id === req.user.id) {
            connection.release();
            return res.status(400).json({ error: 'Cannot borrow your own book' });
        }

        // Step 2.5: Check borrower verification status
        const vrows = await connection.execute(
            `SELECT verification_status FROM users WHERE id = ?`,
            [req.user.id]
        );

        // Fix: connection.execute returns [rows, fields], so vrows[0] is the rows array
        const rows = vrows[0];
        const rawStatus = rows && rows.length ? rows[0].verification_status : null;

        // DEBUG: Log what we're reading from the database
        console.log('🔍 DEBUG - User ID:', req.user.id, '| Raw Status:', rawStatus, '| Type:', typeof rawStatus);

        const status = (rawStatus || '').toLowerCase();
        if (!status || (status !== 'verified' && status !== 'fully_verified')) {
            console.log('❌ VERIFICATION FAILED - Status:', status);
            connection.release();
            return res.status(403).json({
                error: 'You must complete account verification to borrow books.',
                verification_status: rawStatus || 'none'
            });
        }

        console.log('✅ VERIFICATION PASSED - User', req.user.id, 'is verified with status:', rawStatus);


        // Step 3: Check borrower's credit points (Following SRS flowchart)
        const [borrowers] = await connection.execute('SELECT credits FROM users WHERE id = ?', [req.user.id]);
        const borrowerCredits = borrowers[0].credits;

        if (borrowerCredits < book.minimum_credits) {
            connection.release();
            return res.status(400).json({
                error: `Insufficient credits. You have ${borrowerCredits} credits but need ${book.minimum_credits} credits to borrow this book.`,
                required_credits: book.minimum_credits,
                current_credits: borrowerCredits
            });
        }

        // Step 4: Check if user has too many active borrows
        const [activeBorrows] = await connection.execute(`
            SELECT COUNT(*) as count
            FROM transactions
            WHERE borrower_id = ? AND status IN ('pending', 'approved', 'borrowed')
        `, [req.user.id]);

        const maxActiveBorrows = 3; // From settings table
        if (activeBorrows[0].count >= maxActiveBorrows) {
            connection.release();
            return res.status(400).json({
                error: `You have reached the maximum number of active borrow requests (${maxActiveBorrows})`
            });
        }

        // Step 5: Create borrow request
        // Build values with NULLs instead of undefined
        // Compute expected return date from start date + duration (server is source of truth)
        const libCfg = getLibraryConfigFromEnv();
        const durationDays = durationToDays(borrow_duration);
        if (!durationDays) {
            connection.release();
            return res.status(400).json({ error: 'Validation failed', details: [{ field: 'borrow_duration', message: 'Invalid duration' }] });
        }
        if (!borrow_start_date) {
            connection.release();
            return res.status(400).json({ error: 'Validation failed', details: [{ field: 'borrow_start_date', message: 'Start date is required' }] });
        }
        const expected_return_date = adjustDateForClosure(addDaysYYYYMMDD(borrow_start_date, durationDays), libCfg);

        const insertValues = [
            book_id, req.user.id, book.owner_id, request_message,
            borrower_contact, borrower_address_norm, pickup_method_db, pickup_location,
            expected_return_date
        ];
        console.assert(!insertValues.some(v => v === undefined), 'Undefined value in INSERT params', insertValues);

        const [result] = await connection.execute(`
            INSERT INTO transactions (
                book_id, borrower_id, lender_id, status, request_message,
                borrower_contact, borrower_address, pickup_method, pickup_location,
                expected_return_date, request_date
            ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, NOW())
        `, insertValues);

        // Update with additional fields if they exist (new schema columns)
        if (preferred_pickup_time_norm !== null || borrower_duration_db !== null) {
            const updateValues = [preferred_pickup_time_norm, borrower_duration_db ?? null, result.insertId];
            console.assert(!updateValues.some(v => v === undefined), 'Undefined value in UPDATE params', updateValues);
            await connection.execute(`
                UPDATE transactions
                SET preferred_pickup_time = ?, borrow_duration = ?
                WHERE id = ?
            `, updateValues);
        }

        // Step 6: Send notification to lender (both in-app and email)
        const [borrowerRows] = await connection.execute('SELECT fname, lname, email FROM users WHERE id = ?', [req.user.id]);
        const borrowerFullName = borrowerRows.length ? `${borrowerRows[0].fname} ${borrowerRows[0].lname}` : 'A borrower';

        // Create in-app notification
        await createNotification(
            connection,
            book.owner_id,
            'New Borrow Request',
            `${borrowerFullName} wants to borrow "${book.title}"`,
            'transaction',
            result.insertId
        );

        // Send email notification
        try {
            const NotificationHelper = require('../services/notificationHelper');
            await NotificationHelper.notifyBorrowRequest(
                book.owner_id,
                borrowerFullName,
                book.title,
                book.author || 'Unknown Author',
                request_message,
                `https://librowse.app/transactions/${result.insertId}`
            );
            console.log(`Email notification sent to lender (ID: ${book.owner_id})`);
        } catch (emailError) {
            console.error('Error sending email notification:', emailError);
            // Don't fail the transaction if email fails
        }


        // Step 7: Mark book as temporarily unavailable (pending request)
        await connection.execute('UPDATE books SET is_available = FALSE WHERE id = ?', [book_id]);

        connection.release();

        res.status(201).json({
            message: 'Borrow request sent successfully',
            transaction_id: result.insertId,
            lender_name: book.owner_name
        });

    } catch (error) {
        console.error('Create borrow request error:', error);
        res.status(500).json({ error: 'Failed to create borrow request' });
    }
});




// PUT /api/transactions/:id/approve - Lender approves borrow request
router.put('/:id/approve', [
    authenticateToken,
    body('lender_notes').optional().isLength({ max: 500 }),
    body('pickup_location').optional().isLength({ max: 255 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const transactionId = req.params.id;
        const { lender_notes, pickup_location } = req.body;

        const connection = await getConnection();

        // Get transaction details
        const [transactions] = await connection.execute(`
            SELECT t.*, b.title as book_title, b.author as book_author, CONCAT(u.fname, ' ', u.lname) as borrower_name
            FROM transactions t
            JOIN books b ON t.book_id = b.id
            JOIN users u ON t.borrower_id = u.id
            WHERE t.id = ? AND t.lender_id = ?
        `, [transactionId, req.user.id]);

        if (transactions.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Transaction not found or not authorized' });
        }

        const transaction = transactions[0];

        if (transaction.status !== 'pending') {
            connection.release();
            return res.status(400).json({ error: 'Transaction is not in pending status' });
        }

        // Update transaction status to approved
        await connection.execute(`
            UPDATE transactions
            SET status = 'approved',
                approved_date = NOW(),
                lender_notes = ?,
                pickup_location = COALESCE(?, pickup_location)
            WHERE id = ?
        `, [lender_notes, pickup_location, transactionId]);

        // Create chat for approved transaction
        const [chatResult] = await connection.execute(`
            INSERT INTO chats (transaction_id, created)
            VALUES (?, NOW())
        `, [transactionId]);

        // Send system message to chat
        await connection.execute(`
            INSERT INTO chat_messages (chat_id, sender_id, message, message_type, created)
            VALUES (?, ?, ?, 'sys', NOW())
        `, [chatResult.insertId, req.user.id, `Chat created for "${transaction.book_title}" transaction. You can now discuss pickup details and terms.`]);

        // Send notification to borrower (both in-app and email)
        await createNotification(
            connection,
            transaction.borrower_id,
            'Request Approved!',
            `Your request to borrow "${transaction.book_title}" has been approved. You can now chat with the lender.`,
            'transaction',
            transactionId
        );

        // Send approval email
        try {
            const NotificationHelper = require('../services/notificationHelper');
            await NotificationHelper.notifyApproval(
                transaction.borrower_id,
                `${req.user.fname} ${req.user.lname}`,
                transaction.book_title,
                transaction.book_author || 'Unknown Author',
                new Date(transaction.expected_return_date).toLocaleDateString(),
                `https://librowse.app/transactions/${transactionId}`
            );
        } catch (emailError) {
            console.error('Error sending approval email:', emailError);
            // Continue without failing - email is secondary
        }

        connection.release();

        res.json({
            message: 'Borrow request approved successfully',
            borrower_name: transaction.borrower_name
        });

    } catch (error) {
        console.error('Approve transaction error:', error);
        res.status(500).json({ error: 'Failed to approve transaction' });
    }
});


// PUT /api/transactions/:id/reject - Lender rejects borrow request
router.put('/:id/reject', [
    authenticateToken,
    body('rejection_reason').notEmpty().withMessage('Rejection reason is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const transactionId = req.params.id;
        const { rejection_reason } = req.body;

        const connection = await getConnection();

        // Get transaction details
        const [transactions] = await connection.execute(`
            SELECT t.*, b.title as book_title, CONCAT(u.fname, ' ', u.lname) as borrower_name
            FROM transactions t
            JOIN books b ON t.book_id = b.id
            JOIN users u ON t.borrower_id = u.id
            WHERE t.id = ? AND t.lender_id = ?
        `, [transactionId, req.user.id]);

        if (transactions.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Transaction not found or not authorized' });
        }

        const transaction = transactions[0];

        if (transaction.status !== 'pending') {
            connection.release();
            return res.status(400).json({ error: 'Transaction is not in pending status' });
        }

        // Update transaction status to rejected
        await connection.execute(`
            UPDATE transactions
            SET status = 'rejected', rejection_reason = ?
            WHERE id = ?
        `, [rejection_reason, transactionId]);

        // Make book available again
        await connection.execute('UPDATE books SET is_available = TRUE WHERE id = ?', [transaction.book_id]);

        // Send notification to borrower
        await createNotification(
            connection,
            transaction.borrower_id,
            'Request Rejected',
            `Your request to borrow "${transaction.book_title}" was rejected: ${rejection_reason}`,
            'transaction',
            transactionId
        );

        connection.release();

        res.json({
            message: 'Borrow request rejected',
            borrower_name: transaction.borrower_name
        });

    } catch (error) {
        console.error('Reject transaction error:', error);
        res.status(500).json({ error: 'Failed to reject transaction' });
    }
});

// PUT /api/transactions/:id/return - Mark book as returned and handle feedback
router.put('/:id/return', [
    authenticateToken,
    body('return_condition').isIn(['excellent', 'good', 'fair', 'poor', 'damaged']).withMessage('Valid return condition required'),
    body('return_notes').optional().isLength({ max: 500 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const transactionId = req.params.id;
        const { return_condition, return_notes } = req.body;

        const connection = await getConnection();

        // Get transaction details
        const [transactions] = await connection.execute(`
            SELECT t.*, b.title as book_title, CONCAT(u.first_name, ' ', u.last_name) as borrower_name
            FROM transactions t
            JOIN books b ON t.book_id = b.id
            JOIN users u ON t.borrower_id = u.id
            WHERE t.id = ? AND t.borrower_id = ?


        `, [transactionId, req.user.id]);

        if (transactions.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Transaction not found or not authorized' });
        }

        const transaction = transactions[0];

        if (transaction.status !== 'borrowed') {
            connection.release();
            return res.status(400).json({ error: 'Book must be borrowed first' });
        }

        // Check if returned on time
        const returnDate = new Date();
        const expectedReturnDate = new Date(transaction.expected_return_date);
        const isOnTime = returnDate <= expectedReturnDate;
        const daysLate = isOnTime ? 0 : Math.ceil((returnDate - expectedReturnDate) / (1000 * 60 * 60 * 24));

        // Update transaction status
        await connection.execute(`
            UPDATE transactions
            SET status = 'returned',
                actual_return_date = NOW(),
                return_condition = ?,
                lender_notes = ?
            WHERE id = ?
        `, [return_condition, return_notes, transactionId]);

        // Make book available again
        await connection.execute('UPDATE books SET is_available = TRUE WHERE id = ?', [transaction.book_id]);

        // Calculate credit changes based on return condition and timeliness
        let creditChange = 0;
        let creditReason = '';

        if (isOnTime) {
            creditChange += 2; // Base reward for on-time return
            creditReason = 'Book returned on time';
        } else {
            creditChange -= Math.min(daysLate * 1, 10); // Max 10 credit deduction
            creditReason = `Book returned ${daysLate} day(s) late`;
        }

        // Additional credit based on condition
        if (return_condition === 'excellent') {
            creditChange += 1;
            creditReason += ' in excellent condition';
        } else if (return_condition === 'damaged') {
            creditChange -= 5;
            creditReason += ' in damaged condition';
        }

        // Update borrower credits
        if (creditChange !== 0) {
            await updateUserCredits(connection, transaction.borrower_id, creditChange, creditReason, transactionId);
        }

        // Send notifications
        await createNotification(
            connection,
            transaction.borrower_id,
            'Book Return Confirmed',
            `Your return of "${transaction.book_title}" has been confirmed. ${creditChange > 0 ? `You earned ${creditChange} credits!` : creditChange < 0 ? `${Math.abs(creditChange)} credits deducted.` : ''}`,
            'transaction',
            transactionId
        );

        connection.release();

        res.json({
            message: 'Book return processed successfully',
            credit_change: creditChange,
            borrower_name: transaction.borrower_name,
            return_status: isOnTime ? 'on_time' : 'late',
            days_late: daysLate
        });

    } catch (error) {
        console.error('Return book error:', error);
        res.status(500).json({ error: 'Failed to process book return' });
    }
});

// ============================
// COMPLETE TRANSACTION
// ============================

/**
 * PUT /api/transactions/:id/complete
 * Mark transaction as completed (final step: Returned → Completed)
 * Only lender can complete after book is returned
 */
router.put("/:id/complete", authenticateToken, async (req, res) => {
    try {
        const transactionId = req.params.id;
        const userId = req.user.id;

        const connection = await getConnection();

        const [transactions] = await connection.execute(`
      SELECT 
        t.*,
        b.title as book_title,
        CONCAT(borrower.fname, ' ', borrower.lname) as borrower_name,
        borrower.id as borrower_id
      FROM transactions t
      INNER JOIN books b ON t.book_id = b.id
      INNER JOIN users borrower ON t.borrower_id = borrower.id
      WHERE t.id = ? AND t.lender_id = ?
    `, [transactionId, userId]);

        if (transactions.length === 0) {
            connection.release();
            return res.status(404).json({
                error: 'Transaction not found or you are not authorized to complete it'
            });
        }

        const transaction = transactions[0];

        if (transaction.status !== 'returned') {
            connection.release();
            return res.status(400).json({
                error: `Cannot complete. Current status: ${transaction.status}. Must be 'returned' first.`
            });
        }

        // ✅ CORRECTED: Use 'updated' not 'updated_at'
        await connection.execute(
            'UPDATE transactions SET status = ?, updated = NOW() WHERE id = ?',
            ['completed', transactionId]
        );

        // Create notification
        await connection.execute(`
      INSERT INTO notifications (user_id, title, message, created_at, is_read)
      VALUES (?, ?, ?, NOW(), 0)
    `, [
            transaction.borrower_id,
            'Transaction Completed! ✅',
            `Your transaction for "${transaction.book_title}" has been completed!`
        ]);



        connection.release();

        console.log(`✅ Transaction ${transactionId} marked as completed by user ${userId}`);

        res.json({
            success: true,
            message: 'Transaction completed successfully!',
            status: 'completed',
            transaction_id: transactionId,
            book_title: transaction.book_title,
            borrower_name: transaction.borrower_name
        });

    } catch (err) {
        console.error("❌ Complete transaction error:", err);
        res.status(500).json({
            error: 'Failed to complete transaction',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});



// ============================
// BORROWING & LENDING HISTORY
// ============================

// Borrowing history (books borrowed by the logged-in user)
router.get("/history/borrowed", authenticateToken, async (req, res) => {
    try {
        const connection = await getConnection();
        const [rows] = await connection.execute(`
            SELECT 
                t.id AS transaction_id,
                t.status,
                t.request_date AS created_at,
                t.approved_date AS updated_at,
                t.borrowed_date AS borrow_date,
                t.expected_return_date AS due_date,
                t.actual_return_date AS return_date,
                b.id AS book_id,
                b.title,
                b.author,
                b.cover_image,
                CONCAT(lender.fname, ' ', lender.lname) AS owner_firstname,
                lender.email AS lender_email
            FROM transactions t
            INNER JOIN books b ON t.book_id = b.id
            INNER JOIN users lender ON t.lender_id = lender.id
            WHERE t.borrower_id = ?
            ORDER BY t.request_date DESC
        `, [req.user.id]);

        connection.release();

        console.log(`✅ Borrowed history for user ${req.user.id}:`, rows.length, 'records');
        res.json({ borrowedHistory: rows });
    } catch (err) {
        console.error("❌ Borrowed history error:", err);
        res.status(500).json({ error: "Failed to fetch borrowed history", details: err.message });
    }
});

// Lending history (books lent by the logged-in user)
router.get("/history/lent", authenticateToken, async (req, res) => {
    try {
        const connection = await getConnection();
        const [rows] = await connection.execute(`
            SELECT 
                t.id AS transaction_id,
                t.status,
                t.request_date AS created_at,
                t.approved_date AS updated_at,
                t.borrowed_date AS borrow_date,
                t.expected_return_date AS due_date,
                t.actual_return_date AS return_date,
                b.id AS book_id,
                b.title,
                b.author,
                b.cover_image,
                CONCAT(borrower.fname, ' ', borrower.lname) AS borrower_firstname,
                borrower.email AS borrower_email
            FROM transactions t
            INNER JOIN books b ON t.book_id = b.id
            INNER JOIN users borrower ON t.borrower_id = borrower.id
            WHERE t.lender_id = ?
            ORDER BY t.request_date DESC
        `, [req.user.id]);

        connection.release();

        console.log(`✅ Lent history for user ${req.user.id}:`, rows.length, 'records');
        res.json({ lentHistory: rows });
    } catch (err) {
        console.error("❌ Lent history error:", err);
        res.status(500).json({ error: "Failed to fetch lent history", details: err.message });
    }
});



// PUT /api/transactions/:id/cancel - Cancel transaction (for both parties)
router.put('/:id/cancel', [
    authenticateToken,
    body('cancellation_reason').trim().isLength({ min: 10, max: 500 }).withMessage('Please provide a detailed reason for cancellation (10-500 characters)')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const transactionId = req.params.id;
        const { cancellation_reason } = req.body;
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
        `, [transactionId]);

        if (transactions.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Transaction not found' });
        }

        const transaction = transactions[0];

        // Check if user is part of this transaction
        if (transaction.borrower_id !== req.user.id && transaction.lender_id !== req.user.id) {
            connection.release();
            return res.status(403).json({ error: 'Access denied. You are not part of this transaction.' });
        }

        // Check if transaction can be cancelled
        const cancellableStatuses = ['pending', 'approved'];
        if (!cancellableStatuses.includes(transaction.status)) {
            connection.release();
            return res.status(400).json({
                error: `Transaction cannot be cancelled. Current status: ${transaction.status}. Only pending or approved transactions can be cancelled.`
            });
        }

        // Determine who is cancelling
        const isBorrower = transaction.borrower_id === req.user.id;
        const cancelledBy = isBorrower ? 'borrower' : 'lender';
        const otherPartyId = isBorrower ? transaction.lender_id : transaction.borrower_id;
        const otherPartyName = isBorrower ? transaction.lender_name : transaction.borrower_name;

        // Update transaction status to cancelled
        await connection.execute(`
            UPDATE transactions
            SET status = 'cancelled',
                rejection_reason = ?,
                lender_notes = CONCAT(COALESCE(lender_notes, ''), '\\n[CANCELLED by ', ?, ']: ', ?)
            WHERE id = ?
        `, [cancellation_reason, cancelledBy, cancellation_reason, transactionId]);

        // Make book available again
        await connection.execute('UPDATE books SET is_available = TRUE WHERE id = ?', [transaction.book_id]);

        // Send notification to the other party
        const notificationTitle = `Transaction Cancelled`;
        const notificationMessage = `${isBorrower ? transaction.borrower_name : transaction.lender_name} has cancelled the transaction for "${transaction.book_title}". Reason: ${cancellation_reason}`;

        await createNotification(
            connection,
            otherPartyId,
            notificationTitle,
            notificationMessage,
            'transaction',
            transactionId
        );

        // Add system message to chat if it exists
        const [chats] = await connection.execute('SELECT id FROM chats WHERE transaction_id = ?', [transactionId]);
        if (chats.length > 0) {
            await connection.execute(`
                INSERT INTO chat_messages (chat_id, sender_id, message, message_type, created_at)
                VALUES (?, ?, ?, 'system', NOW())
            `, [
                chats[0].id,
                req.user.id,
                `🚫 Transaction cancelled by ${isBorrower ? 'borrower' : 'lender'}. Reason: ${cancellation_reason}`
            ]);

            // Deactivate the chat
            await connection.execute('UPDATE chats SET is_active = FALSE WHERE id = ?', [chats[0].id]);
        }

        connection.release();

        res.json({
            message: 'Transaction cancelled successfully',
            cancelled_by: cancelledBy,
            other_party: otherPartyName
        });

    } catch (error) {
        console.error('Cancel transaction error:', error);
        res.status(500).json({ error: 'Failed to cancel transaction' });
    }
});

// PUT /api/transactions/:id/borrowed - Mark book as picked up/borrowed
router.put('/:id/borrowed', [
    authenticateToken,
    body('lender_notes').optional().isLength({ max: 500 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const transactionId = req.params.id;
        const { lender_notes } = req.body;

        const connection = await getConnection();

        // Get transaction details
        const [transactions] = await connection.execute(`
            SELECT t.*, b.title as book_title, CONCAT(u.fname, ' ', u.lname) as borrower_name
            FROM transactions t
            JOIN books b ON t.book_id = b.id
            JOIN users u ON t.borrower_id = u.id
            WHERE t.id = ? AND t.lender_id = ?
        `, [transactionId, req.user.id]);

        if (transactions.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Transaction not found or not authorized' });
        }

        const transaction = transactions[0];

        if (transaction.status !== 'approved') {
            connection.release();
            return res.status(400).json({ error: 'Transaction must be approved before marking as borrowed' });
        }

        // Update transaction status to borrowed
        await connection.execute(`
            UPDATE transactions
SET status = 'borrowed',
    borrowed_date = NOW(),
    lender_notes = COALESCE(?, lender_notes),
    updated = NOW()
WHERE id = ?

        `, [lender_notes, transactionId]);

        // Send notification to borrower
        await createNotification(
            connection,
            transaction.borrower_id,
            'Book Pickup Confirmed',
            `The lender has confirmed that you picked up "${transaction.book_title}". Please return it by ${new Date(transaction.date_expected).toLocaleDateString()}.`,
            'transaction',
            transactionId
        );

        // Add system message to chat
        const [chats] = await connection.execute('SELECT id FROM chats WHERE transaction_id = ?', [transactionId]);
        if (chats.length > 0) {
            await connection.execute(`
                INSERT INTO chat_messages (chat_id, sender_id, message, message_type, created)
                VALUES (?, ?, ?, 'sys', NOW())
            `, [
                chats[0].id,
                req.user.id,
                `📖 Book pickup confirmed! "${transaction.book_title}" is now borrowed. Please return by ${new Date(transaction.date_expected).toLocaleDateString()}.`
            ]);
        }

        connection.release();

        res.json({
            message: 'Book pickup confirmed successfully',
            borrower_name: transaction.borrower_name,
            expected_return_date: transaction.date_expected
        });

    } catch (error) {
        console.error('Mark as borrowed error:', error);
        res.status(500).json({ error: 'Failed to mark book as borrowed' });
    }
});

/**
 * GET /api/transactions/:id
 * Get single transaction details
 * Only accessible by borrower or lender
 */
router.get("/:id", authenticateToken, async (req, res) => {
    try {
        const transactionId = req.params.id;
        const userId = req.user.id;

        const connection = await getConnection();

        // Get transaction with full details
        const [transactions] = await connection.execute(`
      SELECT 
        t.*,
        b.title as book_title,
        b.author as book_author,
        b.cover_image as book_cover,
        CONCAT(borrower.fname, ' ', borrower.lname) as borrower_name,
        CONCAT(lender.fname, ' ', lender.lname) as lender_name,
        borrower.email as borrower_email,
        lender.email as lender_email
      FROM transactions t
      INNER JOIN books b ON t.book_id = b.id
      INNER JOIN users borrower ON t.borrower_id = borrower.id
      INNER JOIN users lender ON t.lender_id = lender.id
      WHERE t.id = ? AND (t.borrower_id = ? OR t.lender_id = ?)
    `, [transactionId, userId, userId]);

        if (transactions.length === 0) {
            connection.release();
            return res.status(404).json({
                error: 'Transaction not found or you do not have access to it'
            });
        }

        connection.release();

        res.json(transactions[0]);

    } catch (err) {
        console.error("Get transaction error:", err);
        res.status(500).json({
            error: 'Failed to get transaction details'
        });
    }
});



// POST /api/transactions/bulk-approve - Bulk approve requests
router.post('/bulk-approve', [
    authenticateToken,
    body('transaction_ids').isArray({ min: 1 }).withMessage('At least one transaction ID is required'),
    body('transaction_ids.*').isInt({ min: 1 }).withMessage('Valid transaction IDs are required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const { transaction_ids } = req.body;
        const connection = await getConnection();

        const results = {
            approved: [],
            failed: []
        };

        for (const transactionId of transaction_ids) {
            try {
                // Get transaction details
                const [transactions] = await connection.execute(`
                    SELECT t.*, b.title as book_title, CONCAT(u.fname, ' ', u.lname) as borrower_name
                    FROM transactions t
                    JOIN books b ON t.book_id = b.id
                    JOIN users u ON t.borrower_id = u.id
                    WHERE t.id = ? AND t.lender_id = ?
                `, [transactionId, req.user.id]);

                if (transactions.length === 0) {
                    results.failed.push({ id: transactionId, reason: 'Not found or not authorized' });
                    continue;
                }

                const transaction = transactions[0];

                if (transaction.status !== 'pending') {
                    results.failed.push({ id: transactionId, reason: `Status is ${transaction.status}, not pending` });
                    continue;
                }

                // Update transaction status to approved
                await connection.execute(`
                    UPDATE transactions
                    SET status = 'approved',
                        approved_date = NOW()
                    WHERE id = ?
                `, [transactionId]);

                // Create chat for approved transaction
                const [chatResult] = await connection.execute(`
                    INSERT INTO chats (transaction_id, created)
                    VALUES (?, NOW())
                `, [transactionId]);

                // Send system message to chat
                await connection.execute(`
                    INSERT INTO chat_messages (chat_id, sender_id, message, message_type, created)
                    VALUES (?, ?, ?, 'sys', NOW())
                `, [chatResult.insertId, req.user.id, `Chat created for "${transaction.book_title}" transaction. You can now discuss pickup details and terms.`]);

                // Send notification to borrower
                await createNotification(
                    connection,
                    transaction.borrower_id,
                    'Request Approved!',
                    `Your request to borrow "${transaction.book_title}" has been approved. You can now chat with the lender.`,
                    'transaction',
                    transactionId
                );

                results.approved.push({ id: transactionId, book_title: transaction.book_title });

            } catch (error) {
                console.error(`Failed to approve transaction ${transactionId}:`, error);
                results.failed.push({ id: transactionId, reason: error.message });
            }
        }

        connection.release();

        res.json({
            message: `Bulk approval completed. ${results.approved.length} approved, ${results.failed.length} failed.`,
            results
        });

    } catch (error) {
        console.error('Bulk approve error:', error);
        res.status(500).json({ error: 'Failed to process bulk approval' });
    }
});

// POST /api/transactions/bulk-reject - Bulk reject requests
router.post('/bulk-reject', [
    authenticateToken,
    body('transaction_ids').isArray({ min: 1 }).withMessage('At least one transaction ID is required'),
    body('transaction_ids.*').isInt({ min: 1 }).withMessage('Valid transaction IDs are required'),
    body('rejection_reason').notEmpty().withMessage('Rejection reason is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const { transaction_ids, rejection_reason } = req.body;
        const connection = await getConnection();

        const results = {
            rejected: [],
            failed: []
        };

        for (const transactionId of transaction_ids) {
            try {
                // Get transaction details
                const [transactions] = await connection.execute(`
                    SELECT t.*, b.title as book_title, CONCAT(u.fname, ' ', u.lname) as borrower_name
                    FROM transactions t
                    JOIN books b ON t.book_id = b.id
                    JOIN users u ON t.borrower_id = u.id
                    WHERE t.id = ? AND t.lender_id = ?
                `, [transactionId, req.user.id]);

                if (transactions.length === 0) {
                    results.failed.push({ id: transactionId, reason: 'Not found or not authorized' });
                    continue;
                }

                const transaction = transactions[0];

                if (transaction.status !== 'pending') {
                    results.failed.push({ id: transactionId, reason: `Status is ${transaction.status}, not pending` });
                    continue;
                }

                // Update transaction status to rejected
                await connection.execute(`
                    UPDATE transactions
                    SET status = 'rejected', rejection_reason = ?
                    WHERE id = ?
                `, [rejection_reason, transactionId]);

                // Make book available again
                await connection.execute('UPDATE books SET is_available = TRUE WHERE id = ?', [transaction.book_id]);

                // Send notification to borrower
                await createNotification(
                    connection,
                    transaction.borrower_id,
                    'Request Rejected',
                    `Your request to borrow "${transaction.book_title}" was rejected: ${rejection_reason}`,
                    'transaction',
                    transactionId
                );

                results.rejected.push({ id: transactionId, book_title: transaction.book_title });

            } catch (error) {
                console.error(`Failed to reject transaction ${transactionId}:`, error);
                results.failed.push({ id: transactionId, reason: error.message });
            }
        }

        connection.release();

        res.json({
            message: `Bulk rejection completed. ${results.rejected.length} rejected, ${results.failed.length} failed.`,
            results
        });

    } catch (error) {
        console.error('Bulk reject error:', error);
        res.status(500).json({ error: 'Failed to process bulk rejection' });
    }
});


module.exports = router;
