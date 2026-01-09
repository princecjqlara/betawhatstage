// Database-backed auth session store for Facebook OAuth
// Uses Supabase for persistence - works in serverless/multi-instance environments

import { supabaseAdmin } from './supabaseAdmin';

export interface AuthPageData {
    id: string;
    name: string;
    access_token?: string;
    picture?: string | null;
    [key: string]: unknown;
}

// Generate a cryptographically secure session ID
function generateSessionId(): string {
    return crypto.randomUUID();
}

// Store pages data and return session ID
export async function storeAuthSession(pages: AuthPageData[]): Promise<string> {
    const sessionId = generateSessionId();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes (increased from 5)

    const { error } = await supabaseAdmin
        .from('auth_sessions')
        .insert({
            session_id: sessionId,
            pages_data: pages,
            expires_at: expiresAt.toISOString(),
        });

    if (error) {
        console.error('Failed to store auth session:', error);
        throw new Error('Failed to store auth session');
    }

    console.log(`[AuthSession] Stored session ${sessionId} with ${pages.length} pages, expires at ${expiresAt.toISOString()}`);
    return sessionId;
}

// Retrieve and delete pages data (one-time use)
// Uses atomic delete-returning to prevent TOCTOU race conditions
export async function retrieveAuthSession(sessionId: string): Promise<AuthPageData[] | null> {
    // First, cleanup any expired sessions (fire and forget, not critical)
    try {
        await supabaseAdmin.rpc('cleanup_expired_auth_sessions');
    } catch {
        // Ignore cleanup errors - not critical
    }

    // Atomic delete-returning: verifies non-expiration AND removes row in one operation
    // This prevents race conditions where concurrent requests could both read before delete
    const { data, error } = await supabaseAdmin
        .from('auth_sessions')
        .delete()
        .eq('session_id', sessionId)
        .gt('expires_at', new Date().toISOString())
        .select('pages_data')
        .single();

    if (error || !data) {
        // Could be: not found, already deleted by concurrent request, or expired
        console.log(`[AuthSession] Session ${sessionId} not found, expired, or already consumed:`, error?.message);
        return null;
    }

    console.log(`[AuthSession] Retrieved and deleted session ${sessionId}`);
    return data.pages_data as AuthPageData[];
}
