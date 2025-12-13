import { NextResponse } from 'next/server';
import { retrieveAuthSession } from '@/app/lib/authSession';

// API endpoint to retrieve Facebook pages from temp session
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
        return NextResponse.json({ error: 'No session ID provided' }, { status: 400 });
    }

    const pages = retrieveAuthSession(sessionId);

    if (!pages) {
        return NextResponse.json({ error: 'Session expired or not found' }, { status: 404 });
    }

    return NextResponse.json({ pages });
}
