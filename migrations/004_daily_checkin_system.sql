
-- Migration: Daily Check-in Claim System with 7-day Timeline
-- Creates table to track user daily check-ins with claim-based rewards

CREATE TABLE IF NOT EXISTS daily_checkins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    checkin_date DATE NOT NULL,
    day_number INT NOT NULL CHECK (day_number BETWEEN 1 AND 7),
    reward_amount INT NOT NULL DEFAULT 5,
    claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    streak_count INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_checkin_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_date (user_id, checkin_date)
);

-- Index for fast lookups
CREATE INDEX idx_checkin_user_date ON daily_checkins(user_id, checkin_date DESC);
CREATE INDEX idx_checkin_date ON daily_checkins(checkin_date);

-- Daily check-in rewards configuration
-- Day 1-6: 5 credits each
-- Day 7: 20 credits (bonus for completing the week)
INSERT INTO settings (setting_name, setting_val, description) VALUES
('daily_checkin_reward_day_1_6', '5', 'Credits awarded for days 1-6 of daily check-in'),
('daily_checkin_reward_day_7', '20', 'Bonus credits awarded for completing 7-day streak'),
('daily_checkin_enabled', 'true', 'Enable or disable daily check-in system')
ON DUPLICATE KEY UPDATE setting_val = VALUES(setting_val);
