// Complete migration script to add all missing transaction fields
require('dotenv').config();
const mysql = require('mysql2/promise');

async function runFullMigration() {
    let connection;
    
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'plv_book_exchange_dev2'
        });

        console.log('✅ Connected to database');

        // Add all missing columns for the borrow request system
        const migrations = [
            {
                column: 'request_message',
                sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS request_message TEXT COMMENT 'Borrower request message'`
            },
            {
                column: 'borrower_contact',
                sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS borrower_contact VARCHAR(255) COMMENT 'Contact info provided by borrower'`
            },
            {
                column: 'borrower_address',
                sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS borrower_address TEXT COMMENT 'Address for pickup/delivery'`
            },
            {
                column: 'pickup_method',
                sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pickup_method ENUM('pickup', 'meetup', 'delivery') DEFAULT 'pickup' COMMENT 'Pickup method'`
            },
            {
                column: 'pickup_location',
                sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pickup_location VARCHAR(255) COMMENT 'Where to meet/pickup'`
            },
            {
                column: 'rejection_reason',
                sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS rejection_reason TEXT COMMENT 'Reason if rejected'`
            },
            {
                column: 'return_condition',
                sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS return_condition ENUM('excellent', 'good', 'fair', 'poor', 'damaged') NULL COMMENT 'Condition when returned'`
            }
        ];

        console.log('🔄 Running comprehensive migration...');

        for (const migration of migrations) {
            try {
                await connection.execute(migration.sql);
                console.log(`✅ Added column: ${migration.column}`);
            } catch (error) {
                if (error.message.includes('Duplicate column name')) {
                    console.log(`⚠️  Column ${migration.column} already exists`);
                } else {
                    console.error(`❌ Failed to add ${migration.column}:`, error.message);
                }
            }
        }

        // Update status enum to include all required statuses
        try {
            await connection.execute(`
                ALTER TABLE transactions 
                MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'borrowed', 'returned', 'overdue', 'completed', 'cancelled') DEFAULT 'pending'
            `);
            console.log('✅ Updated status enum');
        } catch (error) {
            console.log('⚠️  Status enum update:', error.message);
        }

        console.log('✅ Full migration completed!');

        // Show final table structure
        const [finalColumns] = await connection.execute(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'transactions'
            ORDER BY ORDINAL_POSITION
        `, [process.env.DB_NAME || 'plv_book_exchange_dev2']);

        console.log('📋 Final transactions table structure:');
        finalColumns.forEach(col => {
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

runFullMigration().then(() => {
    console.log('🎉 Full migration process completed');
    process.exit(0);
});
