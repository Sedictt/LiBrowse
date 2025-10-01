// Test database tables
require('dotenv').config();
const mysql = require('mysql2/promise');

async function testDatabase() {
    let connection;
    
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'plv_book_exchange_dev2'
        });

        console.log('✅ Connected to database');

        // Check if chats table exists
        const [tables] = await connection.execute(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('chats', 'chat_messages', 'chat_reports')
        `, [process.env.DB_NAME || 'plv_book_exchange_dev2']);

        console.log('📋 Chat-related tables found:');
        tables.forEach(table => console.log(`  - ${table.TABLE_NAME}`));

        if (tables.length === 0) {
            console.log('❌ No chat tables found. Creating them...');
            
            // Create chats table
            await connection.execute(`
                CREATE TABLE IF NOT EXISTS chats (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    transaction_id INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT TRUE,
                    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
                )
            `);
            
            // Create chat_messages table
            await connection.execute(`
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    chat_id INT NOT NULL,
                    sender_id INT NOT NULL,
                    message TEXT NOT NULL,
                    message_type ENUM('text', 'system', 'image') DEFAULT 'text',
                    is_read BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
                    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
            
            // Create chat_reports table
            await connection.execute(`
                CREATE TABLE IF NOT EXISTS chat_reports (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    chat_id INT NOT NULL,
                    reporter_id INT NOT NULL,
                    reported_user_id INT NOT NULL,
                    message_id INT,
                    reason ENUM('spam', 'harassment', 'inappropriate_content', 'scam', 'other') NOT NULL,
                    description TEXT,
                    status ENUM('pending', 'reviewed', 'resolved', 'dismissed') DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    reviewed_at TIMESTAMP NULL,
                    reviewed_by INT NULL,
                    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
                    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE SET NULL,
                    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
                )
            `);
            
            console.log('✅ Chat tables created successfully!');
        } else {
            console.log('✅ Chat tables already exist');
        }

        // Test a simple query
        const [chats] = await connection.execute('SELECT COUNT(*) as count FROM chats');
        console.log(`📊 Current chats count: ${chats[0].count}`);

    } catch (error) {
        console.error('❌ Database test failed:', error.message);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Database connection closed');
        }
    }
}

testDatabase().then(() => {
    console.log('🎉 Database test completed');
    process.exit(0);
});
