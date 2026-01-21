-- Migration 0007: Add Weekly Claiming System for Bantah Points
-- This migration adds support for weekly claiming windows on points

-- Add last_claimed_at column to track when user last claimed their points
ALTER TABLE user_points_ledgers 
ADD COLUMN IF NOT EXISTS last_claimed_at TIMESTAMP;

-- Create index for faster weekly claiming queries
CREATE INDEX IF NOT EXISTS idx_user_points_last_claimed 
ON user_points_ledgers(last_claimed_at);

-- Add comment for documentation
COMMENT ON COLUMN user_points_ledgers.last_claimed_at IS 'Timestamp of when user last claimed their weekly points. Used to enforce weekly claiming window (can only claim once per week on Sundays)';
