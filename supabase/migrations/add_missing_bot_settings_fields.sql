-- ============================================================================
-- ADD MISSING BOT SETTINGS FIELDS
-- Run this migration if you already ran 00_complete_migration.sql
-- This adds the missing fields: primary_goal and auto_follow_up_enabled
-- ============================================================================

-- Add primary_goal column to bot_settings table
ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS primary_goal TEXT DEFAULT 'lead_generation';

-- Add CHECK constraint for primary_goal
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'bot_settings' 
    AND constraint_name = 'bot_settings_primary_goal_check'
  ) THEN
    ALTER TABLE bot_settings 
    ADD CONSTRAINT bot_settings_primary_goal_check 
    CHECK (primary_goal IN ('lead_generation', 'appointment_booking', 'tripping', 'purchase'));
  END IF;
END $$;

-- Add comment for primary_goal
COMMENT ON COLUMN bot_settings.primary_goal IS 'Primary bot objective: lead_generation, appointment_booking, tripping (real estate), or purchase (e-commerce)';

-- Add auto_follow_up_enabled column to bot_settings table
ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS auto_follow_up_enabled BOOLEAN DEFAULT false;

-- Add comment for auto_follow_up_enabled
COMMENT ON COLUMN bot_settings.auto_follow_up_enabled IS 'When true, the bot will automatically send follow-up messages to inactive leads';

-- Update existing rows to have default values
UPDATE bot_settings 
SET primary_goal = 'lead_generation' 
WHERE primary_goal IS NULL;

UPDATE bot_settings 
SET auto_follow_up_enabled = false 
WHERE auto_follow_up_enabled IS NULL;

