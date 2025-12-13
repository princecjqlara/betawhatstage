-- Add page_id column to leads table for storing Facebook Page ID
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS page_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_page_id ON leads(page_id);
