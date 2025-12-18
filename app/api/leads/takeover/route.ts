import { NextResponse } from 'next/server';
import { startOrRefreshTakeover, manuallyEndTakeover, isTakeoverActive } from '@/app/lib/humanTakeoverService';

/**
 * POST /api/leads/takeover
 * Start or end a human takeover session for a lead
 * 
 * Body: { senderId: string, action: 'start' | 'end' | 'check' }
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { senderId, action } = body;

        if (!senderId) {
            return NextResponse.json(
                { error: 'senderId is required' },
                { status: 400 }
            );
        }

        if (!action || !['start', 'end', 'check'].includes(action)) {
            return NextResponse.json(
                { error: 'action must be "start", "end", or "check"' },
                { status: 400 }
            );
        }

        switch (action) {
            case 'start':
                console.log('[HumanTakeover] Starting takeover for:', senderId);
                await startOrRefreshTakeover(senderId);
                return NextResponse.json({
                    success: true,
                    message: 'Human takeover started. Bot will be silent for this lead.',
                    active: true,
                });

            case 'end':
                console.log('[HumanTakeover] Ending takeover for:', senderId);
                await manuallyEndTakeover(senderId);
                return NextResponse.json({
                    success: true,
                    message: 'Human takeover ended. Bot will resume responding.',
                    active: false,
                });

            case 'check':
                const isActive = await isTakeoverActive(senderId);
                return NextResponse.json({
                    success: true,
                    active: isActive,
                });

            default:
                return NextResponse.json(
                    { error: 'Invalid action' },
                    { status: 400 }
                );
        }

    } catch (error) {
        console.error('[HumanTakeover] Error:', error);
        return NextResponse.json(
            { error: 'Failed to process takeover request' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/leads/takeover?senderId=xxx
 * Check if takeover is active for a lead
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const senderId = searchParams.get('senderId');

        if (!senderId) {
            return NextResponse.json(
                { error: 'senderId is required' },
                { status: 400 }
            );
        }

        const isActive = await isTakeoverActive(senderId);

        return NextResponse.json({
            success: true,
            active: isActive,
        });

    } catch (error) {
        console.error('[HumanTakeover] Error checking status:', error);
        return NextResponse.json(
            { error: 'Failed to check takeover status' },
            { status: 500 }
        );
    }
}
