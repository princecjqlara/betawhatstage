-- Add split_messages setting to bot_settings table
-- This enables sending messages in "cut cut" form (each sentence as separate message)

ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS split_messages BOOLEAN DEFAULT false;

COMMENT ON COLUMN bot_settings.split_messages IS 'When true, AI responses will be split into separate messages by sentence';
