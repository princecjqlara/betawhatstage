-- Add ai_model column to bot_settings table if it doesn't exist
ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'qwen/qwen3-235b-a22b';

-- Update existing rows to have the default value if null
UPDATE bot_settings 
SET ai_model = 'qwen/qwen3-235b-a22b' 
WHERE ai_model IS NULL;
