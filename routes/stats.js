const express = require('express');
const router = express.Router();
const { pool, executeQuery } = require('../config/database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

// Get platform statistics (public)
router.get('/platform', optionalAuth, async (req, res) => {
    try {
        // Total users
        const [userCount] = await pool.execute('SELECT COUNT(*) as count FROM users');
        
        // Total books
        const [bookCount] = await pool.execute('SELECT COUNT(*) as count FROM books');
        
        // Total transactions
        const [transactionCount] = await pool.execute('SELECT COUNT(*) as count FROM transactions');
        
        // Active transactions
        const [activeTransactions] = await pool.execute(
            'SELECT COUNT(*) as count FROM transactions WHERE status = "borrowed"'
        );
        
        // Average rating
        const [avgRating] = await pool.execute(
            'SELECT AVG(rating) as average FROM feedback WHERE rating IS NOT NULL'
        );
        
        const avg = avgRating && avgRating[0] && avgRating[0].average != null
            ? Number.parseFloat(Number(avgRating[0].average).toFixed(1))
            : 0;

        // Return both snake_case (current frontend) and camelCase (legacy/presentation) keys
        res.json({
            // Preferred keys used by current frontend
            total_users: userCount[0].count,
            total_books: bookCount[0].count,
            total_transactions: transactionCount[0].count,
            average_rating: avg,
            active_transactions: activeTransactions[0].count,
            
            // Legacy/camelCase for compatibility
            users: userCount[0].count,
            books: bookCount[0].count,
            transactions: transactionCount[0].count,
            activeTransactions: activeTransactions[0].count,
            averageRating: avg
        });
    } catch (error) {
        console.error('Error fetching platform stats:', error);
        res.status(500).json({ error: 'Failed to fetch platform statistics' });
    }
});

// Get user statistics
router.get('/user', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Books owned
        const [ownedBooks] = await pool.execute(
            'SELECT COUNT(*) as count FROM books WHERE owner_id = ?',
            [userId]
        );
        
        // Books lent
        const [lentBooks] = await pool.execute(
            'SELECT COUNT(*) as count FROM transactions WHERE lender_id = ? AND status = "borrowed"',
            [userId]
        );
        
        // Books borrowed
        const [borrowedBooks] = await pool.execute(
            'SELECT COUNT(*) as count FROM transactions WHERE borrower_id = ? AND status = "borrowed"',
            [userId]
        );
        
        // Total transactions
        const [totalTransactions] = await pool.execute(
            'SELECT COUNT(*) as count FROM transactions WHERE lender_id = ? OR borrower_id = ?',
            [userId, userId]
        );
        
        // User credits
        const [user] = await pool.execute(
            'SELECT credits FROM users WHERE id = ?',
            [userId]
        );
        
        res.json({
            ownedBooks: ownedBooks[0].count,
            lentBooks: lentBooks[0].count,
            borrowedBooks: borrowedBooks[0].count,
            totalTransactions: totalTransactions[0].count,
            credits: user[0]?.credits || 0
        });
    } catch (error) {
        console.error('Error fetching user stats:', error);
        res.status(500).json({ error: 'Failed to fetch user statistics' });
    }
});

module.exports = router;
