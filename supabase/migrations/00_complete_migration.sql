-- ============================================================================
-- COMPLETE MIGRATION SCRIPT FOR APHELION-PHOTON
-- Run this in Supabase SQL Editor to set up all required tables
-- ============================================================================

-- ============================================================================
-- PART 0: UTILITY FUNCTIONS
-- ============================================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- PART 1: DOCUMENTS TABLE (RAG Knowledge Base)
-- ============================================================================

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding VECTOR(1024),  -- nvidia/nv-embedqa-e5-v5 outputs 1024 dimensions
  folder_id UUID,
  category_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Policy for documents
CREATE POLICY "Allow all operations on documents" ON documents
  FOR ALL USING (true) WITH CHECK (true);

-- Match documents function for semantic search
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1024),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- PART 2: DOCUMENT FOLDERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_folders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key to documents table (if not already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'documents_folder_id_fkey'
  ) THEN
    ALTER TABLE documents 
      ADD CONSTRAINT documents_folder_id_fkey 
      FOREIGN KEY (folder_id) REFERENCES document_folders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on document_folders" ON document_folders
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 3: KNOWLEDGE CATEGORIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('general', 'qa')),
  color TEXT DEFAULT 'gray',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key to documents table (if not already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'documents_category_id_fkey'
  ) THEN
    ALTER TABLE documents 
      ADD CONSTRAINT documents_category_id_fkey 
      FOREIGN KEY (category_id) REFERENCES knowledge_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE knowledge_categories ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on knowledge_categories" ON knowledge_categories
  FOR ALL USING (true) WITH CHECK (true);
-- Insert default categories
INSERT INTO knowledge_categories (name, type, color) VALUES
  ('General', 'general', 'gray'),
  ('Pricing', 'general', 'green'),
  ('FAQs', 'qa', 'blue'),
  ('Product Info', 'general', 'purple')
ON CONFLICT DO NOTHING;
-- ============================================================================
-- PART 4: BOT SETTINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS bot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_name TEXT DEFAULT 'Assistant',
  bot_tone TEXT DEFAULT 'helpful and professional',
  facebook_verify_token TEXT DEFAULT 'TEST_TOKEN',
  facebook_page_access_token TEXT,
  human_takeover_timeout_minutes INT DEFAULT 5,
  primary_goal TEXT DEFAULT 'lead_generation' CHECK (primary_goal IN ('lead_generation', 'appointment_booking', 'tripping', 'purchase')),
  auto_follow_up_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default row if not exists
INSERT INTO bot_settings (bot_name, bot_tone, facebook_verify_token) 
VALUES ('Assistant', 'helpful and professional', 'TEST_TOKEN')
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on bot_settings" ON bot_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Comments
COMMENT ON COLUMN bot_settings.primary_goal IS 'Primary bot objective: lead_generation, appointment_booking, tripping (real estate), or purchase (e-commerce)';
COMMENT ON COLUMN bot_settings.auto_follow_up_enabled IS 'When true, the bot will automatically send follow-up messages to inactive leads';

