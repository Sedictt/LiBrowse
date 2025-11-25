-- Migration: Verification Credit Rewards System
-- Adds settings for verification credit rewards at each level
-- Level 1 (Verified): Either email OR document verified
-- Level 2 (Fully Verified): Both email AND document verified

-- Verification credit reward settings
INSERT INTO settings (setting_name, setting_val, description) VALUES
('verification_reward_level_1', '15', 'Credits awarded when user reaches Verified status (either email or document verified)'),
('verification_reward_level_2', '15', 'Additional credits awarded when user reaches Fully Verified status (both email and document verified)'),
('verification_rewards_enabled', 'true', 'Enable or disable verification credit rewards')
ON DUPLICATE KEY UPDATE setting_val = VALUES(setting_val);

-- Add columns to track which verification rewards have been claimed
-- This prevents duplicate reward claims
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS verification_reward_l1_claimed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS verification_reward_l2_claimed BOOLEAN DEFAULT FALSE;
