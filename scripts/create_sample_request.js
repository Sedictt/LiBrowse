// Create sample borrow request for Maria Santos
require('dotenv').config();
const mysql = require('mysql2/promise');

async function createSampleRequest() {
    let connection;
    
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'plv_book_exchange_dev2'
        });

        console.log('✅ Connected to database');

        // Get Maria Santos (borrower) and find a book to borrow
        const [users] = await connection.execute(`
            SELECT id, first_name, last_name, email, credits 
            FROM users 
            WHERE email = 'maria.santos@plv.edu.ph'
        `);

        if (users.length === 0) {
            console.log('❌ Maria Santos not found');
            return;
        }

        const maria = users[0];
        console.log(`📋 Found Maria Santos (ID: ${maria.id}, Credits: ${maria.credits})`);

        // Find a book that Maria doesn't own
        const [books] = await connection.execute(`
            SELECT b.*, CONCAT(u.first_name, ' ', u.last_name) as owner_name
            FROM books b
            JOIN users u ON b.owner_id = u.id
            WHERE b.owner_id != ? AND b.is_available = TRUE
            LIMIT 1
        `, [maria.id]);

        if (books.length === 0) {
            console.log('❌ No available books found for Maria to borrow');
            return;
        }

        const book = books[0];
        console.log(`📚 Found book: "${book.title}" by ${book.author} (Owner: ${book.owner_name})`);
        console.log(`💰 Required credits: ${book.minimum_credits}, Maria has: ${maria.credits}`);

        // Check if Maria has enough credits
        if (maria.credits < book.minimum_credits) {
            console.log('❌ Maria doesn\'t have enough credits for this book');
            return;
        }

        // Create the borrow request
        const requestData = {
            book_id: book.id,
            borrower_id: maria.id,
            lender_id: book.owner_id,
            request_message: "Hi! I need this book for my accounting class this semester. I'll take excellent care of it and return it on time. Thank you!",
            borrower_contact: "09123456789",
            borrower_address: "123 Main St, Pasay City",
            pickup_method: "meetup",
            pickup_location: "PLV Library - Main Campus",
            preferred_pickup_time: "2024-12-27 14:00:00",
            borrow_duration: "2-weeks",
            expected_return_date: "2025-01-10"
        };

        // Check if request already exists
        const [existingRequests] = await connection.execute(`
            SELECT id FROM transactions 
            WHERE book_id = ? AND borrower_id = ? AND status IN ('pending', 'approved')
        `, [book.id, maria.id]);

        if (existingRequests.length > 0) {
            console.log('⚠️ Maria already has a pending/approved request for this book');
            return;
        }

        // Insert the request
        const [result] = await connection.execute(`
            INSERT INTO transactions (
                book_id, borrower_id, lender_id, status, request_message,
                borrower_contact, borrower_address, pickup_method, pickup_location,
                preferred_pickup_time, borrow_duration, expected_return_date, request_date
            ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            requestData.book_id, requestData.borrower_id, requestData.lender_id,
            requestData.request_message, requestData.borrower_contact, requestData.borrower_address,
            requestData.pickup_method, requestData.pickup_location, requestData.preferred_pickup_time,
            requestData.borrow_duration, requestData.expected_return_date
        ]);

        // Mark book as temporarily unavailable
        await connection.execute('UPDATE books SET is_available = FALSE WHERE id = ?', [book.id]);

        // Create notification for the lender
        await connection.execute(`
            INSERT INTO notifications (user_id, type, title, message, related_id, created_at)
            VALUES (?, 'transaction', 'New Borrow Request', ?, ?, NOW())
        `, [
            book.owner_id,
            `${maria.first_name} ${maria.last_name} wants to borrow "${book.title}"`,
            result.insertId
        ]);

        console.log('✅ Sample borrow request created successfully!');
        console.log(`📋 Request ID: ${result.insertId}`);
        console.log(`📚 Book: "${book.title}"`);
        console.log(`👤 Borrower: ${maria.first_name} ${maria.last_name}`);
        console.log(`👤 Lender: ${book.owner_name}`);
        console.log(`📍 Pickup: ${requestData.pickup_location}`);
        console.log(`⏰ Preferred time: ${requestData.preferred_pickup_time}`);
        console.log(`📅 Duration: ${requestData.borrow_duration}`);

    } catch (error) {
        console.error('❌ Failed to create sample request:', error.message);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Database connection closed');
        }
    }
}

createSampleRequest().then(() => {
    console.log('🎉 Sample request creation completed');
    process.exit(0);
});
