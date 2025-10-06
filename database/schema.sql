-- PLV Book Exchange Platform Database Schema
CREATE DATABASE IF NOT EXISTS plv_book_exchange;
USE plv_book_exchange;

-- Users table with verification and credit system
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(120) NOT NULL UNIQUE,
    student_no VARCHAR(25) NOT NULL UNIQUE,
    fname VARCHAR(60) NOT NULL,
    lname VARCHAR(60) NOT NULL,
    pass_hash VARCHAR(200) NOT NULL,
    course VARCHAR(120) NOT NULL,
    year INT NOT NULL,
    phone_no VARCHAR(20),
    profile_pic VARCHAR(200),
    status ENUM('active','inactive','banned') DEFAULT 'active',
    is_verified BOOLEAN DEFAULT TRUE,
    ver_token VARCHAR(200),
    ver_token_expiry DATETIME,
    credits INT DEFAULT 50,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Books table
CREATE TABLE books (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(250) NOT NULL,
    writer VARCHAR(200),
    isbn VARCHAR(25),
    subj VARCHAR(120),
    code VARCHAR(20),
    year_pub INT,
    publisher VARCHAR(120),
    edition VARCHAR(40),
    condition_rating ENUM('new','used_good','used_fair','damaged') NOT NULL,
    description TEXT,
    cover VARCHAR(200),
    owner_id INT NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    min_credit INT DEFAULT 0,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_book_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Borrowing transactions (following SRS specifications)
CREATE TABLE transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    borrower_id INT NOT NULL,
    lender_id INT NOT NULL,
    status ENUM('waiting','approved','denied','ongoing','done','late','cancelled') DEFAULT 'waiting',
    req_msg TEXT,
    bor_contact VARCHAR(120),
    bor_addr TEXT,
    pickup_type ENUM('pickup','meet','ship') DEFAULT 'pickup',
    pickup_spot VARCHAR(200),
    pref_pickup_time DATETIME,
    borrower_duration ENUM('1w','2w','3w','1m','custom'),
    custom_days INT,
    borrower_note TEXT,
    lender_note TEXT,
    reason_deny TEXT,
    return_state ENUM('new','used_good','used_fair','damaged') NULL,
    date_req TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_approve TIMESTAMP NULL,
    date_borrowed TIMESTAMP NULL,
    date_expected DATE,
    date_returned TIMESTAMP NULL,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_txn_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    CONSTRAINT fk_txn_borrower FOREIGN KEY (borrower_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_txn_lender FOREIGN KEY (lender_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Feedback and rating system (following SRS specifications)
CREATE TABLE feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NOT NULL,
    reviewer_id INT NOT NULL,
    reviewee_id INT NOT NULL,
    rating INT CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    feedback_type ENUM('to_borrower','to_lender') NOT NULL,
    book_cond ENUM('new','used_good','used_fair','damaged') NULL,
    return_time ENUM('early','ontime','late') NULL,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_feedback_txn FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    CONSTRAINT fk_feedback_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_feedback_target FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Credit history for tracking credit changes
CREATE TABLE credit_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    transaction_id INT,
    credit_change INT NOT NULL,
    remark VARCHAR(200) NOT NULL,
    old_balance INT NOT NULL,
    new_balance INT NOT NULL,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_credit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_credit_txn FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);

-- Notifications system
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    category ENUM('system','reminder','credit','transaction') NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    related_id INT,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- System settings
CREATE TABLE settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_name VARCHAR(80) UNIQUE NOT NULL,
    setting_val TEXT NOT NULL,
    description TEXT,
    modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Chat system tables
CREATE TABLE chats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_txn FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

CREATE TABLE chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_id INT NOT NULL,
    sender_id INT NOT NULL,
    message TEXT NOT NULL,
    message_type ENUM('text','img','sys') DEFAULT 'text',
    is_read BOOLEAN DEFAULT FALSE,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_msg_chat FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE chat_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_id INT NOT NULL,
    reporter_id INT NOT NULL,
    reported_id INT NOT NULL,
    message_id INT,
    reason ENUM('spam','abuse','scam','other') NOT NULL,
    description TEXT,
    status ENUM('pending','checked','closed') DEFAULT 'pending',
    reviewed TIMESTAMP,
    staff_id INT,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_report_chat FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    CONSTRAINT fk_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_accused FOREIGN KEY (reported_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_report_msg FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE SET NULL,
    CONSTRAINT fk_report_staff FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX idx_user_email ON users(email);
CREATE INDEX idx_user_student ON users(student_no);
CREATE INDEX idx_books_owner ON books(owner_id);
CREATE INDEX idx_txn_status ON transactions(status);
CREATE INDEX idx_feedback_rating ON feedback(rating);
CREATE INDEX idx_credit_user_time ON credit_history(user_id, created);
CREATE INDEX idx_msg_chat_time ON chat_messages(chat_id, created);

INSERT INTO users 
(email, student_no, fname, lname, pass_hash, course, year, phone_no, is_verified)
VALUES
(
  'testuser@plv.edu.ph',
  '21-5679',
  'Test',
  'User',
  '$2a$10$wHnNn4Zcml91GVyTdfhcuOV1pW6uZBZPUIWb7pJUNVYjvqZgQk0Cq', -- same hash for "test1234"
  'BSIT',
  2,
  '09997776666',
  1
);

SELECT * 
FROM users
WHERE email = 'testuser@plv.edu.ph';