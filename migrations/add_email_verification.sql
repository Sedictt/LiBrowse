-- Email Verification System Migration
-- Add email verification functionality to Booqy

-- Create email verification codes table
CREATE TABLE IF NOT EXISTS email_verification_codes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    used_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_code (user_id, code),
    INDEX idx_user_expires (user_id, expires_at),
    INDEX idx_code_expires (code, expires_at)
);

-- Add email verification columns to users table if they don't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS verification_method ENUM('email', 'document', 'manual') NULL,
ADD COLUMN IF NOT EXISTS verification_date DATETIME NULL;

-- Update existing verified users to have email verification method
UPDATE users 
SET verification_method = 'document', 
    verification_date = updated_at 
WHERE is_verified = 1 AND verification_method IS NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_users_verification ON users(email_verified, is_verified, verification_method);
