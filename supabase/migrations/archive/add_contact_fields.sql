-- Migration: Add contact info fields to leads table
-- Run this in Supabase SQL Editor

-- Add phone and email columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;

-- Add index for faster queries when searching by phone or email
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email) WHERE email IS NOT NULL;
