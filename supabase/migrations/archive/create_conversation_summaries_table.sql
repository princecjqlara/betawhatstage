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
