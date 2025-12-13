import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - Fetch settings from database
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('*')
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching settings:', error);
            // Return defaults if no settings exist
            return NextResponse.json({
                botName: 'Assistant',
                botTone: 'helpful and professional',
                facebookVerifyToken: 'TEST_TOKEN',
                facebookPageAccessToken: '',
            });
        }

        // Map database column names to frontend field names
        return NextResponse.json({
            botName: data.bot_name || 'Assistant',
            botTone: data.bot_tone || 'helpful and professional',
            facebookVerifyToken: data.facebook_verify_token || 'TEST_TOKEN',
            facebookPageAccessToken: data.facebook_page_access_token || '',
            humanTakeoverTimeoutMinutes: data.human_takeover_timeout_minutes ?? 5,
            aiModel: data.ai_model || 'qwen/qwen3-235b-a22b',
            splitMessages: data.split_messages ?? false,
            // Setup fields
            isSetupCompleted: data.is_setup_completed ?? false,
            setupStep: data.setup_step || 1,
            businessName: data.business_name || '',
            businessDescription: data.business_description || '',
        });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Update settings in database
export async function POST(req: Request) {
    try {
        const body = await req.json();

        // Map frontend field names to database column names
        const updates: Record<string, any> = {
            updated_at: new Date().toISOString(),
        };

        if (body.botName !== undefined) updates.bot_name = body.botName;
        if (body.botTone !== undefined) updates.bot_tone = body.botTone;
        if (body.facebookVerifyToken !== undefined) updates.facebook_verify_token = body.facebookVerifyToken;
        if (body.facebookPageAccessToken !== undefined) updates.facebook_page_access_token = body.facebookPageAccessToken;
        if (body.humanTakeoverTimeoutMinutes !== undefined) updates.human_takeover_timeout_minutes = body.humanTakeoverTimeoutMinutes;
        if (body.aiModel !== undefined) updates.ai_model = body.aiModel;
        if (body.splitMessages !== undefined) updates.split_messages = body.splitMessages;

        // Check if settings row exists
        const { data: existing } = await supabase
            .from('bot_settings')
            .select('id')
            .limit(1)
            .single();

        if (existing) {
            // Update existing row
            const { error } = await supabase
                .from('bot_settings')
                .update(updates)
                .eq('id', existing.id);

            if (error) {
                console.error('Error updating settings:', error);
                return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
            }
        } else {
            // Insert new row
            const { error } = await supabase
                .from('bot_settings')
                .insert({
                    bot_name: body.botName || 'Assistant',
                    bot_tone: body.botTone || 'helpful and professional',
                    facebook_verify_token: body.facebookVerifyToken || 'TEST_TOKEN',
                    facebook_page_access_token: body.facebookPageAccessToken || null,
                    human_takeover_timeout_minutes: body.humanTakeoverTimeoutMinutes ?? 5,
                    ai_model: body.aiModel || 'qwen/qwen3-235b-a22b',
                    split_messages: body.splitMessages ?? false,
                });

            if (error) {
                console.error('Error inserting settings:', error);
                return NextResponse.json({ error: 'Failed to create settings' }, { status: 500 });
            }
        }

        // Return updated settings
        return NextResponse.json({
            botName: body.botName,
            botTone: body.botTone,
            facebookVerifyToken: body.facebookVerifyToken,
            facebookPageAccessToken: body.facebookPageAccessToken,
            humanTakeoverTimeoutMinutes: body.humanTakeoverTimeoutMinutes,
            aiModel: body.aiModel,
            splitMessages: body.splitMessages,
        });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