-- ============================================================================
-- PART 5: BOT RULES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  priority INT DEFAULT 0,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE bot_rules ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on bot_rules" ON bot_rules
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_bot_rules_updated_at ON bot_rules;
CREATE TRIGGER update_bot_rules_updated_at
  BEFORE UPDATE ON bot_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 6: BOT INSTRUCTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructions TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE bot_instructions ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on bot_instructions" ON bot_instructions
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_bot_instructions_updated_at ON bot_instructions;
CREATE TRIGGER update_bot_instructions_updated_at
  BEFORE UPDATE ON bot_instructions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 7: CONVERSATIONS TABLE (Chat History)
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_conversations_sender_id ON conversations(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on conversations" ON conversations
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 8: PIPELINE STAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#64748b',
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default pipeline stages
INSERT INTO pipeline_stages (name, display_order, color, is_default) VALUES
  ('New Lead', 0, '#3b82f6', true),
  ('Interested', 1, '#8b5cf6', false),
  ('Qualified', 2, '#f59e0b', false),
  ('Negotiating', 3, '#10b981', false),
  ('Won', 4, '#22c55e', false),
  ('Lost', 5, '#ef4444', false)
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on pipeline_stages" ON pipeline_stages
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_pipeline_stages_updated_at ON pipeline_stages;
CREATE TRIGGER update_pipeline_stages_updated_at
  BEFORE UPDATE ON pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 9: LEADS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL UNIQUE,
  name TEXT,
  profile_pic TEXT,
  phone TEXT,
  email TEXT,
  current_stage_id UUID REFERENCES pipeline_stages(id),
  message_count INT DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_analyzed_at TIMESTAMPTZ,
  ai_classification_reason TEXT,
  bot_disabled BOOLEAN DEFAULT false,
  bot_disabled_reason TEXT,
  receipt_image_url TEXT,
  receipt_detected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_sender_id ON leads(sender_id);
CREATE INDEX IF NOT EXISTS idx_leads_current_stage ON leads(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_receipt_detected ON leads(receipt_detected_at) 
  WHERE receipt_detected_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email) WHERE email IS NOT NULL;

-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on leads" ON leads
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 10: LEAD STAGE HISTORY TABLE (Audit Trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES pipeline_stages(id),
  to_stage_id UUID REFERENCES pipeline_stages(id),
  reason TEXT,
  changed_by TEXT DEFAULT 'ai',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead ON lead_stage_history(lead_id);

-- Enable RLS
ALTER TABLE lead_stage_history ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on lead_stage_history" ON lead_stage_history
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 11: WORKFLOWS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger_stage_id UUID REFERENCES pipeline_stages(id),
  workflow_data JSONB NOT NULL DEFAULT '{"nodes": [], "edges": []}'::jsonb,
  is_published BOOLEAN DEFAULT false,
  apply_to_existing BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflows_trigger_stage ON workflows(trigger_stage_id);
CREATE INDEX IF NOT EXISTS idx_workflows_published ON workflows(is_published);

-- Enable RLS
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on workflows" ON workflows
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_workflows_updated_at ON workflows;
CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comment for documentation
COMMENT ON COLUMN workflows.apply_to_existing IS 'When true, publishing this workflow will trigger it for all leads currently in the trigger stage';

-- ============================================================================
-- PART 12: WORKFLOW EXECUTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  current_node_id TEXT,
  execution_data JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'stopped')),
  scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_lead ON workflow_executions(lead_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_scheduled ON workflow_executions(scheduled_for)
  WHERE status = 'pending' AND scheduled_for IS NOT NULL;

-- Enable RLS
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on workflow_executions" ON workflow_executions
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_workflow_executions_updated_at ON workflow_executions;
CREATE TRIGGER update_workflow_executions_updated_at
  BEFORE UPDATE ON workflow_executions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 13: HUMAN TAKEOVER SESSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS human_takeover_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_sender_id TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_human_message_at TIMESTAMPTZ DEFAULT NOW(),
  timeout_minutes INT DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_human_takeover_sender ON human_takeover_sessions(lead_sender_id);

-- Enable RLS
ALTER TABLE human_takeover_sessions ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on human_takeover_sessions" ON human_takeover_sessions
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 14: CONNECTED PAGES TABLE (Facebook OAuth)
-- ============================================================================

CREATE TABLE IF NOT EXISTS connected_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT NOT NULL UNIQUE,
  page_name TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  user_access_token TEXT,
  is_active BOOLEAN DEFAULT true,
  webhook_subscribed BOOLEAN DEFAULT false,
  profile_pic TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connected_pages_page_id ON connected_pages(page_id);
CREATE INDEX IF NOT EXISTS idx_connected_pages_is_active ON connected_pages(is_active);

-- Enable RLS
ALTER TABLE connected_pages ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on connected_pages" ON connected_pages
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_connected_pages_updated_at ON connected_pages;
CREATE TRIGGER update_connected_pages_updated_at
  BEFORE UPDATE ON connected_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 15: PRODUCT CATEGORIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for ordering
CREATE INDEX IF NOT EXISTS idx_product_categories_order ON product_categories(display_order);

-- Enable RLS
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations
CREATE POLICY "Allow all operations on product_categories" ON product_categories
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_product_categories_updated_at ON product_categories;
CREATE TRIGGER update_product_categories_updated_at
  BEFORE UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default category
INSERT INTO product_categories (name, description, color) VALUES
  ('General', 'Default product category', '#6B7280')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 16: PRODUCTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2),
  currency TEXT DEFAULT 'PHP',
  image_url TEXT,
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_order ON products(display_order);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations
CREATE POLICY "Allow all operations on products" ON products
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 17: PRODUCT VARIATION TYPES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_variation_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE product_variation_types ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on product_variation_types" ON product_variation_types
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_product_variation_types_updated_at ON product_variation_types;
CREATE TRIGGER update_product_variation_types_updated_at
  BEFORE UPDATE ON product_variation_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default variation types
