// Database migration script
require('dotenv').config();
const mysql = require('mysql2/promise');

async function runMigration() {
    let connection;
    
    try {
        // Create database connection
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'plv_book_exchange_dev2'
        });

        console.log('✅ Connected to database');

        // Check if columns already exist
        const [columns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'transactions' 
            AND COLUMN_NAME IN ('preferred_pickup_time', 'borrow_duration')
        `, [process.env.DB_NAME || 'plv_book_exchange_dev2']);

        if (columns.length > 0) {
            console.log('⚠️  Columns already exist. Migration may have already been run.');
            console.log('Existing columns:', columns.map(c => c.COLUMN_NAME));
        }

        // First, let's see what columns exist
        const [existingColumns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'transactions'
            ORDER BY ORDINAL_POSITION
        `, [process.env.DB_NAME || 'plv_book_exchange_dev2']);

        console.log('📋 Current columns in transactions table:');
        existingColumns.forEach(col => console.log(`  - ${col.COLUMN_NAME}`));

        // Run the migration
        console.log('🔄 Running migration...');
        
        // Add columns at the end of the table to avoid position issues
        await connection.execute(`
            ALTER TABLE transactions 
            ADD COLUMN IF NOT EXISTS preferred_pickup_time DATETIME NULL COMMENT 'Borrower preferred pickup time'
        `);
        
        await connection.execute(`
            ALTER TABLE transactions 
            ADD COLUMN IF NOT EXISTS borrow_duration ENUM('1-week', '2-weeks', '3-weeks', '1-month', 'custom') NULL COMMENT 'How long they want to borrow'
        `);

        console.log('✅ Migration completed successfully!');

        // Verify the columns were added
        const [newColumns] = await connection.execute(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'transactions' 
            AND COLUMN_NAME IN ('preferred_pickup_time', 'borrow_duration')
        `, [process.env.DB_NAME || 'plv_book_exchange_dev2']);

        console.log('📋 New columns added:');
        newColumns.forEach(col => {
            console.log(`  - ${col.COLUMN_NAME}: ${col.DATA_TYPE} (Nullable: ${col.IS_NULLABLE})`);
        });

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Database connection closed');
        }
    }
}

// Run the migration
runMigration().then(() => {
    console.log('🎉 Migration process completed');
    process.exit(0);
});
