// LiBrowse - Presentation Server (No Database Required)
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve main application
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Mock API endpoint for stats (returns placeholder data)
app.get('/api/stats/platform', (req, res) => {
    res.json({
        success: true,
        data: {
            totalUsers: 150,
            totalBooks: 320,
            totalTransactions: 245,
            averageRating: 4.7
        }
    });
});

// Mock health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'LiBrowse Presentation API'
    });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        error: 'API endpoint not implemented yet',
        message: 'This is a presentation version. Full API coming soon!'
    });
});

// 404 handler for all other routes
app.use('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║                                              ║');
    console.log('║     🚀 LiBrowse Presentation Server 🚀      ║');
    console.log('║                                              ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
    console.log(`📚 Server running at: http://localhost:${PORT}`);
    console.log(`🎨 Mode: Presentation (No database required)`);
    console.log('');
    console.log('✅ Landing page ready');
    console.log('✅ Login modal ready');
    console.log('✅ Registration modal ready');
    console.log('✅ Mobile responsive');
    console.log('');
    console.log('Press Ctrl+C to stop the server');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down LiBrowse presentation server...');
    process.exit(0);
});
