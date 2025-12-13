import { NextResponse } from 'next/server';
import { generateKnowledgeBase, generateBotConfiguration } from '@/app/lib/setupService';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { type, data } = body;

        if (type === 'knowledge') {
            await generateKnowledgeBase(
                data.business,
                data.products
            );
            return NextResponse.json({ success: true, message: 'Knowledge generated' });
        }

        if (type === 'config') {
            await generateBotConfiguration(
                data.business,
                data.preferences
            );
            return NextResponse.json({ success: true, message: 'Configuration generated' });
        }

        return NextResponse.json({ error: 'Invalid generation type' }, { status: 400 });

    } catch (error) {
        console.error('Generation error:', error);
        return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
    }
}
