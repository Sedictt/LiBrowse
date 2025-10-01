-- PLV Book Exchange Platform Database Schema
CREATE DATABASE IF NOT EXISTS plv_book_exchange;
USE plv_book_exchange;

-- Users table with verification and credit system
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_id VARCHAR(20) UNIQUE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(15),
    program VARCHAR(100) NOT NULL, -- Accountancy, Education, Engineering, etc.
    year_level INT NOT NULL,
    credits INT DEFAULT 100, -- Starting credits
    is_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    verification_expires DATETIME,
    profile_image VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    status ENUM('active', 'suspended', 'inactive') DEFAULT 'active'
);

-- Books table
CREATE TABLE books (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    isbn VARCHAR(20),
    course_code VARCHAR(20) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    edition VARCHAR(50),
    publisher VARCHAR(100),
    publication_year INT,
    condition_rating ENUM('excellent', 'good', 'fair', 'poor') NOT NULL,
    description TEXT,
    cover_image VARCHAR(255),
    owner_id INT NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    minimum_credits INT DEFAULT 0, -- Minimum credits required to borrow
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_course_code (course_code),
    INDEX idx_subject (subject),
    INDEX idx_availability (is_available)
);

-- Borrowing transactions (following SRS specifications)
CREATE TABLE transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    book_id INT NOT NULL,
    borrower_id INT NOT NULL,
    lender_id INT NOT NULL,
    request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_date TIMESTAMP NULL,
    borrowed_date TIMESTAMP NULL,
    expected_return_date DATE NULL,
    actual_return_date TIMESTAMP NULL,
    status ENUM('pending', 'approved', 'rejected', 'borrowed', 'returned', 'overdue', 'completed', 'cancelled') DEFAULT 'pending',
    request_message TEXT, -- Borrower's request message
    borrower_contact VARCHAR(255), -- Contact info provided by borrower
    borrower_address TEXT, -- Address for pickup/delivery
    pickup_method ENUM('pickup', 'meetup', 'delivery') DEFAULT 'pickup',
    pickup_location VARCHAR(255), -- Where to meet/pickup
    preferred_pickup_time DATETIME NULL, -- Borrower's preferred pickup time
    borrow_duration ENUM('1-week', '2-weeks', '3-weeks', '1-month', 'custom') NULL, -- How long they want to borrow
    borrower_notes TEXT,
    lender_notes TEXT,
    rejection_reason TEXT, -- Reason if rejected
    return_condition ENUM('excellent', 'good', 'fair', 'poor', 'damaged') NULL, -- Condition when returned
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (borrower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lender_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_status (status),
    INDEX idx_borrower (borrower_id),
    INDEX idx_lender (lender_id),
    INDEX idx_book (book_id)
);

-- Feedback and rating system (following SRS specifications)
CREATE TABLE feedback (
    id INT PRIMARY KEY AUTO_INCREMENT,
    transaction_id INT NOT NULL,
    reviewer_id INT NOT NULL, -- Who is giving the feedback
    reviewee_id INT NOT NULL, -- Who is receiving the feedback
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    feedback_type ENUM('lender_to_borrower', 'borrower_to_lender') NOT NULL,
    book_condition_rating ENUM('excellent', 'good', 'fair', 'poor', 'damaged') NULL, -- For lender feedback on book condition
    return_timeliness ENUM('early', 'on_time', 'late') NULL, -- For lender feedback on return timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_feedback (transaction_id, reviewer_id, feedback_type)
);

-- Credit history for tracking credit changes
CREATE TABLE credit_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    transaction_id INT,
    credit_change INT NOT NULL, -- Positive for gains, negative for deductions
    reason VARCHAR(255) NOT NULL,
    previous_credits INT NOT NULL,
    new_credits INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);

-- Notifications system
CREATE TABLE notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('transaction', 'credit', 'system', 'reminder') NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    related_id INT, -- Can reference transaction_id, book_id, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_unread (user_id, is_read)
);

