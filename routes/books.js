// LiBrowse - Books Routes
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const cloudinary = require('cloudinary').v2;
const { body, validationResult, query } = require('express-validator');

const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { getConnection } = require('../config/database');

const router = express.Router();

// Helper: resolve image URL (legacy local path vs Cloudinary/external URL)
function resolveImageUrl(coverImage) {
    if (!coverImage) return null;
    if (/^https?:\/\//.test(coverImage)) return coverImage;
    return `/uploads/books/${path.basename(coverImage)}`;
}

// Cloudinary config: prefer CLOUDINARY_URL; fallback to discrete env vars
try {
    if (process.env.CLOUDINARY_URL) {
        cloudinary.config({ secure: true });
    } else if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
            secure: true
        });
    }
    console.log('[Cloudinary] Configured. Cloud name:', cloudinary.config().cloud_name || '(none)');
} catch (e) {
    console.warn('[Cloudinary] Configuration failed:', e.message);
}

// Use memory storage; upload buffer directly to Cloudinary
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 8 * 1024 * 1024,  // 8MB limit
        fieldSize: 10 * 1024 * 1024  // 10MB for total form data
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only JPEG and PNG images are allowed!'));
        }
    }
});


// Get all books with filtering and pagination
router.get('/', [
    optionalAuth,
    query('page').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    query('program').optional({ checkFalsy: true }).isString(),
    query('condition').optional({ checkFalsy: true }).isIn(['excellent', 'good', 'fair', 'poor']).withMessage('Invalid condition'),
    query('availability').optional({ checkFalsy: true }).isIn(['available', 'borrowed']).withMessage('Invalid availability'),
    query('sort').optional({ checkFalsy: true }).isString() // allow empty sort
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
        const offset = (page - 1) * limit;

        // Ensure valid numbers
        if (!Number.isInteger(limit) || limit <= 0) {
            return res.status(400).json({ error: 'Invalid limit parameter' });
        }
        if (!Number.isInteger(offset) || offset < 0) {
            return res.status(400).json({ error: 'Invalid page parameter' });
        }

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
        // Inject sanitized integers for LIMIT/OFFSET to avoid prepared statement argument issues
        const booksQuery = `
            SELECT
                b.*,
                CONCAT(u.fname, ' ', u.lname) as owner_name,
                u.email as owner_email,
                u.course as owner_program
            FROM books b
            JOIN users u ON b.owner_id = u.id
            ${whereClause}
            ORDER BY ${orderBy}
            LIMIT ${limit} OFFSET ${offset}
        `;
        const [books] = await connection.execute(booksQuery, queryParams);

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
                image_url: resolveImageUrl(book.cover_image)
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
// Search books (improved: multi-field + fuzzy)
router.get('/search', [
    optionalAuth,
    query('page').optional({ checkFalsy: true }).isInt({ min: 1 }),
    query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 50 }),
    query('query').optional({ checkFalsy: true }).isString(),
    query('program').optional({ checkFalsy: true }).isString(),
    query('condition').optional({ checkFalsy: true }).isIn(['excellent', 'good', 'fair', 'poor']),
    query('availability').optional({ checkFalsy: true }).isIn(['available', 'borrowed']),
    query('minCredits').optional({ checkFalsy: true }).isInt({ min: 0 }),
    query('maxCredits').optional({ checkFalsy: true }).isInt({ min: 0 }),
    query('sort').optional({ checkFalsy: true }).isString()
], async (req, res) => {
    try {
        const rawQuery = (req.query.query || '').trim();
        const likeQuery = `%${rawQuery}%`;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const offset = (page - 1) * limit;

        const { program, condition, availability, minCredits, maxCredits, sort } = req.query;

        const connection = await getConnection();
        // Build WHERE conditions (multi-field and fuzzy)
        const whereParts = [];
        const whereParams = [];

        if (rawQuery) {
            const searchParts = [
                'b.title LIKE ?',
                'b.author LIKE ?',
                'b.isbn LIKE ?',
                'b.description LIKE ?',
                'b.subject LIKE ?',
                'b.course_code LIKE ?',
                'u.course LIKE ?',
                "CONCAT(u.fname, ' ', u.lname) LIKE ?",
                'u.email LIKE ?'
            ];
            const searchParams = [likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery];

            // Basic phonetic fuzzy matching for typos (only if query has 3+ chars)
            if (rawQuery.length >= 3) {
                searchParts.push(
                    'SOUNDEX(b.title) = SOUNDEX(?)',
                    'SOUNDEX(b.author) = SOUNDEX(?)',
                    "SOUNDEX(CONCAT(u.fname, ' ', u.lname)) = SOUNDEX(?)",
                    'SOUNDEX(b.course_code) = SOUNDEX(?)',
                    'SOUNDEX(u.course) = SOUNDEX(?)'
                );
                searchParams.push(rawQuery, rawQuery, rawQuery, rawQuery, rawQuery);

                // Character-gap LIKE for typos (e.g., %a%b%c%) ignoring spaces
                const gapped = `%${rawQuery.replace(/\s+/g, '').split('').join('%')}%`;
                searchParts.push(
                    "REPLACE(b.title, ' ', '') LIKE ?",
                    "REPLACE(b.author, ' ', '') LIKE ?",
                    "REPLACE(CONCAT(u.fname, ' ', u.lname), ' ', '') LIKE ?",
                    "REPLACE(b.course_code, ' ', '') LIKE ?"
                );
                searchParams.push(gapped, gapped, gapped, gapped);
            }

            whereParts.push(`(${searchParts.join(' OR ')})`);
            whereParams.push(...searchParams);
        }

        if (program) {
            whereParts.push('u.course = ?');
            whereParams.push(program);
        }
        if (condition) {
            whereParts.push('b.condition_rating = ?');
            whereParams.push(condition);
        }
        if (availability) {
            whereParts.push(availability === 'available' ? 'b.is_available = TRUE' : 'b.is_available = FALSE');
        }
        if (minCredits) {
            whereParts.push('b.minimum_credits >= ?');
            whereParams.push(parseInt(minCredits));
        }
        if (maxCredits) {
            whereParts.push('b.minimum_credits <= ?');
            whereParams.push(parseInt(maxCredits));
        }

        const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

        // Relevance-based ordering when searching; otherwise, use selected sort
        let relevanceExpr = '0';
        let relevanceParams = [];
        if (rawQuery) {
            relevanceExpr = `
                (CASE WHEN b.title = ? THEN 12 ELSE 0 END) +
                (CASE WHEN b.author = ? THEN 10 ELSE 0 END) +
                (CASE WHEN b.course_code = ? THEN 9 ELSE 0 END) +
                (CASE WHEN u.course = ? THEN 8 ELSE 0 END) +
                (CASE WHEN CONCAT(u.fname, ' ', u.lname) = ? THEN 8 ELSE 0 END) +
                (CASE WHEN b.title LIKE ? THEN 6 ELSE 0 END) +
                (CASE WHEN b.author LIKE ? THEN 5 ELSE 0 END) +
                (CASE WHEN b.course_code LIKE ? THEN 5 ELSE 0 END) +
                (CASE WHEN u.course LIKE ? THEN 4 ELSE 0 END) +
                (CASE WHEN CONCAT(u.fname, ' ', u.lname) LIKE ? THEN 4 ELSE 0 END)`;
            relevanceParams = [
                rawQuery, rawQuery, rawQuery, rawQuery, rawQuery,
                likeQuery, likeQuery, likeQuery, likeQuery, likeQuery
            ];
            if (rawQuery.length >= 3) {
                // Add phonetic boosts
                relevanceExpr += `
                    + (CASE WHEN SOUNDEX(b.title) = SOUNDEX(?) THEN 3 ELSE 0 END)
                    + (CASE WHEN SOUNDEX(b.author) = SOUNDEX(?) THEN 2 ELSE 0 END)
                    + (CASE WHEN SOUNDEX(CONCAT(u.fname, ' ', u.lname)) = SOUNDEX(?) THEN 2 ELSE 0 END)
                    + (CASE WHEN SOUNDEX(b.course_code) = SOUNDEX(?) THEN 2 ELSE 0 END)
                    + (CASE WHEN SOUNDEX(u.course) = SOUNDEX(?) THEN 1 ELSE 0 END)`;
                relevanceParams.push(rawQuery, rawQuery, rawQuery, rawQuery, rawQuery);

                // Add character-gap LIKE boosts (ignoring spaces)
                const gappedBoost = `%${rawQuery.replace(/\s+/g, '').split('').join('%')}%`;
                relevanceExpr += `
                    + (CASE WHEN REPLACE(b.title, ' ', '') LIKE ? THEN 3 ELSE 0 END)
                    + (CASE WHEN REPLACE(b.author, ' ', '') LIKE ? THEN 2 ELSE 0 END)
                    + (CASE WHEN REPLACE(CONCAT(u.fname, ' ', u.lname), ' ', '') LIKE ? THEN 2 ELSE 0 END)`;
                relevanceParams.push(gappedBoost, gappedBoost, gappedBoost);
            }
        }

        let orderBy;
        if (rawQuery) {
            orderBy = 'relevance DESC, b.created_at DESC';
        } else {
            orderBy = 'b.created_at DESC';
            if (sort === 'title_asc') orderBy = 'b.title ASC';
            else if (sort === 'title_desc') orderBy = 'b.title DESC';
            else if (sort === 'credits_low') orderBy = 'b.minimum_credits ASC';
            else if (sort === 'credits_high') orderBy = 'b.minimum_credits DESC';
            else if (sort === 'oldest') orderBy = 'b.created_at ASC';
        }

        // Inline LIMIT/OFFSET to avoid statement argument mismatch (sanitized integers)
        const relevanceQuery = `
            SELECT
                b.*,
                CONCAT(u.fname, ' ', u.lname) AS owner_name,
                u.email AS owner_email,
                u.course AS owner_program,
                ${relevanceExpr} AS relevance
            FROM books b
            JOIN users u ON b.owner_id = u.id
            ${whereClause}
            ORDER BY ${orderBy}
            LIMIT ${limit} OFFSET ${offset}
        `;
        const [books] = await connection.execute(relevanceQuery, [...relevanceParams, ...whereParams]);

        const [countResult] = await connection.execute(`
            SELECT COUNT(*) AS total
            FROM books b
            JOIN users u ON b.owner_id = u.id
            ${whereClause}
        `, whereParams);

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
            query: rawQuery
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
        const limitRaw = parseInt(req.query.limit, 10);
        const safeLimit = Math.max(1, Math.min(Number.isInteger(limitRaw) ? limitRaw : 8, 50));

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

        // Inline sanitized limit
        query += ` ORDER BY relevance_score DESC, b.created_at DESC LIMIT ${safeLimit}`;

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
                image_url: resolveImageUrl(book.cover_image)
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
                image_url: resolveImageUrl(book.cover_image)
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
        const limitNum = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 10, 50));
        const conn = await getConnection();

                const recentlyViewedQuery = `SELECT b.*, rv.viewed_at,
                            CONCAT(u.fname, ' ', u.lname) as owner_name,
                            u.email as owner_email,
                            u.course as owner_program
             FROM recently_viewed rv
             INNER JOIN books b ON rv.book_id = b.id
             INNER JOIN users u ON b.owner_id = u.id
             WHERE rv.user_id = ?
             ORDER BY rv.viewed_at DESC
             LIMIT ${limitNum}`;
                const [books] = await conn.execute(recentlyViewedQuery, [req.user.id]);

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
        res.json({ book: { ...book, image_url: resolveImageUrl(book.cover_image) } });

    } catch (error) {
        console.error('Get book error:', error);
        res.status(500).json({ error: 'Failed to fetch book' });
    }
});

