-- Migration script to add new borrow request fields
-- Run this if you have an existing database

ALTER TABLE transactions 
ADD COLUMN preferred_pickup_time DATETIME NULL COMMENT 'Borrower preferred pickup time' AFTER pickup_location,
ADD COLUMN borrow_duration ENUM('1-week', '2-weeks', '3-weeks', '1-month', 'custom') NULL COMMENT 'How long they want to borrow' AFTER preferred_pickup_time;
