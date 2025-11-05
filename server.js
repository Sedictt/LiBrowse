// server.js
// Main entry point for LiBrowse backend
// Restructured but keeps the same behavior, names, and functions

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Database connection
const { testConnection } = require('./config/database');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize HTTP server for Socket.IO
const http = require('http');
const server = http.createServer(app);

// Initialize Socket.IO
const socketIO = require('socket.io');
const io = socketIO(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' ? 'your-domain.com' : '*',
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Initialize chat socket handlers
const chatHandler = require('./socket/chatHandler');
chatHandler(io);

// Make io available to routes
app.set('socketio', io);

// =======================
// Security Middleware
// =======================
app.use(helmet({
    contentSecurityPolicy: false, // disabled for dev
}));

// =======================
// Rate Limiting
// =======================
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 1000,
    message: 'Too many requests from this IP, try again later.',
    skip: (req) => {
        // Allow more requests for dev on static + healthcheck
        if (process.env.NODE_ENV !== 'production') {
            return req.path === '/api/health' ||
                req.path.startsWith('/uploads/') ||
                req.path.startsWith('/css/') ||
                req.path.startsWith('/js/');
        }
        return false;
    }
});
app.use(limiter);

// =======================
// CORS Configuration
// =======================
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? 'your-domain.com'
        : '*',
    credentials: true
}));

// =======================
// Body Parsing
// =======================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =======================
// Static Files
// =======================
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =======================
// Routes
// =======================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/books', require('./routes/books'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/disputes', require('./routes/disputes'));
app.use('/api/chats', require('./routes/chats-new')); // Updated to use new chat system
app.use('/api/chat-attachments', require('./routes/chat-attachments')); // Image attachment feature
app.use('/api/reports', require('./routes/reports')); // Automated reporting system
app.use('/api/cancellations', require('./routes/cancellations')); // Transaction cancellation
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/verification', require('./routes/verification'));
app.use('/api/verification', require('./routes/emailVerification'));
app.use('/api/verification', require('./routes/sendgridVerification'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/config', require('./routes/config'));

// =======================
// Main App Route
// =======================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'LiBrowse API'
    });
});

// 404 Handler for API
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// 404 Handler for SPA (frontend)
app.use('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =======================
// Global Error Handler
// =======================
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : error.message
    });
});

// =======================
// Start Server
// =======================
const startServer = async () => {
    try {
        const dbConnected = await testConnection();
        if (!dbConnected) {
            console.error('❌ Database connection failed. Check config.');
            process.exit(1);
        }

        server.listen(PORT, () => {
            console.log(`🚀 LiBrowse Server running on port ${PORT}`);
            console.log(`📚 Access at: http://localhost:${PORT}`);
            console.log(`📡 Socket.IO enabled for real-time chat`);
            console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    } catch (err) {
        console.error('❌ Failed to start server:', err);
        process.exit(1);
    }
};

// Schedule reminder task to run daily at 8 AM
const cron = require('node-cron');
const ReminderTask = require('./tasks/reminderTask');

// Run every day at 8:00 AM
cron.schedule('0 8 * * *', () => {
    console.log('[Scheduler] Running daily reminder task...');
    ReminderTask.checkDueDates().catch(err => {
        console.error('[Scheduler] Reminder task failed:', err.message);
    });
});

// Also run once on startup after 5 seconds (only if DB is connected)
setTimeout(() => {
    console.log('[Scheduler] Running initial reminder check...');
    ReminderTask.checkDueDates().catch(err => {
        console.error('[Scheduler] Initial reminder check failed:', err.message);
    });
}, 5000);


startServer();

module.exports = app;
