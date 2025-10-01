// Setup script for email verification system
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupEmailVerification() {
    let connection;
    
    try {
        // Create database connection
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'plv_bookswap'
        });

        console.log('📧 Setting up email verification system...');

        // Read and execute migration SQL
        const migrationPath = path.join(__dirname, 'migrations', 'add_email_verification.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Split by semicolon and execute each statement
        const statements = migrationSQL.split(';').filter(stmt => stmt.trim());
        
        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    await connection.execute(statement);
                    console.log('✅ Executed:', statement.substring(0, 50) + '...');
                } catch (error) {
                    if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.code === 'ER_DUP_FIELDNAME') {
                        console.log('⚠️  Already exists:', statement.substring(0, 50) + '...');
                    } else {
                        throw error;
                    }
                }
            }
        }

        console.log('🎉 Email verification system setup complete!');
        console.log('');
        console.log('📋 Next steps:');
        console.log('1. Configure SMTP settings in your .env file:');
        console.log('   SMTP_HOST=smtp.gmail.com');
        console.log('   SMTP_PORT=587');
        console.log('   SMTP_USER=your-email@gmail.com');
        console.log('   SMTP_PASS=your-app-password');
        console.log('   SMTP_FROM="Booqy Team" <noreply@booqy.com>');
        console.log('');
        console.log('2. Start the server: npm run dev');
        console.log('3. Test email verification in the profile section');

    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run setup
setupEmailVerification();
