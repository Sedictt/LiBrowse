/**
 * Database Migration Runner
 * Runs the chat_messages read_at column migration
 */

const { getConnection } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    console.log('🔄 Starting database migration...');
    
    let connection;
    
    try {
        // Get database connection
        connection = await getConnection();
        console.log('✅ Database connection established');

        // Read migration file
        const migrationPath = path.join(__dirname, 'database', 'migrations', 'add_read_at_to_chat_messages.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('📄 Migration file loaded');

        // Define migration statements explicitly
        const statements = [
            // Add read_at column
            `ALTER TABLE chat_messages ADD COLUMN read_at TIMESTAMP NULL DEFAULT NULL AFTER is_read`,

            // Add indexes
            `CREATE INDEX idx_chat_messages_chat_id_created ON chat_messages (chat_id, created DESC)`,
            `CREATE INDEX idx_chat_messages_is_read ON chat_messages (is_read, chat_id)`,

            // Update existing data
            `UPDATE chat_messages SET read_at = created WHERE is_read = 1 AND read_at IS NULL`
        ];

        console.log(`📝 Found ${statements.length} SQL statements to execute`);

        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            console.log(`\n⚙️  Executing statement ${i + 1}/${statements.length}...`);
            console.log(`   ${statement.substring(0, 60)}...`);
            
            try {
                await connection.execute(statement);
                console.log(`   ✅ Success`);
            } catch (error) {
                // Check if error is "column already exists" or "index already exists"
                if (error.code === 'ER_DUP_FIELDNAME' || 
                    error.code === 'ER_DUP_KEYNAME' ||
                    error.message.includes('Duplicate column') ||
                    error.message.includes('Duplicate key')) {
                    console.log(`   ⚠️  Already exists (skipping)`);
                } else {
                    throw error;
                }
            }
        }

        console.log('\n✅ Migration completed successfully!');
        console.log('\n📊 Verifying migration...');

        // Verify the column was added
        const [columns] = await connection.execute(`
            SHOW COLUMNS FROM chat_messages LIKE 'read_at'
        `);

        if (columns.length > 0) {
            console.log('✅ Column "read_at" exists in chat_messages table');
            console.log(`   Type: ${columns[0].Type}`);
            console.log(`   Null: ${columns[0].Null}`);
            console.log(`   Default: ${columns[0].Default}`);
        } else {
            console.log('❌ Column "read_at" was not created');
        }

        // Verify indexes
        const [indexes] = await connection.execute(`
            SHOW INDEX FROM chat_messages WHERE Key_name LIKE 'idx_chat_messages%'
        `);

        console.log(`\n✅ Found ${indexes.length} indexes on chat_messages table`);
        indexes.forEach(idx => {
            console.log(`   - ${idx.Key_name} on column ${idx.Column_name}`);
        });

        connection.release();
        console.log('\n🎉 Migration verification complete!');
        console.log('\n✨ Your chat system database is ready!');
        
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error('\nError details:', error);
        
        if (connection) {
            connection.release();
        }
        
        process.exit(1);
    }
}

// Run migration
runMigration();

