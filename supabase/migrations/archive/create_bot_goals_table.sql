-- Migration: Create bot_goals table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS bot_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_type TEXT NOT NULL DEFAULT 'email' CHECK (goal_type IN ('email', 'phone')),
  is_active BOOLEAN DEFAULT false,
  cooldown_hours INT DEFAULT 24,
  description TEXT DEFAULT 'Please ask for your email address so we can send you more information.',
  success_message TEXT DEFAULT 'Thank you! We will be in touch soon.',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default goal (inactive by default)
INSERT INTO bot_goals (goal_type, is_active, cooldown_hours, description, success_message) 
VALUES ('email', false, 24, 'Please ask for your email address so we can send you more information.', 'Thank you! We will be in touch soon.')
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE bot_goals ENABLE ROW LEVEL SECURITY;

-- Allow all operations (adjust based on your auth setup)
CREATE POLICY "Allow all operations on bot_goals" ON bot_goals
  FOR ALL USING (true) WITH CHECK (true);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_bot_goals_updated_at ON bot_goals;
CREATE TRIGGER update_bot_goals_updated_at
  BEFORE UPDATE ON bot_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add goal_met_at column to leads table to track when the goal was met for cooldown
ALTER TABLE leads ADD COLUMN IF NOT EXISTS goal_met_at TIMESTAMPTZ;
