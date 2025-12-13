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
