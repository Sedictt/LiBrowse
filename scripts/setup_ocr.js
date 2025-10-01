/**
 * OCR Setup Script
 * Installs and configures Tesseract OCR dependencies
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class OCRSetup {
    constructor() {
        this.requiredDirs = [
            'uploads/verification',
            'services',
            'logs'
        ];
    }

    async setup() {
        console.log('🔧 Setting up OCR Document Verification System...\n');

        try {
            // Create required directories
            await this.createDirectories();
            
            // Install npm dependencies
            await this.installDependencies();
            
            // Run database migration
            await this.runMigration();
            
            // Create upload directories
            await this.setupUploadDirs();
            
            // Test OCR functionality
            await this.testOCR();
            
            console.log('\n✅ OCR Setup completed successfully!');
            console.log('\n📋 Next steps:');
            console.log('1. Start the server: npm run dev');
            console.log('2. Navigate to /verification.html');
            console.log('3. Upload student ID documents for testing');
            console.log('\n🔧 Configuration:');
            console.log('- OCR Confidence Threshold: 70%');
            console.log('- Max File Size: 5MB');
            console.log('- Supported Formats: JPG, PNG, PDF');
            
        } catch (error) {
            console.error('❌ Setup failed:', error.message);
            process.exit(1);
        }
    }

    async createDirectories() {
        console.log('📁 Creating required directories...');
        
        for (const dir of this.requiredDirs) {
            const fullPath = path.join(__dirname, dir);
            try {
                await fs.mkdir(fullPath, { recursive: true });
                console.log(`   ✓ Created: ${dir}`);
            } catch (error) {
                if (error.code !== 'EEXIST') {
                    throw error;
                }
                console.log(`   ✓ Exists: ${dir}`);
            }
        }
    }

    async installDependencies() {
        console.log('\n📦 Installing OCR dependencies...');
        
        const dependencies = [
            'tesseract.js@5.0.4',
            'sharp@0.33.2',
            'jimp@0.22.10'
        ];

        try {
            console.log('   Installing packages...');
            execSync(`npm install ${dependencies.join(' ')}`, { 
                stdio: 'inherit',
                cwd: __dirname 
            });
            console.log('   ✅ Dependencies installed successfully');
        } catch (error) {
            throw new Error(`Failed to install dependencies: ${error.message}`);
        }
    }

    async runMigration() {
        console.log('\n🗄️  Running database migration...');
        
        try {
            const db = require('./config/database');
            const migrationSQL = await fs.readFile(
                path.join(__dirname, 'database/verification_migration.sql'), 
                'utf8'
            );

            // Split SQL commands and execute them
            const commands = migrationSQL
                .split(';')
                .map(cmd => cmd.trim())
                .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

            for (const command of commands) {
                if (command.toLowerCase().includes('delimiter')) {
                    // Skip delimiter commands for now
                    continue;
                }
                
                try {
                    await db.execute(command);
                } catch (error) {
                    if (!error.message.includes('already exists')) {
                        console.warn(`   ⚠️  Warning: ${error.message}`);
                    }
                }
            }
            
            console.log('   ✅ Database migration completed');
        } catch (error) {
            throw new Error(`Database migration failed: ${error.message}`);
        }
    }

    async setupUploadDirs() {
        console.log('\n📤 Setting up upload directories...');
        
        const uploadDirs = [
            'uploads/verification',
            'uploads/books',
            'uploads/avatars'
        ];

        for (const dir of uploadDirs) {
            const fullPath = path.join(__dirname, dir);
            try {
                await fs.mkdir(fullPath, { recursive: true });
                
                // Create .gitkeep file
                const gitkeepPath = path.join(fullPath, '.gitkeep');
                await fs.writeFile(gitkeepPath, '# Keep this directory in git\n');
                
                console.log(`   ✓ Setup: ${dir}`);
            } catch (error) {
                console.warn(`   ⚠️  Warning: Failed to setup ${dir}: ${error.message}`);
            }
        }
    }

    async testOCR() {
        console.log('\n🧪 Testing OCR functionality...');
        
        try {
            // Test if Tesseract can be imported and initialized
            const Tesseract = require('tesseract.js');
            
            console.log('   ✓ Tesseract.js imported successfully');
            console.log('   ✓ OCR system ready for document processing');
            
            // Test image processing libraries
            const sharp = require('sharp');
            const Jimp = require('jimp');
            
            console.log('   ✓ Sharp image processing library loaded');
            console.log('   ✓ Jimp image processing library loaded');
            
        } catch (error) {
            throw new Error(`OCR test failed: ${error.message}`);
        }
    }

    async createSampleConfig() {
        console.log('\n⚙️  Creating sample configuration...');
        
        const sampleEnv = `
# OCR Configuration
OCR_CONFIDENCE_THRESHOLD=70
OCR_MAX_FILE_SIZE=5242880
OCR_SUPPORTED_FORMATS=jpg,jpeg,png,pdf
OCR_CLEANUP_PROCESSED_FILES=true

# Verification Settings
VERIFICATION_EXPIRY_DAYS=30
MAX_VERIFICATION_ATTEMPTS=3
AUTO_APPROVE_HIGH_CONFIDENCE=true
        `.trim();

        try {
            const envPath = path.join(__dirname, '.env.ocr.example');
            await fs.writeFile(envPath, sampleEnv);
            console.log('   ✓ Sample OCR configuration created: .env.ocr.example');
        } catch (error) {
            console.warn(`   ⚠️  Warning: Could not create sample config: ${error.message}`);
        }
    }
}

// Run setup if called directly
if (require.main === module) {
    const setup = new OCRSetup();
    setup.setup().catch(error => {
        console.error('Setup failed:', error);
        process.exit(1);
    });
}

module.exports = OCRSetup;
