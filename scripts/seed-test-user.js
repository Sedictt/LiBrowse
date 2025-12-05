// Seed script for a comprehensive test user with samples for all tabs
// Run with: node scripts/seed-test-user.js

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'plv_book_exchange',
    port: process.env.DB_PORT || 3306
};

// Test User Data
const testUser = {
    email: 'testuser@plv.edu.ph',
    student_no: '21-9999',
    fname: 'Test',
    lname: 'User',
    password: 'TestUser123!',
    course: 'BSIT',
    year: 4,
    phone_no: '09999999999',
    credits: 500
};

// Counterpart Users
const counterparts = [
    {
        email: 'lender@plv.edu.ph',
        student_no: '21-8888',
        fname: 'Lender',
        lname: 'Guy',
        password: 'password123',
        course: 'BSA',
        year: 3,
        phone_no: '09888888888'
    },
    {
        email: 'borrower@plv.edu.ph',
        student_no: '21-7777',
        fname: 'Borrower',
        lname: 'Gal',
        password: 'password123',
        course: 'BSED',
        year: 2,
        phone_no: '09777777777'
    }
];

async function seedTestUser() {
    let connection;

    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database successfully');

        // 1. Create/Get Users
        console.log('Setting up users...');
        const testUserHash = await bcrypt.hash(testUser.password, 10);
        const otherUserHash = await bcrypt.hash('password123', 10);

        async function upsertUser(user, hash) {
            // Check email
            const [byEmail] = await connection.execute('SELECT id FROM users WHERE email = ?', [user.email]);
            if (byEmail.length > 0) return byEmail[0].id;

            // Check student_no
            const [byStudent] = await connection.execute('SELECT id FROM users WHERE student_no = ?', [user.student_no]);
            if (byStudent.length > 0) return byStudent[0].id;

            // Insert
            await connection.execute(`
                INSERT INTO users (
                    email, student_no, fname, lname, pass_hash, course, year, 
                    phone_no, is_verified, verification_status, credits, created
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, 'verified', ?, NOW())
            `, [
                user.email, user.student_no, user.fname, user.lname, hash,
                user.course, user.year, user.phone_no, user.credits || 100
            ]);

            const [rows] = await connection.execute('SELECT id FROM users WHERE email = ?', [user.email]);
            return rows[0].id;
        }

        const testUserId = await upsertUser(testUser, testUserHash);
        const lenderId = await upsertUser(counterparts[0], otherUserHash);
        const borrowerId = await upsertUser(counterparts[1], otherUserHash);

        console.log(`Test User ID: ${testUserId}`);

        // 2. Create Books
        console.log('Creating books...');
        // We need plenty of books for all scenarios
        const booksData = [
            // Owned by Test User
            { title: 'TU Book 1 (Incoming Pending)', owner_id: testUserId },
            { title: 'TU Book 2 (Active Approved)', owner_id: testUserId },
            { title: 'TU Book 3 (Active Borrowed)', owner_id: testUserId },
            { title: 'TU Book 4 (Returned Pending Feedback)', owner_id: testUserId },
            { title: 'TU Book 5 (Completed)', owner_id: testUserId },

            // Owned by Lender (for Test User to borrow)
            { title: 'Lender Book 1 (Outgoing Pending)', owner_id: lenderId },
            { title: 'Lender Book 2 (Outgoing Rejected)', owner_id: lenderId },
            { title: 'Lender Book 3 (Active Approved)', owner_id: lenderId },
            { title: 'Lender Book 4 (Active Borrowed)', owner_id: lenderId },
            { title: 'Lender Book 5 (Returned Pending Feedback)', owner_id: lenderId },
            { title: 'Lender Book 6 (Overdue)', owner_id: lenderId },
        ];

        const bookIds = [];
        for (const book of booksData) {
            await connection.execute(`
                INSERT INTO books (
                    title, author, isbn, course_code, subject, edition, publisher,
                    publication_year, condition_rating, description, owner_id, 
                    is_available, minimum_credits, created_at
                ) VALUES (?, 'Author Name', '123-4567890123', 'CS101', 'Test Subject', '1st', 'Test Pub',
                    2020, 'excellent', 'Test Description', ?, TRUE, 50, NOW())
            `, [book.title, book.owner_id]);
            const [rows] = await connection.execute('SELECT LAST_INSERT_ID() as id');
            bookIds.push(rows[0].id);
        }

        // 3. Create Transactions
        console.log('Creating transactions...');

        // Helper to insert transaction
        async function createTxn(data) {
            const keys = Object.keys(data);
            const values = Object.values(data);
            const placeholders = keys.map(() => '?').join(',');
            const sql = `INSERT INTO transactions (${keys.join(',')}) VALUES (${placeholders})`;
            await connection.execute(sql, values);
            const [rows] = await connection.execute('SELECT LAST_INSERT_ID() as id');
            return rows[0].id;
        }

        // 1. Incoming Request (Pending) - Borrower requests from Test User
        await createTxn({
            book_id: bookIds[0], borrower_id: borrowerId, lender_id: testUserId,
            status: 'pending', request_message: 'Can I borrow this?',
            pickup_method: 'meetup', pickup_location: 'Canteen',
            borrow_duration: '1-week', request_date: new Date()
        });

        // 2. Outgoing Request (Pending) - Test User requests from Lender
        await createTxn({
            book_id: bookIds[5], borrower_id: testUserId, lender_id: lenderId,
            status: 'pending', request_message: 'I need this for my thesis',
            pickup_method: 'pickup', pickup_location: 'Library',
            borrow_duration: '2-weeks', request_date: new Date()
        });

        // 3. Outgoing Request (Rejected) - Test User requested, Lender rejected
        await createTxn({
            book_id: bookIds[6], borrower_id: testUserId, lender_id: lenderId,
            status: 'rejected', request_message: 'Pls?', rejection_reason: 'Not available anymore',
            pickup_method: 'meetup', pickup_location: 'Gate 1',
            borrow_duration: '1-week', request_date: new Date(Date.now() - 86400000)
        });

        // 4. Active (Approved - Incoming) - Test User approved Borrower's request
        const txn4Id = await createTxn({
            book_id: bookIds[1], borrower_id: borrowerId, lender_id: testUserId,
            status: 'approved', request_message: 'Approved this one',
            pickup_method: 'meetup', pickup_location: 'Main Lobby',
            borrow_duration: '1-week', request_date: new Date(Date.now() - 172800000),
            approved_date: new Date(Date.now() - 86400000),
            expected_return_date: new Date(Date.now() + 604800000)
        });
        // Create chat for this one
        await connection.execute('INSERT INTO chats (transaction_id, created) VALUES (?, NOW())', [txn4Id]);
        const [c1] = await connection.execute('SELECT LAST_INSERT_ID() as id');
        await connection.execute("INSERT INTO chat_messages (chat_id, sender_id, message, created) VALUES (?, ?, 'When can we meet?', NOW())", [c1[0].id, borrowerId]);

        // 5. Active (Approved - Outgoing) - Lender approved Test User's request
        await createTxn({
            book_id: bookIds[7], borrower_id: testUserId, lender_id: lenderId,
            status: 'approved', request_message: 'Thanks for approving',
            pickup_method: 'pickup', pickup_location: 'Library',
            borrow_duration: '1-month', request_date: new Date(Date.now() - 172800000),
            approved_date: new Date(Date.now() - 86400000),
            expected_return_date: new Date(Date.now() + 2592000000)
        });

        // 6. Active (Borrowed - Incoming) - Borrower has Test User's book
        await createTxn({
            book_id: bookIds[2], borrower_id: borrowerId, lender_id: testUserId,
            status: 'borrowed', request_message: 'Reading it now',
            pickup_method: 'meetup', pickup_location: 'Canteen',
            borrow_duration: '2-weeks', request_date: new Date(Date.now() - 604800000),
            approved_date: new Date(Date.now() - 518400000),
            borrowed_date: new Date(Date.now() - 432000000),
            expected_return_date: new Date(Date.now() + 864000000)
        });

        // 7. Active (Borrowed - Outgoing) - Test User has Lender's book
        await createTxn({
            book_id: bookIds[8], borrower_id: testUserId, lender_id: lenderId,
            status: 'borrowed', request_message: 'Reading carefully',
            pickup_method: 'meetup', pickup_location: 'Gate 2',
            borrow_duration: '1-week', request_date: new Date(Date.now() - 259200000),
            approved_date: new Date(Date.now() - 172800000),
            borrowed_date: new Date(Date.now() - 86400000),
            expected_return_date: new Date(Date.now() + 518400000)
        });

        // 8. Pending Feedback (Returned - Incoming) - Borrower returned Test User's book
        await createTxn({
            book_id: bookIds[3], borrower_id: borrowerId, lender_id: testUserId,
            status: 'returned', request_message: 'Done reading',
            pickup_method: 'meetup', pickup_location: 'Library',
            borrow_duration: '1-week', request_date: new Date(Date.now() - 1209600000),
            approved_date: new Date(Date.now() - 1123200000),
            borrowed_date: new Date(Date.now() - 1036800000),
            expected_return_date: new Date(Date.now() - 432000000),
            actual_return_date: new Date(Date.now() - 86400000),
            return_condition: 'good'
        });

        // 9. Pending Feedback (Returned - Outgoing) - Test User returned Lender's book
        await createTxn({
            book_id: bookIds[9], borrower_id: testUserId, lender_id: lenderId,
            status: 'returned', request_message: 'Returned it thanks',
            pickup_method: 'pickup', pickup_location: 'Lobby',
            borrow_duration: '1-week', request_date: new Date(Date.now() - 1209600000),
            approved_date: new Date(Date.now() - 1123200000),
            borrowed_date: new Date(Date.now() - 1036800000),
            expected_return_date: new Date(Date.now() - 432000000),
            actual_return_date: new Date(Date.now() - 86400000),
            return_condition: 'excellent'
        });

        // 10. Completed - Old transaction
        await createTxn({
            book_id: bookIds[4], borrower_id: borrowerId, lender_id: testUserId,
            status: 'completed', request_message: 'Old one',
            pickup_method: 'meetup', pickup_location: 'Canteen',
            borrow_duration: '1-week', request_date: new Date(Date.now() - 5000000000),
            approved_date: new Date(Date.now() - 4900000000),
            borrowed_date: new Date(Date.now() - 4800000000),
            expected_return_date: new Date(Date.now() - 4200000000),
            actual_return_date: new Date(Date.now() - 4300000000),
            return_condition: 'good'
        });

        // 11. Overdue - Test User has Lender's book, due date passed
        await createTxn({
            book_id: bookIds[10], borrower_id: testUserId, lender_id: lenderId,
            status: 'borrowed', request_message: 'Forgot to return',
            pickup_method: 'meetup', pickup_location: 'Library',
            borrow_duration: '1-week', request_date: new Date(Date.now() - 2000000000),
            approved_date: new Date(Date.now() - 1900000000),
            borrowed_date: new Date(Date.now() - 1800000000),
            expected_return_date: new Date(Date.now() - 86400000) // Due yesterday
        });

        console.log('\n🎉 Test User Seeded Successfully with Comprehensive Data!');
        console.log('-----------------------------------');
        console.log(`Email: ${testUser.email}`);
        console.log(`Password: ${testUser.password}`);
        console.log('-----------------------------------');

    } catch (error) {
        console.error('Seeding failed:', error);
    } finally {
        if (connection) await connection.end();
    }
}

seedTestUser();
