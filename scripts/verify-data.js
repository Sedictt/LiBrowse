const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'plv_book_exchange',
    port: process.env.DB_PORT || 3306
};

async function verifyData() {
    const connection = await mysql.createConnection(dbConfig);
    try {
        console.log('Verifying data...');

        // 1. Get Test User ID
        const [users] = await connection.execute('SELECT id, email, fname FROM users WHERE email = ?', ['testuser@plv.edu.ph']);
        if (users.length === 0) {
            console.log('❌ Test user not found!');
            return;
        }
        const testUser = users[0];
        console.log(`✅ Test User: ${testUser.fname} (ID: ${testUser.id})`);

        // 2. Get Transactions
        const [transactions] = await connection.execute(`
            SELECT id, book_id, borrower_id, lender_id, status, request_message 
            FROM transactions 
            WHERE borrower_id = ? OR lender_id = ?
        `, [testUser.id, testUser.id]);

        console.log(`\nFound ${transactions.length} transactions involving Test User:`);

        const incoming = transactions.filter(t => t.lender_id === testUser.id);
        const outgoing = transactions.filter(t => t.borrower_id === testUser.id);

        console.log(`\nIncoming (Lender = Test User): ${incoming.length}`);
        incoming.forEach(t => console.log(` - ID: ${t.id}, Status: ${t.status}, Borrower: ${t.borrower_id}`));

        console.log(`\nOutgoing (Borrower = Test User): ${outgoing.length}`);
        outgoing.forEach(t => console.log(` - ID: ${t.id}, Status: ${t.status}, Lender: ${t.lender_id}`));

    } catch (e) {
        console.error(e);
    } finally {
        await connection.end();
    }
}

verifyData();
