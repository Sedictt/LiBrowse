-- Migration: Add bio column to users table
-- Purpose: persist user bio from Edit Profile

USE plv_book_exchange;

-- Add bio column if it does not exist (MySQL 8 supports IF NOT EXISTS)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bio TEXT NULL AFTER year;