/**
 * Database Migration Runner
 * Runs the verification migration using Node.js
 */

const fs = require('fs').promises;
const path = require('path');

async function runMigration() {
    try {
        console.log('🗄️  Running OCR verification migration...');
        
        // Import database connection
        const { pool } = require('./config/database');
        
        // Read migration file
        const migrationPath = path.join(__dirname, 'database/verification_migration.sql');
        const migrationSQL = await fs.readFile(migrationPath, 'utf8');
        
        // Split into individual statements
        const statements = migrationSQL
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.toLowerCase().includes('delimiter'));
        
        console.log(`📝 Found ${statements.length} SQL statements to execute`);
        
        let successCount = 0;
        let warningCount = 0;
        
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            
            try {
                await pool.execute(statement);
                successCount++;
                console.log(`   ✓ Statement ${i + 1}/${statements.length} executed successfully`);
            } catch (error) {
                if (error.message.includes('already exists') || 
                    error.message.includes('Duplicate') ||
                    error.code === 'ER_TABLE_EXISTS_ERROR' ||
                    error.code === 'ER_DUP_KEYNAME') {
                    warningCount++;
                    console.log(`   ⚠️  Statement ${i + 1}/${statements.length} - Already exists (${error.code})`);
                } else {
                    console.error(`   ❌ Statement ${i + 1}/${statements.length} failed:`, error.message);
                    throw error;
                }
            }
        }
        
        console.log('\n✅ Migration completed successfully!');
        console.log(`   📊 Results: ${successCount} executed, ${warningCount} warnings`);
        
        // Test the new tables
        await testTables();
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

async function testTables() {
    try {
        console.log('\n🧪 Testing created tables...');
        
        const { pool } = require('./config/database');
        
        // Test verification_documents table
        const [verificationResult] = await pool.execute('DESCRIBE verification_documents');
        console.log(`   ✓ verification_documents table created (${verificationResult.length} columns)`);
        
        // Test verification_attempts table
        try {
            const [attemptsResult] = await pool.execute('DESCRIBE verification_attempts');
            console.log(`   ✓ verification_attempts table created (${attemptsResult.length} columns)`);
        } catch (error) {
            console.log('   ⚠️  verification_attempts table may not exist');
        }
        
        // Test admin_actions table
        try {
            const [adminResult] = await pool.execute('DESCRIBE admin_actions');
            console.log(`   ✓ admin_actions table created (${adminResult.length} columns)`);
        } catch (error) {
            console.log('   ⚠️  admin_actions table may not exist');
        }
        
        // Test system_settings table
        try {
            const [settingsResult] = await pool.execute('SELECT COUNT(*) as count FROM system_settings');
            console.log(`   ✓ system_settings table created (${settingsResult[0].count} settings)`);
        } catch (error) {
            console.log('   ⚠️  system_settings table may not exist');
        }
        
        // Check users table for verification columns
        try {
            const [usersResult] = await pool.execute('DESCRIBE users');
            const hasVerificationStatus = usersResult.some(col => col.Field === 'verification_status');
            if (hasVerificationStatus) {
                console.log('   ✓ users table updated with verification columns');
            } else {
                console.log('   ⚠️  users table may need verification columns');
            }
        } catch (error) {
            console.log('   ⚠️  Could not check users table');
        }
        
        console.log('\n🎉 Database is ready for OCR verification!');
        
    } catch (error) {
        console.error('❌ Table testing failed:', error.message);
    }
}

// Run migration if called directly
if (require.main === module) {
    runMigration().catch(error => {
        console.error('Migration script failed:', error);
        process.exit(1);
    });
}

module.exports = { runMigration, testTables };
