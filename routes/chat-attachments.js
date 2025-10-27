const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const THUMBNAIL_SIZE = { width: 200, height: 200 };
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'chat-attachments');
const THUMBNAIL_DIR = path.join(__dirname, '..', 'uploads', 'chat-thumbnails');

// Ensure upload directories exist
(async () => {
    try {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        await fs.mkdir(THUMBNAIL_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating upload directories:', error);
    }
})();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `attachment-${uniqueSuffix}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Validate MIME type
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 5 // Max 5 files per request
    },
    fileFilter: fileFilter
});

// Strip EXIF data and create thumbnail
async function processImage(filePath, filename) {
    try {
        const image = sharp(filePath);
        const metadata = await image.metadata();

        // Strip EXIF data by re-encoding
        await image.rotate().toFile(filePath + '.tmp');
        await fs.rename(filePath + '.tmp', filePath);

        // Create thumbnail
        const thumbnailPath = path.join(THUMBNAIL_DIR, filename);
        await sharp(filePath)
            .resize(THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height, { fit: 'inside' })
            .toFile(thumbnailPath);

        return {
            width: metadata.width,
            height: metadata.height,
            thumbnailPath
        };
    } catch (error) {
        console.error('Error processing image:', error);
        throw error;
    }
}

// Upload attachment endpoint
router.post('/upload', authenticateToken, upload.array('attachments', 5), async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        const { chatId, messageId } = req.body;
        const userId = req.user.id;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        if (!chatId || !messageId) {
            // Clean up uploaded files
            for (const file of files) {
                await fs.unlink(file.path).catch(() => {});
            }
            return res.status(400).json({ error: 'Chat ID and Message ID are required' });
        }

        // Verify user is part of the chat
        const [chat] = await connection.query(`
            SELECT c.*, t.borrower_id, t.lender_id
            FROM chats c
            JOIN transactions t ON c.transaction_id = t.id
            WHERE c.id = ?
        `, [chatId]);

        if (chat.length === 0) {
            for (const file of files) {
                await fs.unlink(file.path).catch(() => {});
            }
            return res.status(404).json({ error: 'Chat not found' });
        }

        if (chat[0].borrower_id !== userId && chat[0].lender_id !== userId) {
            for (const file of files) {
                await fs.unlink(file.path).catch(() => {});
            }
            return res.status(403).json({ error: 'Access denied' });
        }

        // Verify message exists and belongs to user
        const [message] = await connection.query(
            'SELECT * FROM chat_messages WHERE id = ? AND chat_id = ? AND sender_id = ?',
            [messageId, chatId, userId]
        );

        if (message.length === 0) {
            for (const file of files) {
                await fs.unlink(file.path).catch(() => {});
            }
            return res.status(404).json({ error: 'Message not found or access denied' });
        }

        await connection.beginTransaction();

        const attachments = [];

        // Process each file
        for (const file of files) {
            try {
                // Process image (strip EXIF, create thumbnail)
                const { width, height, thumbnailPath } = await processImage(file.path, file.filename);

                // Store in database
                const [result] = await connection.query(`
                    INSERT INTO chat_attachments 
                    (message_id, file_type, file_path, thumbnail_path, original_filename, 
                     file_size, mime_type, width, height)
                    VALUES (?, 'image', ?, ?, ?, ?, ?, ?, ?)
                `, [
                    messageId,
                    file.path,
                    thumbnailPath,
                    file.originalname,
                    file.size,
                    file.mimetype,
                    width,
                    height
                ]);

                attachments.push({
                    id: result.insertId,
                    filename: file.originalname,
                    size: file.size,
                    mimeType: file.mimetype,
                    width,
                    height
                });
            } catch (error) {
                console.error('Error processing file:', file.originalname, error);
                // Clean up file on error
                await fs.unlink(file.path).catch(() => {});
                if (error.thumbnailPath) {
                    await fs.unlink(error.thumbnailPath).catch(() => {});
                }
            }
        }

        await connection.commit();

        res.status(201).json({
            success: true,
            attachments,
            message: `${attachments.length} file(s) uploaded successfully`
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error uploading attachments:', error);
        
        // Clean up files on error
        if (req.files) {
            for (const file of req.files) {
                await fs.unlink(file.path).catch(() => {});
            }
        }

        res.status(500).json({ error: 'Failed to upload attachments' });
    } finally {
        connection.release();
    }
});

// Get attachment metadata
router.get('/:attachmentId', authenticateToken, async (req, res) => {
    try {
        const { attachmentId } = req.params;
        const userId = req.user.id;

        // Get attachment with access verification
        const [attachment] = await db.pool.execute(`
            SELECT ca.*, cm.sender_id, c.transaction_id, t.borrower_id, t.lender_id
            FROM chat_attachments ca
            JOIN chat_messages cm ON ca.message_id = cm.id
            JOIN chats c ON cm.chat_id = c.id
            JOIN transactions t ON c.transaction_id = t.id
            WHERE ca.id = ?
        `, [attachmentId]);

        if (attachment.length === 0) {
            return res.status(404).json({ error: 'Attachment not found' });
        }

        // Verify access
        if (attachment[0].borrower_id !== userId && attachment[0].lender_id !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ attachment: attachment[0] });

    } catch (error) {
        console.error('Error fetching attachment:', error);
        res.status(500).json({ error: 'Failed to fetch attachment' });
    }
});

// Serve attachment file
router.get('/:attachmentId/file', async (req, res) => {
    try {
        const { attachmentId } = req.params;
        const { thumbnail, token } = req.query;
        
        // Try to authenticate from header or query parameter
        let userId;
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            // Standard header authentication
            const headerToken = authHeader.substring(7);
            try {
                const decoded = jwt.verify(headerToken, process.env.JWT_SECRET || 'librowse-secret-key-2024');
                userId = decoded.id;
            } catch (err) {
                console.error('Token verification failed (header):', err.message);
                return res.status(401).json({ error: 'Invalid token' });
            }
        } else if (token) {
            // Query parameter authentication (for img tags)
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'librowse-secret-key-2024');
                userId = decoded.id;
            } catch (err) {
                console.error('Token verification failed (query):', err.message);
                return res.status(401).json({ error: 'Invalid token' });
            }
        } else {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const [attachment] = await db.pool.execute(`
            SELECT ca.*, cm.sender_id, c.transaction_id, t.borrower_id, t.lender_id
            FROM chat_attachments ca
            JOIN chat_messages cm ON ca.message_id = cm.id
            JOIN chats c ON cm.chat_id = c.id
            JOIN transactions t ON c.transaction_id = t.id
            WHERE ca.id = ?
        `, [attachmentId]);

        if (attachment.length === 0) {
            return res.status(404).json({ error: 'Attachment not found' });
        }

        if (attachment[0].borrower_id !== userId && attachment[0].lender_id !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        let filePath = thumbnail === 'true' ? attachment[0].thumbnail_path : attachment[0].file_path;

        // Resolve to absolute path if needed
        if (!path.isAbsolute(filePath)) {
            filePath = path.join(__dirname, '..', filePath);
        }

        // Ensure file exists
        try {
            await fs.stat(filePath);
        } catch (fsErr) {
            console.error('Attachment file not found on disk:', filePath, fsErr.message);
            return res.status(404).json({ error: 'File not found' });
        }

        // Set mime type if available
        if (attachment[0].mime_type) {
            res.type(attachment[0].mime_type);
        }

        // Serve file with error callback
        res.sendFile(filePath, (err) => {
            if (err) {
                console.error('sendFile error:', filePath, err);
                if (!res.headersSent) {
                    res.status(err.status || 500).json({ error: 'Failed to serve file' });
                }
            }
        });

    } catch (error) {
        console.error('Error serving attachment file:', error);
        res.status(500).json({ error: 'Failed to serve file' });
    }
});

// Delete attachment (only sender can delete)
router.delete('/:attachmentId', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const { attachmentId } = req.params;
        const userId = req.user.id;

        await connection.beginTransaction();

        // Get attachment and verify ownership
        const [attachment] = await connection.query(`
            SELECT ca.*, cm.sender_id
            FROM chat_attachments ca
            JOIN chat_messages cm ON ca.message_id = cm.id
            WHERE ca.id = ?
        `, [attachmentId]);

        if (attachment.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Attachment not found' });
        }

        if (attachment[0].sender_id !== userId) {
            await connection.rollback();
            return res.status(403).json({ error: 'Only the sender can delete attachments' });
        }

        // Delete from database
        await connection.query('DELETE FROM chat_attachments WHERE id = ?', [attachmentId]);

        await connection.commit();

        // Delete files from filesystem
        await fs.unlink(attachment[0].file_path).catch(err => 
            console.error('Error deleting file:', err)
        );
        if (attachment[0].thumbnail_path) {
            await fs.unlink(attachment[0].thumbnail_path).catch(err =>
                console.error('Error deleting thumbnail:', err)
            );
        }

        res.json({ success: true, message: 'Attachment deleted successfully' });

    } catch (error) {
        await connection.rollback();
        console.error('Error deleting attachment:', error);
        res.status(500).json({ error: 'Failed to delete attachment' });
    } finally {
        connection.release();
    }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Too many files. Maximum 5 files per upload' });
        }
        return res.status(400).json({ error: error.message });
    }
    next(error);
});

module.exports = router;
