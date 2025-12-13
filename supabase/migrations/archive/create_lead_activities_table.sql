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