INSERT INTO product_variation_types (name, display_order) VALUES
  ('Size', 1),
  ('Color', 2)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 18: PRODUCT VARIATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variation_type_id UUID NOT NULL REFERENCES product_variation_types(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, variation_type_id, value)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_variations_product_id ON product_variations(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variations_type_id ON product_variations(variation_type_id);

-- Enable RLS
ALTER TABLE product_variations ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on product_variations" ON product_variations
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_product_variations_updated_at ON product_variations;
CREATE TRIGGER update_product_variations_updated_at
  BEFORE UPDATE ON product_variations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

-- This script creates all 18 tables required for Aphelion-Photon:
-- 1. documents - RAG knowledge base with vector embeddings
-- 2. document_folders - Folder organization for documents
-- 3. knowledge_categories - Category system for knowledge base
-- 4. bot_settings - Bot configuration (name, tone, tokens)
-- 5. bot_rules - Custom rules for the chatbot
-- 6. bot_instructions - Extended bot instructions
-- 7. conversations - Chat history by sender
-- 8. pipeline_stages - CRM pipeline stages
-- 9. leads - Lead management
-- 10. lead_stage_history - Audit trail for lead movements
-- 11. workflows - Automation workflows
-- 12. workflow_executions - Workflow execution tracking
-- 13. human_takeover_sessions - Human agent takeover tracking
-- 14. connected_pages - Facebook OAuth connected pages
-- 15. product_categories - Product category organization
-- 16. products - Store products with pricing
-- 17. product_variation_types - Variation types (Size, Color, etc.)
-- 18. product_variations - Product-specific variations with prices


-- -----------------------------------------------------------------------------
-- STORE SETUP & REAL ESTATE (Added Dec 2024)
-- -----------------------------------------------------------------------------

-- 19. store_settings - Store configuration and type
CREATE TABLE IF NOT EXISTS store_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_name TEXT NOT NULL,
    store_type TEXT NOT NULL CHECK (store_type IN ('ecommerce', 'real_estate')),
    setup_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on store_settings" ON store_settings
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_store_settings_updated_at ON store_settings;
CREATE TRIGGER update_store_settings_updated_at
  BEFORE UPDATE ON store_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 20. properties - Real Estate Listings
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    price DECIMAL(12, 2),
    currency TEXT DEFAULT 'PHP',
    address TEXT,
    bedrooms INT,
    bathrooms INT,
    sqft DECIMAL(10, 2),
    status TEXT DEFAULT 'for_sale' CHECK (status IN ('for_sale', 'for_rent', 'sold', 'rented')),
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    property_type TEXT,
    year_built INT,
    lot_area DECIMAL(10, 2),
    garage_spaces INT,
    down_payment DECIMAL(12, 2),
    monthly_amortization DECIMAL(12, 2),
    payment_terms TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on properties" ON properties
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_properties_updated_at ON properties;
CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);
CREATE INDEX IF NOT EXISTS idx_properties_active ON properties(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(property_type);


-- ============================================================================
-- NEW MIGRATIONS (Dec 14 2025)
-- ============================================================================

-- ============================================================================
-- APPOINTMENTS TABLES MIGRATION
-- Run this in Supabase SQL Editor to add appointment booking support
-- ============================================================================

-- ============================================================================
-- APPOINTMENT SETTINGS TABLE
-- Configurable business hours and slot duration
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_hours_start TIME NOT NULL DEFAULT '09:00:00',
  business_hours_end TIME NOT NULL DEFAULT '17:00:00',
  slot_duration_minutes INT NOT NULL DEFAULT 60,
  days_available INT[] DEFAULT ARRAY[1,2,3,4,5], -- 0=Sunday, 1=Monday, etc.
  booking_lead_time_hours INT DEFAULT 24, -- How far in advance bookings must be made
  max_advance_booking_days INT DEFAULT 30, -- Maximum days in advance to book
  buffer_between_slots_minutes INT DEFAULT 0, -- Buffer time between appointments
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE appointment_settings ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on appointment_settings" ON appointment_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_appointment_settings_updated_at ON appointment_settings;
CREATE TRIGGER update_appointment_settings_updated_at
  BEFORE UPDATE ON appointment_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default settings
INSERT INTO appointment_settings (
  business_hours_start, 
  business_hours_end, 
  slot_duration_minutes,
  days_available
) VALUES (
  '09:00:00', 
  '17:00:00', 
  60,
  ARRAY[1,2,3,4,5]
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- APPOINTMENTS TABLE
-- Stores booked appointments with Facebook user reference
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_psid TEXT NOT NULL, -- Facebook sender PSID for tracking
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  page_id TEXT, -- Reference to the Facebook page this appointment is for
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_appointments_sender_psid ON appointments(sender_psid);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_date_time ON appointments(appointment_date, start_time);

-- Enable RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on appointments" ON appointments
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;
CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DISABLED DATES TABLE (Optional - for holidays, maintenance, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointment_disabled_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disabled_date DATE NOT NULL UNIQUE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE appointment_disabled_dates ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on appointment_disabled_dates" ON appointment_disabled_dates
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- HELPFUL VIEWS
-- ============================================================================

-- View for upcoming appointments with lead info
CREATE OR REPLACE VIEW upcoming_appointments AS
SELECT 
  a.*,
  l.name as lead_name,
  l.profile_pic as lead_profile_pic,
  l.phone as lead_phone,
  l.email as lead_email
FROM appointments a
LEFT JOIN leads l ON a.sender_psid = l.sender_id
WHERE a.appointment_date >= CURRENT_DATE
  AND a.status IN ('pending', 'confirmed')
ORDER BY a.appointment_date, a.start_time;


-- Migration: Create Orders and Order Items Tables
-- Run this in Supabase SQL Editor

-- ============================================================================
-- 1. ORDERS TABLE (Carts)
-- ============================================================================

CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled');

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  status order_status DEFAULT 'pending',
  total_amount DECIMAL(10, 2) DEFAULT 0.00,
  currency TEXT DEFAULT 'PHP',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding open carts (pending orders) for a lead
CREATE INDEX IF NOT EXISTS idx_orders_lead_status ON orders(lead_id, status);

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on orders" ON orders
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 2. ORDER ITEMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL, -- Snapshot of name in case product is deleted
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  total_price DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  variations JSONB, -- Store selected options e.g. {"Size": "M", "Color": "Red"}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying items in an order
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- Enable RLS
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on order_items" ON order_items
  FOR ALL USING (true) WITH CHECK (true);


-- ============================================================================
-- LEAD ACTIVITIES TABLE MIGRATION
-- Tracks customer interactions like product views, property views, appointments
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'product_view',
    'property_view',
    'property_inquiry',
    'appointment_booked',
    'appointment_cancelled',
    'payment_sent'
  )),
  item_id TEXT,                -- product/property/appointment ID
  item_name TEXT,              -- human-readable name for AI context
  metadata JSONB DEFAULT '{}', -- additional details (e.g., selected variations, appointment time)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_lead_activities_sender ON lead_activities(sender_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_type ON lead_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created ON lead_activities(created_at DESC);

-- Enable RLS
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations (customize based on your auth)
CREATE POLICY "Allow all operations on lead_activities" ON lead_activities
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- ADD "Appointment Scheduled" PIPELINE STAGE IF NOT EXISTS
-- ============================================================================

INSERT INTO pipeline_stages (name, display_order, color, description)
SELECT 'Appointment Scheduled', 2, '#8b5cf6', 'Customer has booked an appointment'
WHERE NOT EXISTS (
  SELECT 1 FROM pipeline_stages WHERE name = 'Appointment Scheduled'
);


-- ============================================================================
-- CONVERSATION SUMMARIES TABLE
-- Stores AI-generated summaries of conversation history for long-term context
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  meta JSONB DEFAULT '{}'::jsonb
);

-- Index for fast retrieval by sender, ordered by time (newest first)
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_sender ON conversation_summaries(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_created_at ON conversation_summaries(created_at DESC);

-- Enable RLS
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations (adjust as needed for your auth model)
CREATE POLICY "Allow all operations on conversation_summaries" ON conversation_summaries
  FOR ALL USING (true) WITH CHECK (true);

-- Add comment
COMMENT ON TABLE conversation_summaries IS 'Stores periodic summaries of user conversations to maintain long-term context for the AI.';


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


-- Add ai_model column to bot_settings table if it doesn't exist
ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'qwen/qwen3-235b-a22b';

-- Update existing rows to have the default value if null
UPDATE bot_settings 
SET ai_model = 'qwen/qwen3-235b-a22b' 
WHERE ai_model IS NULL;


-- ============================================================================
-- APPOINTMENT WORKFLOW TRIGGER MIGRATION
-- Adds support for triggering workflows when appointments are booked
-- ============================================================================

-- Add trigger_type to workflows table
-- 'stage_change' = trigger when lead enters a pipeline stage (existing behavior)
-- 'appointment_booked' = trigger when customer books an appointment
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'stage_change' 
  CHECK (trigger_type IN ('stage_change', 'appointment_booked'));

-- Add appointment_id to workflow_executions for tracking appointment-triggered workflows
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE;

-- Create index for appointment-based execution lookups
CREATE INDEX IF NOT EXISTS idx_workflow_executions_appointment ON workflow_executions(appointment_id);

-- Comment for documentation
COMMENT ON COLUMN workflows.trigger_type IS 'Type of trigger: stage_change (pipeline stage) or appointment_booked';
COMMENT ON COLUMN workflow_executions.appointment_id IS 'Reference to appointment for appointment-triggered workflows';


-- Migration: Add contact info fields to leads table
-- Run this in Supabase SQL Editor

-- Add phone and email columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;

-- Add index for faster queries when searching by phone or email
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email) WHERE email IS NOT NULL;


-- Add facebook_name column to appointments table
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS facebook_name TEXT;


-- Add page_id column to leads table for storing Facebook Page ID
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS page_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_page_id ON leads(page_id);


-- Add checkout-related fields to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS customer_phone TEXT,
ADD COLUMN IF NOT EXISTS customer_email TEXT,
ADD COLUMN IF NOT EXISTS shipping_address TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Add index on status for faster filtering
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_lead_id ON orders(lead_id);


-- Migration: Add setup fields to bot_settings
-- Run this in Supabase SQL Editor

ALTER TABLE bot_settings
ADD COLUMN IF NOT EXISTS business_name TEXT,
ADD COLUMN IF NOT EXISTS business_description TEXT,
ADD COLUMN IF NOT EXISTS setup_step INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_setup_completed BOOLEAN DEFAULT FALSE;


-- Add split_messages setting to bot_settings table
-- This enables sending messages in "cut cut" form (each sentence as separate message)

ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS split_messages BOOLEAN DEFAULT false;

COMMENT ON COLUMN bot_settings.split_messages IS 'When true, AI responses will be split into separate messages by sentence';
-- ============================================================================
-- FOLLOW-UP TRACKING MIGRATION
-- Adds columns and tables for intelligent auto follow-up system with ML timing
-- ============================================================================

-- Add follow-up tracking columns to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS last_bot_message_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS follow_up_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS follow_up_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ;

-- Create index for efficient follow-up queries
CREATE INDEX IF NOT EXISTS idx_leads_follow_up 
  ON leads(next_follow_up_at) 
  WHERE follow_up_enabled = true AND next_follow_up_at IS NOT NULL;

-- ============================================================================
-- FOLLOW-UP RESPONSE PATTERNS TABLE
-- Tracks when customers typically respond for ML-based timing optimization
-- ============================================================================

CREATE TABLE IF NOT EXISTS follow_up_response_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  
  -- Time tracking
  follow_up_sent_at TIMESTAMPTZ NOT NULL,
  response_received_at TIMESTAMPTZ,
  response_delay_minutes INT,  -- Calculated when response received
  
  -- Context for ML learning
  hour_of_day INT,             -- 0-23, when follow-up was sent
  day_of_week INT,             -- 0-6, Sunday=0
  follow_up_attempt INT,       -- Which attempt number (1, 2, 3...)
  message_type TEXT,           -- 'value_question', 'curiosity', 'offer', etc.
  
  -- Outcome
  did_respond BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for pattern analysis
CREATE INDEX IF NOT EXISTS idx_response_patterns_sender ON follow_up_response_patterns(sender_id);
CREATE INDEX IF NOT EXISTS idx_response_patterns_lead ON follow_up_response_patterns(lead_id);
CREATE INDEX IF NOT EXISTS idx_response_patterns_hour ON follow_up_response_patterns(hour_of_day);
CREATE INDEX IF NOT EXISTS idx_response_patterns_responded ON follow_up_response_patterns(did_respond) 
  WHERE did_respond = true;

-- Enable RLS
ALTER TABLE follow_up_response_patterns ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on follow_up_response_patterns" ON follow_up_response_patterns
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- GLOBAL FOLLOW-UP SETTINGS TABLE
-- Customizable timing configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS follow_up_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Base timing intervals (in minutes) - these are starting points
  base_intervals INT[] DEFAULT ARRAY[5, 15, 30, 60, 120, 240, 480],
  
  -- Minimum time between follow-ups (respects customer preference)
  min_interval_minutes INT DEFAULT 5,
  
  -- Maximum time to wait (prevents infinite delays)
  max_interval_minutes INT DEFAULT 1440,  -- 24 hours max
  
  -- Active hours (don't message at night)
  active_hours_start TIME DEFAULT '08:00:00',
  active_hours_end TIME DEFAULT '21:00:00',
  
  -- ML learning settings
  ml_learning_enabled BOOLEAN DEFAULT true,
  ml_weight_recent FLOAT DEFAULT 0.7,     -- Weight for recent patterns vs global
  
  -- Enable/disable globally
  is_enabled BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO follow_up_settings (id) VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_follow_up_settings_updated_at ON follow_up_settings;
CREATE TRIGGER update_follow_up_settings_updated_at
  BEFORE UPDATE ON follow_up_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE follow_up_response_patterns IS 'Tracks customer response patterns for ML-based timing optimization';
COMMENT ON TABLE follow_up_settings IS 'Global configuration for auto follow-up timing and behavior';
COMMENT ON COLUMN leads.next_follow_up_at IS 'Calculated optimal time for next follow-up based on ML patterns';
-- ============================================================================
-- MOMENTUM LEAD GENERATION FORMS MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Create FORMS table
CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  pipeline_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL, -- Where to put new leads
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}'::jsonb, -- e.g., success_message, redirect_url, notification_emails
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on forms" ON forms FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_forms_updated_at ON forms;
CREATE TRIGGER update_forms_updated_at BEFORE UPDATE ON forms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- 2. Create FORM_FIELDS table
CREATE TABLE IF NOT EXISTS form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES forms(id) ON DELETE CASCADE,
  label TEXT NOT NULL, -- "Full Name", "Email Address"
  field_type TEXT NOT NULL, -- "text", "email", "phone", "number", "textarea", "select", "radio", "checkbox"
  is_required BOOLEAN DEFAULT false,
  options JSONB, -- For select/radio/checkbox e.g., ["Option A", "Option B"]
  placeholder TEXT,
  display_order INT DEFAULT 0,
  mapping_field TEXT, -- Map to specific lead column: "name", "email", "phone", or null for custom_data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for ordering
CREATE INDEX IF NOT EXISTS idx_form_fields_form_order ON form_fields(form_id, display_order);

-- Enable RLS
ALTER TABLE form_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on form_fields" ON form_fields FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_form_fields_updated_at ON form_fields;
CREATE TRIGGER update_form_fields_updated_at BEFORE UPDATE ON form_fields FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- 3. Update LEADS table to support custom data
ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}'::jsonb;
COMMENT ON COLUMN leads.custom_data IS 'Key-value pairs for custom form fields not in standard schema';


