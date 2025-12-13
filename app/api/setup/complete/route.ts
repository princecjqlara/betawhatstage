import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function POST() {
    try {
        const { data: settings } = await supabase
            .from('bot_settings')
            .select('id')
            .single();

        if (!settings) {
            return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
        }

        const { error } = await supabase
            .from('bot_settings')
            .update({
                is_setup_completed: true,
                setup_step: 5 // Ensure max step
            })
            .eq('id', settings.id);

        if (error) {
            return NextResponse.json({ error: 'Failed to complete setup' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
