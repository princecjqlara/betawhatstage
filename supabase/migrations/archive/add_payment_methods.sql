-- Migration: Add Payment Methods Feature
-- Run this in Supabase SQL Editor

-- ============================================================================
-- PART 1: UPDATE KNOWLEDGE_CATEGORIES TYPE CONSTRAINT
-- ============================================================================

-- First, drop the existing constraint
ALTER TABLE knowledge_categories DROP CONSTRAINT IF EXISTS knowledge_categories_type_check;

-- Add new constraint that includes 'payment_method'
ALTER TABLE knowledge_categories ADD CONSTRAINT knowledge_categories_type_check 
  CHECK (type IN ('general', 'qa', 'payment_method'));

-- ============================================================================
-- PART 2: CREATE PAYMENT_METHODS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES knowledge_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_name TEXT,
  account_number TEXT,
  qr_code_url TEXT,
  instructions TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries by category
CREATE INDEX IF NOT EXISTS idx_payment_methods_category ON payment_methods(category_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations
CREATE POLICY "Allow all operations on payment_methods" ON payment_methods
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON payment_methods;
CREATE TRIGGER update_payment_methods_updated_at
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
