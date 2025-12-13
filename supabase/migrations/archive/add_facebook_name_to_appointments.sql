-- Add facebook_name column to appointments table
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS facebook_name TEXT;
