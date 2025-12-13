
import { NextRequest, NextResponse } from 'next/server';
import { generateConversationSummary, getLatestConversationSummary } from '@/app/lib/chatService';


export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { senderId } = body;

        if (!senderId) {
            return NextResponse.json({ error: 'senderId is required' }, { status: 400 });
        }

        const { supabase } = await import('@/app/lib/supabase');

        // 1. Check messages
        const { data: messages, error: msgError } = await supabase
            .from('conversations')
            .select('*')
            .eq('sender_id', senderId)
            .limit(5);

        if (msgError) {
            return NextResponse.json({ error: 'DB Error', details: msgError }, { status: 500 });
        }

        // 2. Try generation
        const generatedRaw = await generateConversationSummary(senderId);

        // 3. fetch result
        const summary = await getLatestConversationSummary(senderId);

        return NextResponse.json({
            success: true,
            message: 'Debug run',
            messageCount: messages?.length,
            firstMessage: messages?.[0],
            summary,
            generatedRaw
        });
    } catch (error) {
        console.error('Error in test endpoint:', error);
        return NextResponse.json({ error: 'Internal server error', details: JSON.stringify(error, Object.getOwnPropertyNames(error)) }, { status: 500 });
    }
}

export async function GET() {
    try {
        const { supabase } = await import('@/app/lib/supabase');
        // Get distinct sender_ids (inefficient but fine for test)
        const { data } = await supabase
            .from('conversations')
            .select('sender_id')
            .limit(100);

        // Unique senders
        const senders = [...new Set(data?.map(d => d.sender_id))];

        return NextResponse.json({ senders });
    } catch (error) {
        return NextResponse.json({ error }, { status: 500 });
    }
}
