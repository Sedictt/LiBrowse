// Script to add missing columns to feedback table
const mysql = require('mysql2/promise');

async function updateFeedbackTable() {
    let connection;
    
    try {
        // Create connection using same config as app
        connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'plv_book_exchange_dev2'
        });

        console.log('Connected to database...');

        // Check if columns exist first
        const [columns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'plv_book_exchange_dev2' 
            AND TABLE_NAME = 'feedback'
        `);

        const existingColumns = columns.map(col => col.COLUMN_NAME);
        console.log('Existing columns:', existingColumns);

        // Add book_condition_rating column if it doesn't exist
        if (!existingColumns.includes('book_condition_rating')) {
            await connection.execute(`
                ALTER TABLE feedback 
                ADD COLUMN book_condition_rating ENUM('excellent', 'good', 'fair', 'poor', 'damaged') NULL 
                COMMENT 'For lender feedback on book condition when returned'
            `);
            console.log('✅ Added book_condition_rating column');
        } else {
            console.log('ℹ️ book_condition_rating column already exists');
        }

        // Add return_timeliness column if it doesn't exist
        if (!existingColumns.includes('return_timeliness')) {
            await connection.execute(`
                ALTER TABLE feedback 
                ADD COLUMN return_timeliness ENUM('early', 'on_time', 'late') NULL 
                COMMENT 'For lender feedback on return timing'
            `);
            console.log('✅ Added return_timeliness column');
        } else {
            console.log('ℹ️ return_timeliness column already exists');
        }

        // Show updated table structure
        const [tableStructure] = await connection.execute('DESCRIBE feedback');
        console.log('\n📋 Updated feedback table structure:');
        console.table(tableStructure);

        console.log('\n🎉 Database update completed successfully!');

    } catch (error) {
        console.error('❌ Database update failed:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

updateFeedbackTable();
