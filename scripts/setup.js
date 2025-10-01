// PLV Book Exchange - Database Setup Script
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupDatabase() {
    console.log('🚀 Setting up PLV Book Exchange Database...\n');

    try {
        // Connect to MySQL (without specifying database)
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            multipleStatements: true
        });

        console.log('✅ Connected to MySQL server');

        // Create database if it doesn't exist
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'plv_book_exchange'}`);
        console.log('✅ Database created/verified');

        // Use the database
        await connection.query(`USE ${process.env.DB_NAME || 'plv_book_exchange'}`);
        console.log('✅ Using database:', process.env.DB_NAME || 'plv_book_exchange');

        // Read and execute schema
        const schemaPath = path.join(__dirname, 'database', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Remove CREATE DATABASE and USE statements (already handled)
        let cleanSchema = schema
            .replace(/CREATE DATABASE IF NOT EXISTS plv_book_exchange;/gi, '')
            .replace(/USE plv_book_exchange;/gi, '');
        
        // Split schema into individual statements
        const statements = cleanSchema.split(';').filter(stmt => stmt.trim().length > 0);
        
        console.log('📊 Creating tables and inserting data...');
        
        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    // Use non-prepared query for DDL statements
                    await connection.query(statement);
                } catch (err) {
                    if (!err.message.includes('already exists')) {
                        console.log('Statement that failed:', statement.substring(0, 100) + '...');
                        throw err;
                    }
                }
            }
        }

        console.log('✅ Database schema created successfully');

        // Test the connection with our app's database config
        await connection.end();
        
        const testConnection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'plv_book_exchange',
            multipleStatements: true
        });

        // Test a simple query
        const [rows] = await testConnection.execute('SELECT COUNT(*) as count FROM users');
        console.log('✅ Database connection test passed');
        console.log('📈 Current users in database:', rows[0].count);

        await testConnection.end();

        console.log('\n🎉 Database setup completed successfully!');
        console.log('🚀 You can now run: npm start');
        console.log('🌐 Then visit: http://localhost:3000');

    } catch (error) {
        console.error('❌ Database setup failed:', error.message);
        console.log('\n🔧 Please check:');
        console.log('   - MySQL server is running (XAMPP/WAMP)');
        console.log('   - Database credentials in .env file');
        console.log('   - MySQL user has proper permissions');
    }
}

// Run setup
setupDatabase();
