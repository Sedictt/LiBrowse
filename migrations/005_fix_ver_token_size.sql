-- Migration: Fix ver_token column size to accommodate JWT tokens
-- JWT tokens are typically 200-500 characters, so we'll use TEXT

ALTER TABLE users MODIFY COLUMN ver_token TEXT NULL;
