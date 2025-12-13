-- Migration: Add setup fields to bot_settings
-- Run this in Supabase SQL Editor

ALTER TABLE bot_settings
ADD COLUMN IF NOT EXISTS business_name TEXT,
ADD COLUMN IF NOT EXISTS business_description TEXT,
ADD COLUMN IF NOT EXISTS setup_step INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_setup_completed BOOLEAN DEFAULT FALSE;
