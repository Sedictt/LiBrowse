-- Migration for OCR Document Verification System
-- Creates verification_documents table and updates users table

-- Create verification_documents table
CREATE TABLE IF NOT EXISTS verification_documents (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    
    -- File paths
    front_id_path VARCHAR(500) NOT NULL,
    back_id_path VARCHAR(500) NULL,
    
    -- OCR extracted text
    front_ocr_text TEXT NULL,
    back_ocr_text TEXT NULL,
    
    -- Extracted information (JSON format)
    front_extracted_info JSON NULL,
    back_extracted_info JSON NULL,
    
    -- Confidence scores
    front_confidence DECIMAL(5,2) DEFAULT 0.00,
    back_confidence DECIMAL(5,2) NULL,
    combined_confidence DECIMAL(5,2) DEFAULT 0.00,
    
    -- Verification status
    status ENUM('pending_review', 'verified', 'rejected', 'expired') DEFAULT 'pending_review',
    auto_approved BOOLEAN DEFAULT FALSE,
    
    -- Admin review
    admin_reviewed_by INT NULL,
    admin_reviewed_at TIMESTAMP NULL,
    admin_notes TEXT NULL,
    
    -- Timestamps
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    
    -- Indexes for performance
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_confidence (combined_confidence)
);

-- Update users table to include verification fields if they don't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS verification_status ENUM('pending', 'verified', 'rejected', 'pending_review') DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS verification_method ENUM('email_otp', 'document_upload') NULL,
ADD COLUMN IF NOT EXISTS verification_completed_at TIMESTAMP NULL;

-- Create indexes on users table for verification
CREATE INDEX IF NOT EXISTS idx_users_verification_status ON users(verification_status);
CREATE INDEX IF NOT EXISTS idx_users_verification_method ON users(verification_method);

-- Create verification_attempts table for tracking OTP attempts
CREATE TABLE IF NOT EXISTS verification_attempts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    verification_type ENUM('email_otp', 'document_upload') NOT NULL,
    attempt_data JSON NULL, -- Store OTP code, expiry, etc.
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
);

-- Create admin_actions table for tracking verification reviews
CREATE TABLE IF NOT EXISTS admin_actions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    admin_user_id INT NOT NULL,
    target_user_id INT NOT NULL,
    action_type ENUM('verify_approve', 'verify_reject', 'account_suspend', 'account_activate') NOT NULL,
    verification_document_id INT NULL,
    reason TEXT NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (verification_document_id) REFERENCES verification_documents(id) ON DELETE SET NULL,
    
    INDEX idx_admin_actions (admin_user_id, created_at),
    INDEX idx_target_actions (target_user_id, created_at),
    INDEX idx_action_type (action_type)
);

-- Insert sample verification confidence thresholds into a settings table
CREATE TABLE IF NOT EXISTS system_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert OCR configuration settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('ocr_confidence_threshold', '70', 'Minimum confidence score for automatic verification approval'),
('ocr_max_file_size', '5242880', 'Maximum file size for document uploads in bytes (5MB)'),
('ocr_supported_formats', '["jpg", "jpeg", "png", "pdf"]', 'Supported file formats for document upload'),
('verification_expiry_days', '30', 'Days after which unreviewed documents expire'),
('max_verification_attempts', '3', 'Maximum number of verification attempts per user')
ON DUPLICATE KEY UPDATE 
    setting_value = VALUES(setting_value),
    updated_at = CURRENT_TIMESTAMP;

-- Create trigger to update user verification status when document is verified
DELIMITER //
CREATE TRIGGER IF NOT EXISTS update_user_verification_status
    AFTER UPDATE ON verification_documents
    FOR EACH ROW
BEGIN
    -- If document status changed to verified, update user
    IF NEW.status = 'verified' AND OLD.status != 'verified' THEN
        UPDATE users 
        SET 
            verification_status = 'verified',
            verification_completed_at = NOW(),
            updated_at = NOW()
        WHERE id = NEW.user_id;
    END IF;
    
    -- If document status changed to rejected, update user
    IF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
        UPDATE users 
        SET 
            verification_status = 'rejected',
            updated_at = NOW()
        WHERE id = NEW.user_id;
    END IF;
END//
DELIMITER ;

-- Create procedure for cleaning up expired verification attempts
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS CleanupExpiredVerifications()
BEGIN
    -- Mark expired verification attempts
    UPDATE verification_attempts 
    SET status = 'expired' 
    WHERE status = 'pending' 
    AND expires_at < NOW();
    
    -- Mark expired document verifications
    UPDATE verification_documents 
    SET status = 'expired' 
    WHERE status = 'pending_review' 
    AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
    
    -- Clean up old processed images (optional - be careful with file cleanup)
    -- This would need to be implemented in application code to safely remove files
END//
DELIMITER ;

-- Create view for admin verification dashboard
CREATE VIEW IF NOT EXISTS admin_verification_queue AS
SELECT 
    vd.id,
    vd.user_id,
    u.full_name,
    u.email,
    u.student_id,
    vd.combined_confidence,
    vd.status,
    vd.auto_approved,
    vd.created_at,
    vd.processed_at,
    DATEDIFF(NOW(), vd.created_at) as days_pending
FROM verification_documents vd
JOIN users u ON vd.user_id = u.id
WHERE vd.status = 'pending_review'
ORDER BY vd.created_at ASC;

-- Create view for verification statistics
CREATE VIEW IF NOT EXISTS verification_stats AS
SELECT 
    COUNT(*) as total_submissions,
    SUM(CASE WHEN auto_approved = 1 THEN 1 ELSE 0 END) as auto_approved_count,
    SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified_count,
    SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
    SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) as pending_count,
    AVG(combined_confidence) as avg_confidence,
    MAX(combined_confidence) as max_confidence,
    MIN(combined_confidence) as min_confidence
FROM verification_documents;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON verification_documents TO 'booqy_app'@'localhost';
-- GRANT SELECT, UPDATE ON users TO 'booqy_app'@'localhost';
-- GRANT SELECT, INSERT ON admin_actions TO 'booqy_app'@'localhost';

COMMIT;
