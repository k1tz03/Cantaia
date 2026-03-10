-- Migration 048: Add onboarding_completed flag to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- All existing users are considered onboarded
UPDATE users SET onboarding_completed = true;
