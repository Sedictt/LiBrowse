-- Migration to align books table schema with API expectations
-- This ensures consistency between database and application code

USE plv_book_exchange;

-- Add missing columns and rename existing ones
ALTER TABLE books 
    CHANGE COLUMN writer author VARCHAR(200),
    CHANGE COLUMN subj subject VARCHAR(120),
    CHANGE COLUMN code course_code VARCHAR(20),
    CHANGE COLUMN year_pub publication_year INT,
    CHANGE COLUMN cover cover_image VARCHAR(200),
    CHANGE COLUMN min_credit minimum_credits INT DEFAULT 100,
    CHANGE COLUMN created created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHANGE COLUMN updated updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Update condition_rating enum to match API expectations
ALTER TABLE books 
    MODIFY COLUMN condition_rating ENUM('excellent', 'good', 'fair', 'poor') NOT NULL;

-- Add index for better search performance
CREATE INDEX idx_books_title ON books(title);
CREATE INDEX idx_books_author ON books(author);
CREATE INDEX idx_books_course_code ON books(course_code);
CREATE INDEX idx_books_available ON books(is_available);