-- System settings
CREATE TABLE settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO settings (setting_key, setting_value, description) VALUES
('max_borrow_days', '14', 'Maximum number of days a book can be borrowed'),
('credit_deduction_overdue', '5', 'Credits deducted per day when book is overdue'),
('credit_reward_good_return', '2', 'Credits awarded for returning book in good condition'),
('min_credits_to_borrow', '10', 'Minimum credits required to make a borrow request'),
('max_active_borrows', '3', 'Maximum number of books a user can borrow simultaneously');

-- Chat system tables
CREATE TABLE chats (
    id INT PRIMARY KEY AUTO_INCREMENT,
    transaction_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

CREATE TABLE chat_messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    chat_id INT NOT NULL,
    sender_id INT NOT NULL,
    message TEXT NOT NULL,
    message_type ENUM('text', 'system', 'image') DEFAULT 'text',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE chat_reports (
    id INT PRIMARY KEY AUTO_INCREMENT,
    chat_id INT NOT NULL,
    reporter_id INT NOT NULL,
    reported_user_id INT NOT NULL,
    message_id INT,
    reason ENUM('spam', 'harassment', 'inappropriate_content', 'scam', 'other') NOT NULL,
    description TEXT,
    status ENUM('pending', 'reviewed', 'resolved', 'dismissed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    reviewed_by INT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE SET NULL,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_student_id ON users(student_id);
CREATE INDEX idx_books_owner ON books(owner_id);
CREATE INDEX idx_transactions_dates ON transactions(request_date, borrowed_date, actual_return_date);
CREATE INDEX idx_feedback_rating ON feedback(rating);
CREATE INDEX idx_credit_history_user ON credit_history(user_id, created_at);
CREATE INDEX idx_chats_transaction ON chats(transaction_id);
CREATE INDEX idx_chat_messages_chat ON chat_messages(chat_id, created_at);
CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX idx_chat_reports_status ON chat_reports(status, created_at);

-- Insert sample data for demonstration
-- Sample users (passwords are hashed version of 'password123')
INSERT INTO users (student_id, first_name, last_name, email, password_hash, phone, program, year_level, credits, is_verified) VALUES
('21-0001', 'Maria', 'Santos', 'maria.santos@plv.edu.ph', '$2a$12$LQv3c1yqBwEHFl5aysHCFOC4LtjWbOFXdpr5wGRVJ/9SM/4V9/VPW', '09123456789', 'Accountancy', 3, 120, TRUE),
('21-0002', 'Juan', 'Cruz', 'juan.cruz@plv.edu.ph', '$2a$12$LQv3c1yqBwEHFl5aysHCFOC4LtjWbOFXdpr5wGRVJ/9SM/4V9/VPW', '09234567890', 'Engineering', 2, 95, TRUE),
('21-0003', 'Ana', 'Reyes', 'ana.reyes@plv.edu.ph', '$2a$12$LQv3c1yqBwEHFl5aysHCFOC4LtjWbOFXdpr5wGRVJ/9SM/4V9/VPW', '09345678901', 'Education', 4, 110, TRUE),
('21-0004', 'Carlos', 'Garcia', 'carlos.garcia@plv.edu.ph', '$2a$12$LQv3c1yqBwEHFl5aysHCFOC4LtjWbOFXdpr5wGRVJ/9SM/4V9/VPW', '09456789012', 'Information Technology', 3, 85, TRUE);

-- Sample books with credit requirements based on condition and value
INSERT INTO books (title, author, isbn, course_code, subject, edition, publisher, publication_year, condition_rating, description, owner_id, is_available, minimum_credits) VALUES
('Financial Accounting Fundamentals', 'Warren, Reeve & Duchac', '978-1337272094', 'ACCT101', 'Financial Accounting', '15th Edition', 'Cengage Learning', 2020, 'excellent', 'Comprehensive textbook covering fundamental accounting principles and practices. Includes practice problems and real-world examples.', 1, TRUE, 120),
('Calculus: Early Transcendentals', 'James Stewart', '978-1285741550', 'MATH101', 'Calculus I', '8th Edition', 'Cengage Learning', 2019, 'good', 'Essential calculus textbook with clear explanations and extensive problem sets. Great for engineering students.', 2, TRUE, 100),
('Educational Psychology', 'Anita Woolfolk', '978-0134524825', 'EDUC201', 'Educational Psychology', '13th Edition', 'Pearson', 2018, 'good', 'Explores how students learn and develop, with practical applications for teaching. Includes case studies and research findings.', 3, TRUE, 100),
('Introduction to Programming with Java', 'Daniel Liang', '978-0134670942', 'CS101', 'Programming Fundamentals', '11th Edition', 'Pearson', 2017, 'fair', 'Comprehensive introduction to Java programming. Some highlighting and notes in margins, but all content is readable.', 4, TRUE, 80),
('Intermediate Accounting', 'Kieso, Weygandt & Warfield', '978-1119503668', 'ACCT201', 'Intermediate Accounting', '17th Edition', 'Wiley', 2019, 'excellent', 'Advanced accounting concepts and principles. Perfect condition, barely used. Essential for accounting majors.', 1, TRUE, 130),
('Physics for Engineers and Scientists', 'Raymond Serway', '978-1305537200', 'PHYS101', 'Physics I', '10th Edition', 'Cengage Learning', 2018, 'good', 'Comprehensive physics textbook with engineering applications. Includes online access code (unused).', 2, FALSE, 110),
('Child Development Theories', 'Laura Berk', '978-0134419724', 'EDUC301', 'Child Development', '9th Edition', 'Pearson', 2020, 'excellent', 'In-depth exploration of child development from infancy through adolescence. Includes latest research findings.', 3, TRUE, 120),
('Data Structures and Algorithms', 'Michael Goodrich', '978-1118771334', 'CS201', 'Data Structures', '6th Edition', 'Wiley', 2016, 'fair', 'Fundamental concepts in data structures and algorithms. Some wear on cover but content is complete and readable.', 4, TRUE, 80);

-- Sample transactions to show system activity
INSERT INTO transactions (book_id, borrower_id, lender_id, request_date, approved_date, borrowed_date, expected_return_date, actual_return_date, status, borrower_notes, lender_notes) VALUES
(6, 1, 2, '2024-01-15 10:30:00', '2024-01-15 14:20:00', '2024-01-16 09:00:00', '2024-01-30', '2024-01-28 16:45:00', 'returned', 'Need this for my physics class. Will take good care of it!', 'Book returned in good condition. Responsible borrower.'),
(2, 3, 2, '2024-01-20 11:15:00', '2024-01-20 15:30:00', '2024-01-21 10:00:00', '2024-02-04', '2024-02-03 14:20:00', 'returned', 'Required for my calculus course this semester.', 'Excellent borrower, returned on time.');

-- Sample feedback
INSERT INTO feedback (transaction_id, reviewer_id, reviewee_id, rating, comment, feedback_type) VALUES
(1, 2, 1, 5, 'Very responsible borrower! Returned the book on time and in perfect condition. Highly recommended.', 'borrower'),
(1, 1, 2, 5, 'Great lender! Book was exactly as described and pickup was convenient. Thank you!', 'lender'),
(2, 2, 3, 4, 'Good borrower, returned book on time. Minor highlighting added but nothing major.', 'borrower'),
(2, 3, 2, 5, 'Excellent condition book and very helpful lender. Would borrow again!', 'lender');

-- Sample credit history
INSERT INTO credit_history (user_id, transaction_id, credit_change, reason, previous_credits, new_credits) VALUES
(1, 1, 2, 'Book returned on time', 118, 120),
(1, 1, 3, 'Received 5-star feedback', 120, 123),
(3, 2, 2, 'Book returned on time', 108, 110),
(3, 2, 1, 'Received 4-star feedback', 110, 111);

-- Sample notifications
INSERT INTO notifications (user_id, title, message, type, is_read, related_id) VALUES
(1, 'New Borrow Request', 'Juan Cruz wants to borrow "Financial Accounting Fundamentals"', 'transaction', TRUE, 1),
(2, 'Request Approved', 'Your request to borrow "Calculus: Early Transcendentals" has been approved', 'transaction', TRUE, 2),
(1, 'Book Returned', 'Your book "Financial Accounting Fundamentals" has been returned', 'transaction', TRUE, 1),
(2, 'New Feedback', 'You received a 5-star rating from Maria Santos', 'feedback', FALSE, 1);