-- 4. Create FORM_SUBMISSIONS table (Log of all submissions)
CREATE TABLE IF NOT EXISTS form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES forms(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL, -- Link to the created/updated lead
  submitted_data JSONB NOT NULL, -- The raw data submitted
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on form_submissions" ON form_submissions FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_lead ON form_submissions(lead_id);
-- Create document_sources table for tracking uploaded documents
-- This tracks the source files that have been uploaded and processed

CREATE TABLE IF NOT EXISTS document_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes INT,
  page_count INT,
  chunk_count INT,
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  category_id UUID REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_document_sources_status ON document_sources(status);
CREATE INDEX IF NOT EXISTS idx_document_sources_created ON document_sources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_sources_category ON document_sources(category_id);

-- Enable RLS
ALTER TABLE document_sources ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations (adjust based on your auth setup)
CREATE POLICY "Allow all operations on document_sources" ON document_sources
  FOR ALL USING (true) WITH CHECK (true);

-- Add source_file_id column to documents table to link chunks back to source
ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS source_file_id UUID REFERENCES document_sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_source_file ON documents(source_file_id);
-- Create response_feedback table for agent ratings and corrections
-- This tracks feedback on bot responses for continuous improvement

CREATE TABLE IF NOT EXISTS response_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID,
  sender_id TEXT NOT NULL,
  bot_message TEXT NOT NULL,
  user_message TEXT, -- The message that triggered the bot response
  rating INT CHECK (rating >= 1 AND rating <= 5), -- 1-5 star rating
  is_helpful BOOLEAN, -- Quick thumbs up/down
  correction TEXT, -- Agent's corrected response
  feedback_notes TEXT, -- Additional notes from agent
  feedback_type TEXT DEFAULT 'rating' CHECK (feedback_type IN ('rating', 'correction', 'both')),
  agent_id TEXT, -- Who provided the feedback
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_response_feedback_sender ON response_feedback(sender_id);
CREATE INDEX IF NOT EXISTS idx_response_feedback_created ON response_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_feedback_rating ON response_feedback(rating) WHERE rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_response_feedback_helpful ON response_feedback(is_helpful);

-- Enable RLS
ALTER TABLE response_feedback ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations
CREATE POLICY "Allow all operations on response_feedback" ON response_feedback
  FOR ALL USING (true) WITH CHECK (true);

-- View for feedback statistics
CREATE OR REPLACE VIEW feedback_stats AS
SELECT 
  COUNT(*) as total_feedback,
  COUNT(CASE WHEN is_helpful = true THEN 1 END) as helpful_count,
  COUNT(CASE WHEN is_helpful = false THEN 1 END) as not_helpful_count,
  AVG(rating) as avg_rating,
  COUNT(CASE WHEN correction IS NOT NULL THEN 1 END) as corrections_count,
  DATE_TRUNC('day', created_at) as feedback_date
FROM response_feedback
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY feedback_date DESC;
