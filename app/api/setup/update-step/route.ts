import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { step, data } = body;

        // Get the settings ID (assuming single tenant/user for now as per existing pattern)
        const { data: settings, error: fetchError } = await supabase
            .from('bot_settings')
            .select('id')
            .single();

        if (fetchError || !settings) {
            return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
        }

        const updates: any = {
            setup_step: step,
            updated_at: new Date().toISOString(),
        };

        // Map step data to columns
        if (step === 1 && data) {
            // Business Info
            if (data.businessName) updates.business_name = data.businessName;
            if (data.businessDescription) updates.business_description = data.businessDescription;
        }
        // Other steps might not save directly to bot_settings columns but trigger other actions
        // or just update the step counter.
        // Step 2 (Product) -> Handled by separate generate call usually, or saved here if we added columns.
        // For now, we just update the step counter if no direct column mapping.

        const { error } = await supabase
            .from('bot_settings')
            .update(updates)
            .eq('id', settings.id);

        if (error) {
            console.error('Error updating setup step:', error);
            return NextResponse.json({ error: 'Failed to update step' }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error in setup update:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
