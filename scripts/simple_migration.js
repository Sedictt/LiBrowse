/**
 * Simple OCR Migration - Add verification columns and tables step by step
 */

const { pool } = require('./config/database');

async function runSimpleMigration() {
    try {
        console.log('🗄️  Running simple OCR migration...');
        
        // Step 1: Add verification columns to users table
        console.log('\n📝 Step 1: Adding verification columns to users table...');
        
        try {
            await pool.execute(`
                ALTER TABLE users 
                ADD COLUMN verification_status ENUM('pending', 'verified', 'rejected', 'pending_review') DEFAULT 'pending'
            `);
            console.log('   ✓ Added verification_status column');
        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('   ✓ verification_status column already exists');
            } else {
                throw error;
            }
        }
        
        try {
            await pool.execute(`
                ALTER TABLE users 
                ADD COLUMN verification_method ENUM('email_otp', 'document_upload') NULL
            `);
            console.log('   ✓ Added verification_method column');
        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('   ✓ verification_method column already exists');
            } else {
                throw error;
            }
        }
        
        try {
            await pool.execute(`
                ALTER TABLE users 
                ADD COLUMN verification_completed_at TIMESTAMP NULL
            `);
            console.log('   ✓ Added verification_completed_at column');
        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('   ✓ verification_completed_at column already exists');
            } else {
                throw error;
            }
        }
        
        // Step 2: Create verification_documents table
        console.log('\n📝 Step 2: Creating verification_documents table...');
        
        try {
            await pool.execute(`
                CREATE TABLE verification_documents (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    user_id INT NOT NULL,
                    front_id_path VARCHAR(500) NOT NULL,
                    back_id_path VARCHAR(500) NULL,
                    front_ocr_text TEXT NULL,
                    back_ocr_text TEXT NULL,
                    front_extracted_info JSON NULL,
                    back_extracted_info JSON NULL,
                    front_confidence DECIMAL(5,2) DEFAULT 0.00,
                    back_confidence DECIMAL(5,2) NULL,
                    combined_confidence DECIMAL(5,2) DEFAULT 0.00,
                    status ENUM('pending_review', 'verified', 'rejected', 'expired') DEFAULT 'pending_review',
                    auto_approved BOOLEAN DEFAULT FALSE,
                    admin_reviewed_by INT NULL,
                    admin_reviewed_at TIMESTAMP NULL,
                    admin_notes TEXT NULL,
                    processed_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    INDEX idx_user_id (user_id),
                    INDEX idx_status (status),
                    INDEX idx_created_at (created_at),
                    INDEX idx_confidence (combined_confidence)
                )
            `);
            console.log('   ✓ Created verification_documents table');
        } catch (error) {
            if (error.code === 'ER_TABLE_EXISTS_ERROR') {
                console.log('   ✓ verification_documents table already exists');
            } else {
                throw error;
            }
        }
        
        // Step 3: Create verification_attempts table
        console.log('\n📝 Step 3: Creating verification_attempts table...');
        
        try {
            await pool.execute(`
                CREATE TABLE verification_attempts (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    user_id INT NOT NULL,
                    verification_type ENUM('email_otp', 'document_upload') NOT NULL,
                    attempt_data JSON NULL,
                    status ENUM('pending', 'verified', 'expired', 'failed') DEFAULT 'pending',
                    attempts_count INT DEFAULT 1,
                    max_attempts INT DEFAULT 3,
                    expires_at TIMESTAMP NULL,
                    verified_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    INDEX idx_user_verification (user_id, verification_type),
                    INDEX idx_status_expires (status, expires_at)
                )
            `);
            console.log('   ✓ Created verification_attempts table');
        } catch (error) {
            if (error.code === 'ER_TABLE_EXISTS_ERROR') {
                console.log('   ✓ verification_attempts table already exists');
            } else {
                throw error;
            }
        }
        
        // Step 4: Create system_settings table
        console.log('\n📝 Step 4: Creating system_settings table...');
        
        try {
            await pool.execute(`
                CREATE TABLE system_settings (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    setting_key VARCHAR(100) NOT NULL UNIQUE,
                    setting_value TEXT NOT NULL,
                    description TEXT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
            console.log('   ✓ Created system_settings table');
        } catch (error) {
            if (error.code === 'ER_TABLE_EXISTS_ERROR') {
                console.log('   ✓ system_settings table already exists');
            } else {
                throw error;
            }
        }
        
        // Step 5: Insert OCR settings
        console.log('\n📝 Step 5: Inserting OCR configuration settings...');
        
        const settings = [
            ['ocr_confidence_threshold', '70', 'Minimum confidence score for automatic verification approval'],
            ['ocr_max_file_size', '5242880', 'Maximum file size for document uploads in bytes (5MB)'],
            ['ocr_supported_formats', '["jpg", "jpeg", "png", "pdf"]', 'Supported file formats for document upload'],
            ['verification_expiry_days', '30', 'Days after which unreviewed documents expire'],
            ['max_verification_attempts', '3', 'Maximum number of verification attempts per user']
        ];
        
        for (const [key, value, description] of settings) {
            try {
                await pool.execute(`
                    INSERT INTO system_settings (setting_key, setting_value, description) 
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        setting_value = VALUES(setting_value),
                        updated_at = CURRENT_TIMESTAMP
                `, [key, value, description]);
                console.log(`   ✓ Inserted/updated setting: ${key}`);
            } catch (error) {
                console.log(`   ⚠️  Warning for setting ${key}:`, error.message);
            }
        }
        
        // Step 6: Add indexes to users table
        console.log('\n📝 Step 6: Adding indexes to users table...');
        
        try {
            await pool.execute('CREATE INDEX idx_users_verification_status ON users(verification_status)');
            console.log('   ✓ Added verification_status index');
        } catch (error) {
            if (error.code === 'ER_DUP_KEYNAME') {
                console.log('   ✓ verification_status index already exists');
            } else {
                console.log('   ⚠️  Warning adding verification_status index:', error.message);
            }
        }
        
        try {
            await pool.execute('CREATE INDEX idx_users_verification_method ON users(verification_method)');
            console.log('   ✓ Added verification_method index');
        } catch (error) {
            if (error.code === 'ER_DUP_KEYNAME') {
                console.log('   ✓ verification_method index already exists');
            } else {
                console.log('   ⚠️  Warning adding verification_method index:', error.message);
            }
        }
        
        console.log('\n✅ Simple migration completed successfully!');
        
        // Test the tables
        await testTables();
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    }
}

async function testTables() {
    try {
        console.log('\n🧪 Testing created tables and columns...');
        
        // Test users table columns
        const [usersResult] = await pool.execute('DESCRIBE users');
        const hasVerificationStatus = usersResult.some(col => col.Field === 'verification_status');
        const hasVerificationMethod = usersResult.some(col => col.Field === 'verification_method');
        
        if (hasVerificationStatus && hasVerificationMethod) {
            console.log('   ✓ users table has verification columns');
        } else {
            console.log('   ⚠️  users table missing some verification columns');
        }
        
        // Test verification_documents table
        try {
            const [verificationResult] = await pool.execute('DESCRIBE verification_documents');
            console.log(`   ✓ verification_documents table exists (${verificationResult.length} columns)`);
        } catch (error) {
            console.log('   ❌ verification_documents table not found');
        }
        
        // Test system_settings table
        try {
            const [settingsResult] = await pool.execute('SELECT COUNT(*) as count FROM system_settings');
            console.log(`   ✓ system_settings table exists (${settingsResult[0].count} settings)`);
        } catch (error) {
            console.log('   ❌ system_settings table not found');
        }
        
        console.log('\n🎉 Database is ready for OCR verification!');
        
    } catch (error) {
        console.error('❌ Table testing failed:', error.message);
    }
}

// Run if called directly
if (require.main === module) {
    runSimpleMigration().catch(error => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
}

module.exports = { runSimpleMigration, testTables };
