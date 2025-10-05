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
    query('availability').optional().isIn(['available', 'borrowed']).withMessage('Invalid availability')
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
            whereConditions.push('u.program = ?');
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

        // Get books with owner information
        const [books] = await connection.execute(`
            SELECT 
                b.*,
                CONCAT(u.first_name, ' ', u.last_name) as owner_name,
                u.email as owner_email,
                u.program as owner_program
            FROM books b
            JOIN users u ON b.owner_id = u.id
            ${whereClause}
            ORDER BY b.created_at DESC
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

// Search books
router.get('/search', [
    optionalAuth,
    query('query').notEmpty().withMessage('Search query is required'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const searchQuery = req.query.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const offset = (page - 1) * limit;

        const connection = await getConnection();

        // Build search conditions
        const searchConditions = [
            'b.title LIKE ?',
            'b.author LIKE ?',
            'b.course_code LIKE ?',
            'b.description LIKE ?'
        ];

        const searchParams = Array(4).fill(`%${searchQuery}%`);

        let whereClause = `WHERE (${searchConditions.join(' OR ')})`;
        let queryParams = [...searchParams];

        // Add filters
        if (req.query.program) {
            whereClause += ' AND u.program = ?';
            queryParams.push(req.query.program);
        }

        if (req.query.condition) {
            whereClause += ' AND b.condition_rating = ?';
            queryParams.push(req.query.condition);
        }

        // Get search results
        const [books] = await connection.execute(`
            SELECT 
                b.*,
                CONCAT(u.first_name, ' ', u.last_name) as owner_name,
                u.email as owner_email,
                u.program as owner_program
            FROM books b
            JOIN users u ON b.owner_id = u.id
            ${whereClause}
            ORDER BY 
                CASE 
                    WHEN b.title LIKE ? THEN 1
                    WHEN b.author LIKE ? THEN 2
                    WHEN b.course_code LIKE ? THEN 3
                    ELSE 4
                END,
                b.created_at DESC
            LIMIT ? OFFSET ?
        `, [...queryParams, `%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`, limit, offset]);

        // Get total count
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
                image_url: book.cover_image ? `/uploads/books/${path.basename(book.cover_image)}` : null
            })),
            pagination: {
                page,
                limit,
                total,
                hasMore,
                totalPages: Math.ceil(total / limit)
            },
            query: searchQuery
        });

    } catch (error) {
        console.error('Search books error:', error);
        res.status(500).json({ error: 'Search failed' });
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
                CONCAT(u.first_name, ' ', u.last_name) as owner_name,
                u.email as owner_email,
                u.program as owner_program,
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

// Add new book
router.post('/', [
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

        const {
            title,
            author,
            isbn,
            edition,
            course_code,
            subject,
            condition,
            minimum_credits = 100,
            description
        } = req.body;

        const connection = await getConnection();

        const [result] = await connection.execute(`
            INSERT INTO books (
                title, author, isbn, course_code, subject, edition, 
                condition_rating, description, owner_id, is_available, minimum_credits, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, NOW())
        `, [
            title, author, isbn || null, course_code, (subject && subject.trim()) ? subject : 'General', edition || null,
            condition, description || null, req.user.id, minimum_credits
        ]);

        // Get the created book
        const [books] = await connection.execute(`
            SELECT 
                b.*,
                CONCAT(u.first_name, ' ', u.last_name) as owner_name
            FROM books b
            JOIN users u ON b.owner_id = u.id
            WHERE b.id = ?
        `, [result.insertId]);

        connection.release();

        res.status(201).json({
            message: 'Book added successfully',
            book: books[0]
        });

    } catch (error) {
        console.error('Add book error:', error);
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
                CONCAT(u.first_name, ' ', u.last_name) as owner_name
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

// Update book
router.put('/:id', [
    authenticateToken,
    body('title').optional().trim().isLength({ min: 1 }).withMessage('Title cannot be empty'),
    body('author').optional().trim().isLength({ min: 1 }).withMessage('Author cannot be empty'),
    body('subject').optional().isString(),
    body('publisher').optional().isString(),
    body('publication_year').optional().isInt({ min: 1500, max: 3000 }),
    body('condition').optional().isIn(['excellent', 'good', 'fair', 'poor']).withMessage('Invalid condition'),
    body('min_credit').optional().isInt({ min: 0 }).withMessage('Minimum credit must be a non-negative integer'),
    body('is_available').optional().isBoolean()
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

        // Build update query
        const updateFields = [];
        const updateValues = [];

        const allowedFields = [
            'title', 'author', 'isbn', 'edition', 'course_code', 'subject',
            'publisher', 'publication_year', 'condition_rating', 'minimum_credits',
            'description', 'is_available'
        ];
        
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updateFields.push(`${field} = ?`);
                updateValues.push(req.body[field]);
            }
        });

        if (updateFields.length === 0) {
            connection.release();
            return res.status(400).json({ error: 'No fields to update' });
        }

        updateFields.push('updated_at = NOW()');
        updateValues.push(bookId);

        await connection.execute(
            `UPDATE books SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
        );

        // Get updated book
        const [updatedBooks] = await connection.execute(`
            SELECT 
                b.*,
                CONCAT(u.first_name, ' ', u.last_name) as owner_name
            FROM books b
            JOIN users u ON b.owner_id = u.id
            WHERE b.id = ?
        `, [bookId]);

        await connection.end();

        res.json({
            message: 'Book updated successfully',
            book: updatedBooks[0]
        });

    } catch (error) {
        console.error('Update book error:', error);
        res.status(500).json({ error: 'Failed to update book' });
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
