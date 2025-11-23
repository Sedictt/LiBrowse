-- Migration: Add daily check-in timeline tracking
-- This allows tracking of the 7-day check-in history for users

-- Add columns to users table for check-in tracking
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS last_daily_login_reward DATE NULL COMMENT 'Last date user claimed daily login reward',
ADD COLUMN IF NOT EXISTS times_hit_threshold INT DEFAULT 0 COMMENT 'Number of times user hit credit threshold (for penalty system)',
ADD COLUMN IF NOT EXISTS account_status ENUM('active', 'warned', 'restricted', 'banned') DEFAULT 'active' COMMENT 'Account status for penalty system',
ADD COLUMN IF NOT EXISTS daily_checkin_streak INT DEFAULT 0 COMMENT 'Current consecutive daily check-in streak';

-- Create daily_checkins table to track the 7-day history
CREATE TABLE IF NOT EXISTS daily_checkins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    checkin_date DATE NOT NULL,
    reward_amount INT NOT NULL DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_checkin_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_date (user_id, checkin_date),
    INDEX idx_user_date (user_id, checkin_date DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Tracks daily check-in history for 7-day timeline';

-- Insert historical data from credit_history if available
INSERT INTO daily_checkins (user_id, checkin_date, reward_amount, created_at)
SELECT 
    user_id, 
    DATE(created) as checkin_date,
    credit_change as reward_amount,
    created as created_at
FROM credit_history
WHERE remark = 'Daily login reward'
    AND DATE(created) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
ON DUPLICATE KEY UPDATE 
    reward_amount = VALUES(reward_amount),
    created_at = VALUES(created_at);
