-- Manual seed: create DB (if missing), ensure users table exists, and insert a verified test user.

-- Adjust the DB name if you changed DB_NAME in .env
CREATE DATABASE IF NOT EXISTS plv_book_exchange_dev2;
USE plv_book_exchange_dev2;

-- Ensure users table exists (matches database/schema.sql)
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_id VARCHAR(20) UNIQUE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(15),
    program VARCHAR(100) NOT NULL,
    year_level INT NOT NULL,
    credits INT DEFAULT 100,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    verification_expires DATETIME,
    profile_image VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    status ENUM('active', 'suspended', 'inactive') DEFAULT 'active'
);

-- Insert a verified test account (password: password123)
-- Hash matches those used in schema.sql sample data
INSERT INTO users (
    student_id, first_name, last_name, email, password_hash, phone, program, year_level, credits, is_verified
) VALUES (
    '2025-99999', 'Test', 'User', 'test.user@plv.edu.ph',
    '$2a$12$LQv3c1yqBwEHFl5aysHCFOC4LtjWbOFXdpr5wGRVJ/9SM/4V9/VPW',
    '09999999999', 'Information Technology', 3, 120, TRUE
)
ON DUPLICATE KEY UPDATE
    password_hash = VALUES(password_hash),
    is_verified = VALUES(is_verified),
    first_name = VALUES(first_name),
    last_name = VALUES(last_name),
    program = VALUES(program),
    year_level = VALUES(year_level),
    credits = VALUES(credits),
    updated_at = CURRENT_TIMESTAMP;