// Add new book (with optional image upload)
router.post('/',
    authenticateToken,
    (req, res, next) => {
        upload.single('image')(req, res, (err) => {
            if (err) {
                console.error('Multer error:', err);

                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        error: 'Image file is too large. Maximum size is 8MB.',
                        details: [{ msg: 'Image file is too large. Maximum size is 8MB.' }]
                    });
                } else if (err.message) {
                    return res.status(400).json({
                        error: err.message,
                        details: [{ msg: err.message }]
                    });
                }

                return res.status(400).json({
                    error: 'File upload error',
                    details: [{ msg: err.message || 'Unknown file upload error' }]
                });
            }
            next();
        });
    },
    [
        body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
        body('author').trim().isLength({ min: 1 }).withMessage('Author is required'),
        body('course_code').trim().notEmpty().withMessage('Course code is required'),
        body('condition').isIn(['excellent', 'good', 'fair', 'poor']).withMessage('Invalid condition'),
        body('minimum_credits').optional().isInt({ min: 50, max: 500 }).withMessage('Minimum credits must be between 50-500')
    ],
    async (req, res) => {
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

            // Upload to Cloudinary if image provided (memory storage)
            let coverUrl = null;
            if (req.file) {
                try {
                    const uploadResult = await new Promise((resolve, reject) => {
                        const stream = cloudinary.uploader.upload_stream({ folder: 'librowse/books' }, (err, result) => {
                            if (err) return reject(err);
                            resolve(result);
                        });
                        stream.end(req.file.buffer);
                    });
                    coverUrl = uploadResult.secure_url;
                } catch (e) {
                    console.error('Cloudinary upload failed (create book):', e.message);
                }
            }

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
                coverUrl
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
            res.status(201).json({ message: 'Book added successfully', book: { ...book, image_url: resolveImageUrl(book.cover_image) } });

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
    }
);


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

        res.json({ message: 'Book updated successfully', book: { ...updatedBooks[0], image_url: resolveImageUrl(updatedBooks[0].cover_image) } });

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
        console.log('[Book Image Upload] Incoming request for book ID:', req.params.id);
        if (!req.file) {
            console.log('[Book Image Upload] No file provided');
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
            return res.status(404).json({ error: 'Book not found or access denied' });
        }

        const book = books[0];
        // If previous was local path (non-URL) attempt best-effort cleanup
        if (book.cover_image && !/^https?:\/\//.test(book.cover_image)) {
            try { await fs.unlink(book.cover_image); } catch (_) { }
        }

        // Upload buffer to Cloudinary
        console.log('[Book Image Upload] Uploading to Cloudinary. Size:', req.file.size);
        const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream({ folder: 'librowse/books' }, (err, result) => {
                if (err) return reject(err);
                resolve(result);
            });
            stream.end(req.file.buffer);
        });
        console.log('[Book Image Upload] Cloudinary upload complete. Public ID:', uploadResult.public_id);

        await connection.execute('UPDATE books SET cover_image = ? WHERE id = ?', [uploadResult.secure_url, bookId]);
        connection.release();

        res.json({ message: 'Image uploaded successfully', image_url: uploadResult.secure_url });

    } catch (error) {
        console.error('Upload image error:', error);
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
