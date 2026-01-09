-- Migration: Create auth_sessions table for Facebook OAuth
-- This replaces the in-memory session store that doesn't work in serverless environments

CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT UNIQUE NOT NULL,
    pages_data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by session_id
CREATE INDEX idx_auth_sessions_session_id ON auth_sessions(session_id);

-- Index for cleanup of expired sessions
CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions(expires_at);

-- Enable RLS
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage sessions (API routes use service role)
CREATE POLICY "Service role can manage all sessions" ON auth_sessions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Function to cleanup expired sessions (can be called periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_auth_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM auth_sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;
