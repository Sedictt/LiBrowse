// LiBrowse - Books Routes
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { body, validationResult, query } = require('express-validator');

const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { getConnection } = require('../config/database');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads', 'books');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'book-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Get all books with filtering and pagination
router.get('/', [
    optionalAuth,
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    query('program').optional().isString(),
    query('condition').optional().isIn(['excellent', 'good', 'fair']).withMessage('Invalid condition'),
    query('availability').optional().isIn(['available', 'borrowed']).withMessage('Invalid availability'),
    query('sort').optional().isString() // ADD THIS LINE
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const offset = (page - 1) * limit;

        const connection = await getConnection();

        // Build WHERE clause based on filters
        let whereConditions = ['1=1'];
        let queryParams = [];

        if (req.query.program) {
            whereConditions.push('u.course = ?');
            queryParams.push(req.query.program);
        }

        if (req.query.condition) {
            whereConditions.push('b.condition_rating = ?');
            queryParams.push(req.query.condition);
        }

        if (req.query.availability) {
            if (req.query.availability === 'available') {
                whereConditions.push('b.is_available = TRUE');
            } else if (req.query.availability === 'borrowed') {
                whereConditions.push('b.is_available = FALSE');
            }
        }

        // If user is authenticated, they can see their own books regardless of status
        if (req.user) {
            whereConditions = [`(${whereConditions.join(' AND ')}) OR b.owner_id = ?`];
            queryParams.push(req.user.id);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // ========================================
        // SORTING LOGIC (ADD THIS)
        // ========================================
        let orderBy = 'b.created_at DESC'; // default

        const sort = req.query.sort;
        if (sort === 'titleasc') {
            orderBy = 'b.title ASC';
        } else if (sort === 'titledesc') {
            orderBy = 'b.title DESC';
        } else if (sort === 'creditslow') {
            orderBy = 'b.minimum_credits ASC';
        } else if (sort === 'creditshigh') {
            orderBy = 'b.minimum_credits DESC';
        } else if (sort === 'newest') {
            orderBy = 'b.created_at DESC';
        } else if (sort === 'oldest') {
            orderBy = 'b.created_at ASC';
        }
        // ========================================

        // Get books with owner information
        const [books] = await connection.execute(`
            SELECT
                b.*,
                CONCAT(u.fname, ' ', u.lname) as owner_name,
                u.email as owner_email,
                u.course as owner_program
            FROM books b
            JOIN users u ON b.owner_id = u.id
            ${whereClause}
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
        `, [...queryParams, limit, offset]);

        // Get total count for pagination
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as total
            FROM books b
            JOIN users u ON b.owner_id = u.id
            ${whereClause}
        `, queryParams);

        connection.release();

        const total = countResult[0].total;
        const hasMore = offset + limit < total;

        res.json({
            books: books.map(book => ({
                ...book,
                program: book.owner_program,
                status: book.is_available ? 'available' : 'borrowed',
                condition: book.condition_rating,
                min_credit: book.minimum_credits,
                image_url: book.cover_image ? `/uploads/books/${path.basename(book.cover_image)}` : null
            })),
            pagination: {
                page,
                limit,
                total,
                hasMore,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get books error:', error);
        res.status(500).json({ error: 'Failed to fetch books' });
    }
});


// ========================================
// AUTOCOMPLETE ENDPOINT (FIXED)
// ========================================
router.get('/autocomplete', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.trim().length < 2) {
            return res.status(400).json({ error: 'Query too short' });
        }

        const search = `%${query}%`;
        const connection = await getConnection();

        // FIXED: Now includes author and isbn in SELECT
        const [results] = await connection.execute(
            `SELECT DISTINCT
         b.title,
         b.author,
         b.isbn,
         b.course_code
       FROM books b
       WHERE b.title LIKE ?
         OR b.author LIKE ?
         OR b.isbn LIKE ?
       ORDER BY b.title ASC
       LIMIT 10`,
            [search, search, search]
        );

        connection.release();

        // Return properly formatted suggestions
        const suggestions = results.map(row => ({
            title: row.title,
            author: row.author || 'Unknown',
            coursecode: row.course_code || 'N/A'
        }));

        console.log('AUTOCOMPLETE SUGGESTIONS:', suggestions);
        res.json({ suggestions });

    } catch (error) {
        console.error('Autocomplete error:', error);
        res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
});



// Search books
// Search books (update this existing route)
router.get('/search', [
    optionalAuth,
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
    try {
        const searchQuery = req.query.query || '';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const offset = (page - 1) * limit;

        const { program, condition, availability, minCredits, maxCredits, sort } = req.query;

        const connection = await getConnection();

        // Search conditions
        let whereClause = `WHERE (b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ? OR b.description LIKE ?)`;
        const queryParams = Array(4).fill(`%${searchQuery}%`);

        if (program) {
            whereClause += ' AND u.program = ?';
            queryParams.push(program);
        }
        if (condition) {
            whereClause += ' AND b.condition_rating = ?';
            queryParams.push(condition);
        }
        if (availability) {
            whereClause += availability === 'available'
                ? ' AND b.is_available = TRUE'
                : ' AND b.is_available = FALSE';
        }
        if (minCredits) {
            whereClause += ' AND b.minimum_credits >= ?';
            queryParams.push(parseInt(minCredits));
        }
        if (maxCredits) {
            whereClause += ' AND b.minimum_credits <= ?';
            queryParams.push(parseInt(maxCredits));
        }

        // Sorting
        let orderBy = 'b.created_at DESC';
        if (sort === 'title_asc') orderBy = 'b.title ASC';
        else if (sort === 'title_desc') orderBy = 'b.title DESC';
        else if (sort === 'credits_low') orderBy = 'b.minimum_credits ASC';
        else if (sort === 'credits_high') orderBy = 'b.minimum_credits DESC';

        const [books] = await connection.execute(`
            SELECT
                b.*, CONCAT(u.fname, ' ', u.lname) AS owner_name,
                u.email AS owner_email, u.course AS owner_program
            FROM books b
            JOIN users u ON b.owner_id = u.id
            ${whereClause}
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
        `, [...queryParams, limit, offset]);

        const [countResult] = await connection.execute(`
            SELECT COUNT(*) AS total
            FROM books b
            JOIN users u ON b.owner_id = u.id
            ${whereClause}
        `, queryParams);

        connection.release();

        res.json({
            books: books.map(book => ({
                ...book,
                program: book.owner_program,
                status: book.is_available ? 'available' : 'borrowed',
                image_url: book.cover_image ? `/uploads/books/${path.basename(book.cover_image)}` : null
            })),
            pagination: {
                page,
                limit,
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit),
                hasMore: offset + limit < countResult[0].total
            },
            query: searchQuery
        });
    } catch (error) {
        console.error('Advanced search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// ==============================================
// Autocomplete suggestions (for search bar)
// ==============================================
router.get('/suggestions', optionalAuth, async (req, res) => {
    try {
        const { q, query } = req.query;
        const searchTerm = q || query; // Accept both ?q= and ?query=

        if (!searchTerm || searchTerm.trim().length < 2) {
            return res.json({ suggestions: [] }); // Too short, return empty
        }

        const search = `%${searchTerm}%`;
        const connection = await getConnection();

        const [results] = await connection.execute(`
            SELECT DISTINCT b.title, b.author, b.course_code
            FROM books b
            WHERE b.title LIKE ? OR b.author LIKE ? OR b.course_code LIKE ?
            ORDER BY b.title ASC
            LIMIT 10
        `, [search, search, search]);

        connection.release();

        const suggestions = results.map(row => ({
            title: row.title,
            author: row.author,
            course_code: row.course_code
        }));

        console.log("📚 SUGGESTIONS RETURNED:", suggestions);

        res.json({ suggestions });
    } catch (error) {
        console.error('Autocomplete error:', error);
        res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
});


// Autocomplete (title/author)
router.get('/autocomplete', async (req, res) => {
    try {
        const q = req.query.q || '';
        if (!q) return res.json({ suggestions: [] });

        const connection = await getConnection();
        const [results] = await connection.execute(`
            SELECT DISTINCT title
            FROM books
            WHERE title LIKE ?
            ORDER BY title ASC
            LIMIT 10
        `, [`%${q}%`]);
        connection.release();

        res.json({
            suggestions: results.map(r => r.title)
        });
    } catch (error) {
        console.error('Autocomplete error:', error);
        res.status(500).json({ error: 'Failed to get suggestions' });
    }
});

// ========================================
// ENHANCED PERSONALIZED RECOMMENDATIONS
// ========================================

// GET /api/books/recommendations - Get personalized recommendations (general)
router.get('/recommendations', authenticateToken, async (req, res) => {
    try {
        const connection = await getConnection();
        const limit = parseInt(req.query.limit) || 8;

        // Get user's activity to determine preferences
        const [userActivity] = await connection.execute(
            `SELECT subject, COUNT(*) as count
       FROM recently_viewed rv
       INNER JOIN books b ON rv.book_id = b.id
       WHERE rv.user_id = ?
       GROUP BY subject
       ORDER BY count DESC
       LIMIT 3`,
            [req.user.id]
        );

        const preferredSubjects = userActivity.map(a => a.subject).filter(Boolean);

        // Get user's course for better matching
        const [[userData]] = await connection.execute(
            'SELECT course FROM users WHERE id = ?',
            [req.user.id]
        );

        // Build recommendation query with relevance scoring
        const subjects = preferredSubjects;
        const subjectClause = subjects.length ? `b.subject IN (${subjects.map(() => '?').join(',')})` : 'FALSE';

        let query = `
      SELECT b.*,
             CONCAT(u.fname, ' ', u.lname) as owner_name,
             u.email as owner_email,
             u.course as owner_program,
             (CASE
               WHEN ${subjectClause} THEN 3
               WHEN b.course_code LIKE CONCAT(?, '%') THEN 2
               ELSE 1
             END) as relevance_score
      FROM books b
      INNER JOIN users u ON b.owner_id = u.id
      WHERE b.is_available = 1
        AND b.owner_id != ?
        AND b.id NOT IN (
          SELECT book_id FROM recently_viewed WHERE user_id = ?
        )
    `;

        const params = [...subjects, (userData?.course || ''), req.user.id, req.user.id];

        query += ` ORDER BY relevance_score DESC, b.created_at DESC LIMIT ?`;
        params.push(limit);

        const [recommendations] = await connection.execute(query, params);
        connection.release();

        res.json({
            books: recommendations.map(book => ({
                ...book,
                image_url: book.cover_image ? `/uploads/books/${path.basename(book.cover_image)}` : null
            }))
        });
    } catch (error) {
        console.error('Failed to fetch recommendations:', error);
        res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
});

// GET /api/books/:id/similar - Get similar books (for detail page)
router.get('/:id/similar', optionalAuth, async (req, res) => {
    try {
        const connection = await getConnection();

        // Get the current book's details
        const [[currentBook]] = await connection.execute(
            'SELECT subject, course_code FROM books WHERE id = ? AND is_available = 1',
            [req.params.id]
        );

        if (!currentBook) {
            connection.release();
            return res.status(404).json({ error: 'Book not found' });
        }

        const { subject, course_code } = currentBook;

        // Find similar books
        const [similar] = await connection.execute(
            `SELECT b.*,
              CONCAT(u.fname, ' ', u.lname) as owner_name,
              u.email as owner_email,
              u.course as owner_program
       FROM books b
       INNER JOIN users u ON b.owner_id = u.id
       WHERE b.id != ?
         AND b.is_available = 1
         AND (b.subject = ? OR b.course_code = ?)
       ORDER BY
         (CASE WHEN b.subject = ? THEN 2 ELSE 0 END) +
         (CASE WHEN b.course_code = ? THEN 1 ELSE 0 END) DESC,
         b.created_at DESC
       LIMIT 6`,
            [req.params.id, subject, course_code, subject, course_code]
        );

        connection.release();
        res.json({
            recommendations: similar.map(book => ({
                ...book,
                image_url: book.cover_image ? `/uploads/books/${path.basename(book.cover_image)}` : null
            }))
        });
    } catch (error) {
        console.error('Failed to fetch similar books:', error);
        res.status(500).json({ error: 'Failed to fetch similar books' });
    }
});



// Get user's own books (must be before /:id route)
router.get('/my-books', authenticateToken, async (req, res) => {
    try {
        const connection = await getConnection();

        const [books] = await connection.execute(`
            SELECT
                b.*,
                CONCAT(u.fname, ' ', u.lname) as owner_name,
                u.email as owner_email,
                u.course as owner_program
            FROM books b
            JOIN users u ON b.owner_id = u.id
            WHERE b.owner_id = ?
            ORDER BY b.created_at DESC
        `, [req.user.id]);

        connection.release();

        res.json({
            books: books.map(book => ({
                ...book,
                status: book.is_available ? 'available' : 'borrowed',
                condition: book.condition_rating,
                min_credit: book.minimum_credits,
                image_url: book.cover_image ? `/uploads/books/${path.basename(book.cover_image)}` : null
            }))
        });

    } catch (error) {
        console.error('Get my books error:', error);
        res.status(500).json({ error: 'Failed to fetch your books' });
    }
});

// ========================================
// SAVED SEARCHES ROUTES
// ========================================

// GET /api/books/saved-searches - Get user's saved searches
router.get('/saved-searches', authenticateToken, async (req, res) => {
    try {
        const conn = await getConnection();
        const [searches] = await conn.execute(
            `SELECT id, search_name, search_criteria, created_at, last_used
       FROM saved_searches
       WHERE user_id = ?
       ORDER BY last_used DESC, created_at DESC`,
            [req.user.id]
        );
        conn.release();

        const parsedSearches = searches.map(s => ({
            ...s,
            search_criteria: JSON.parse(s.search_criteria)
        }));

        res.json({ searches: parsedSearches });
    } catch (error) {
        console.error('Failed to fetch saved searches:', error);
        res.status(500).json({ error: 'Failed to fetch saved searches' });
    }
});

// POST /api/books/saved-searches - Create new saved search
router.post('/saved-searches', authenticateToken, async (req, res) => {
    try {
        const { search_name, search_criteria } = req.body;
        const conn = await getConnection();

        const [result] = await conn.execute(
            `INSERT INTO saved_searches (user_id, search_name, search_criteria, created_at, last_used)
       VALUES (?, ?, ?, NOW(), NOW())`,
            [req.user.id, search_name, JSON.stringify(search_criteria)]
        );

        conn.release();
        res.json({ id: result.insertId, message: 'Search saved successfully' });
    } catch (error) {
        console.error('Failed to save search:', error);
        res.status(500).json({ error: 'Failed to save search' });
    }
});

// PUT /api/books/saved-searches/:id - Update last_used
router.put('/saved-searches/:id', authenticateToken, async (req, res) => {
    try {
        const conn = await getConnection();
        await conn.execute(
            `UPDATE saved_searches SET last_used = NOW() WHERE id = ? AND user_id = ?`,
            [req.params.id, req.user.id]
        );
        conn.release();
        res.json({ message: 'Search updated' });
    } catch (error) {
        console.error('Failed to update search:', error);
        res.status(500).json({ error: 'Failed to update search' });
    }
});

// DELETE /api/books/saved-searches/:id
router.delete('/saved-searches/:id', authenticateToken, async (req, res) => {
    try {
        const conn = await getConnection();
        await conn.execute(
            `DELETE FROM saved_searches WHERE id = ? AND user_id = ?`,
            [req.params.id, req.user.id]
        );
        conn.release();
        res.json({ message: 'Search deleted' });
    } catch (error) {
        console.error('Failed to delete search:', error);
        res.status(500).json({ error: 'Failed to delete search' });
    }
});

// ========================================
// RECENTLY VIEWED ROUTES
// ========================================

// POST /api/books/:id/view - Track book view
router.post('/:id/view', authenticateToken, async (req, res) => {
    try {
        const conn = await getConnection();
        await conn.execute(
            `INSERT INTO recently_viewed (user_id, book_id, viewed_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE viewed_at = NOW()`,
            [req.user.id, req.params.id]
        );
        conn.release();
        res.json({ message: 'View tracked' });
    } catch (error) {
        console.error('Failed to track view:', error);
        res.status(500).json({ error: 'Failed to track view' });
    }
});

// GET /api/books/recently-viewed - Get recently viewed books
router.get('/recently-viewed', authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const conn = await getConnection();

        const [books] = await conn.execute(
            `SELECT b.*, rv.viewed_at,
              CONCAT(u.fname, ' ', u.lname) as owner_name,
              u.email as owner_email,
              u.course as owner_program
       FROM recently_viewed rv
       INNER JOIN books b ON rv.book_id = b.id
       INNER JOIN users u ON b.owner_id = u.id
       WHERE rv.user_id = ?
       ORDER BY rv.viewed_at DESC
       LIMIT ?`,
            [req.user.id, limit]
        );

        conn.release();
        res.json({
            books: books.map(book => ({
                ...book,
                image_url: book.cover_image ? `/uploads/books/${path.basename(book.cover_image)}` : null
            }))
        });
    } catch (error) {
        console.error('Failed to fetch recently viewed:', error);
        res.status(500).json({ error: 'Failed to fetch recently viewed' });
    }
});



// Get single book
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const bookId = req.params.id;
        const connection = await getConnection();

        const [books] = await connection.execute(`
            SELECT
                b.*,
                CONCAT(u.fname, ' ', u.lname) as owner_name,
                u.email as owner_email,
                u.course as owner_program,
                u.id as owner_id
            FROM books b
            JOIN users u ON b.owner_id = u.id
            WHERE b.id = ?
        `, [bookId]);

        connection.release();

        if (books.length === 0) {
            return res.status(404).json({ error: 'Book not found' });
        }

        const book = books[0];
        book.image_url = book.cover_image ? `/uploads/books/${path.basename(book.cover_image)}` : null;

        res.json({ book });

    } catch (error) {
        console.error('Get book error:', error);
        res.status(500).json({ error: 'Failed to fetch book' });
    }
});

// Add new book (with optional image upload)
router.post('/', [
    authenticateToken,
    upload.single('image'),
    body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
    body('author').trim().isLength({ min: 1 }).withMessage('Author is required'),
    body('course_code').trim().notEmpty().withMessage('Course code is required'),
    body('condition').isIn(['excellent', 'good', 'fair', 'poor']).withMessage('Invalid condition'),
    body('minimum_credits').optional().isInt({ min: 50, max: 500 }).withMessage('Minimum credits must be between 50-500')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Clean up uploaded file if validation fails
            if (req.file) {
                try {
                    await fs.unlink(req.file.path);
                } catch (unlinkError) {
                    console.error('Failed to delete uploaded file:', unlinkError);
                }
            }
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const {
            title,
            author,
            isbn,
            edition,
            course_code,
            subject,
            condition,
            minimum_credits = 100,
            description,
            publisher,
            publication_year
        } = req.body;

        const connection = await getConnection();

        const [result] = await connection.execute(`
            INSERT INTO books (
                title, author, isbn, course_code, subject, edition, publisher, publication_year,
                condition_rating, description, owner_id, is_available, minimum_credits,
                cover_image, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?, NOW())
        `, [
            title,
            author,
            isbn || null,
            course_code,
            (subject && subject.trim()) ? subject : 'General',
            edition || null,
            publisher || null,
            publication_year || null,
            condition,
            description || null,
            req.user.id,
            minimum_credits,
            req.file ? req.file.path : null
        ]);

        // Get the created book
        const [books] = await connection.execute(`
            SELECT
                b.*,
                CONCAT(u.fname, ' ', u.lname) as owner_name
            FROM books b
            JOIN users u ON b.owner_id = u.id
            WHERE b.id = ?
        `, [result.insertId]);

        connection.release();

        const book = books[0];
        book.image_url = book.cover_image ? `/uploads/books/${path.basename(book.cover_image)}` : null;

        res.status(201).json({
            message: 'Book added successfully',
            book
        });

    } catch (error) {
        console.error('Add book error:', error);
        // Clean up uploaded file on error
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Failed to delete uploaded file:', unlinkError);
            }
        }
        res.status(500).json({ error: 'Failed to add book' });
    }
});

// Update book
router.put('/:id', [
    authenticateToken,
    body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
    body('author').trim().isLength({ min: 1 }).withMessage('Author is required'),
    body('course_code').trim().notEmpty().withMessage('Course code is required'),
    body('condition').isIn(['excellent', 'good', 'fair', 'poor']).withMessage('Invalid condition'),
    body('minimum_credits').isInt({ min: 50, max: 500 }).withMessage('Minimum credits must be between 50-500')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const bookId = req.params.id;
        const {
            title,
            author,
            isbn,
            edition,
            course_code,
            subject,
            condition,
            minimum_credits,
            description
        } = req.body;

        const connection = await getConnection();

        // Check if user owns the book
        const [existingBooks] = await connection.execute(
            'SELECT * FROM books WHERE id = ? AND owner_id = ?',
            [bookId, req.user.id]
        );

        if (existingBooks.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Book not found or access denied' });
        }

        // Update book
        await connection.execute(`
            UPDATE books SET
                title = ?, author = ?, isbn = ?, course_code = ?, subject = ?,
                edition = ?, condition_rating = ?, description = ?, minimum_credits = ?,
                updated_at = NOW()
            WHERE id = ? AND owner_id = ?
        `, [
            title, author, isbn || null, course_code, (subject && subject.trim()) ? subject : 'General',
            edition || null, condition, description || null, minimum_credits, bookId, req.user.id
        ]);

        // Get updated book
        const [updatedBooks] = await connection.execute(`
            SELECT
                b.*,
                CONCAT(u.fname, ' ', u.lname) as owner_name
            FROM books b
            JOIN users u ON b.owner_id = u.id
            WHERE b.id = ?
        `, [bookId]);

        connection.release();

        res.json({
            message: 'Book updated successfully',
            book: updatedBooks[0]
        });

    } catch (error) {
        console.error('Update book error:', error);
        res.status(500).json({ error: 'Failed to update book' });
    }
});

// Upload book image
router.post('/:id/image', [
    authenticateToken,
    upload.single('image')
], async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        const bookId = req.params.id;
        const connection = await getConnection();

        // Check if user owns the book
        const [books] = await connection.execute(
            'SELECT * FROM books WHERE id = ? AND owner_id = ?',
            [bookId, req.user.id]
        );

        if (books.length === 0) {
            connection.release();
            // Delete uploaded file
            await fs.unlink(req.file.path);
            return res.status(404).json({ error: 'Book not found or access denied' });
        }

        const book = books[0];

        // Delete old image if exists
        if (book.cover_image) {
            try {
                await fs.unlink(book.cover_image);
            } catch (error) {
                console.log('Old image file not found:', error.message);
            }
        }

        // Update book with new image path
        await connection.execute(
            'UPDATE books SET cover_image = ? WHERE id = ?',
            [req.file.path, bookId]
        );

        connection.release();

        res.json({
            message: 'Image uploaded successfully',
            image_url: `/uploads/books/${req.file.filename}`
        });

    } catch (error) {
        console.error('Upload image error:', error);
        // Clean up uploaded file on error
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Failed to delete uploaded file:', unlinkError);
            }
        }
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

// Toggle book availability
router.patch('/:id/availability', authenticateToken, async (req, res) => {
    try {
        const bookId = req.params.id;
        const { is_available } = req.body;

        if (typeof is_available !== 'boolean') {
            return res.status(400).json({ error: 'is_available must be a boolean' });
        }

        const connection = await getConnection();

        // Check if user owns the book
        const [books] = await connection.execute(
            'SELECT * FROM books WHERE id = ? AND owner_id = ?',
            [bookId, req.user.id]
        );

        if (books.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Book not found or access denied' });
        }

        // Update availability
        await connection.execute(
            'UPDATE books SET is_available = ?, updated_at = NOW() WHERE id = ?',
            [is_available, bookId]
        );

        connection.release();

        res.json({
            message: 'Book availability updated successfully',
            is_available
        });

    } catch (error) {
        console.error('Toggle availability error:', error);
        res.status(500).json({ error: 'Failed to update availability' });
    }
});

// Delete book
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const bookId = req.params.id;
        const connection = await getConnection();

        // Check if user owns the book
        const [books] = await connection.execute(
            'SELECT * FROM books WHERE id = ? AND owner_id = ?',
            [bookId, req.user.id]
        );

        if (books.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Book not found or access denied' });
        }

        const book = books[0];

        // Check if book has active transactions
        const [transactions] = await connection.execute(
            'SELECT COUNT(*) as count FROM transactions WHERE book_id = ? AND status IN ("requested", "approved", "borrowed")',
            [bookId]
        );

        if (transactions[0].count > 0) {
            connection.release();
            return res.status(400).json({
                error: 'Cannot delete book with active transactions'
            });
        }

        // Permanently delete the book (no soft delete column in schema)
        await connection.execute(
            'DELETE FROM books WHERE id = ?',
            [bookId]
        );

        connection.release();

        // Delete image file if exists
        if (book.cover_image) {
            try {
                await fs.unlink(book.cover_image);
            } catch (error) {
                console.log('Image file not found:', error.message);
            }
        }

        res.json({ message: 'Book deleted successfully' });

    } catch (error) {
        console.error('Delete book error:', error);
        res.status(500).json({ error: 'Failed to delete book' });
    }
});



module.exports = router;
