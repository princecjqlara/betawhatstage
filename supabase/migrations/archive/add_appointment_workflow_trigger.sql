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
