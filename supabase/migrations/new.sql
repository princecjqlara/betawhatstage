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
