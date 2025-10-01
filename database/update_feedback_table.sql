-- Add missing columns to feedback table for enhanced feedback system
USE bookswap;

-- Add book_condition_rating column if it doesn't exist
ALTER TABLE feedback 
ADD COLUMN IF NOT EXISTS book_condition_rating ENUM('excellent', 'good', 'fair', 'poor', 'damaged') NULL 
COMMENT 'For lender feedback on book condition when returned';

-- Add return_timeliness column if it doesn't exist  
ALTER TABLE feedback 
ADD COLUMN IF NOT EXISTS return_timeliness ENUM('early', 'on_time', 'late') NULL 
COMMENT 'For lender feedback on return timing';

-- Show the updated table structure
DESCRIBE feedback;
