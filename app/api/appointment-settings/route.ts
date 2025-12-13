import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - Get appointment settings
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('appointment_settings')
            .select('*')
            .limit(1)
            .single();

        if (error) {
            // If no settings exist, return defaults
            if (error.code === 'PGRST116') {
                return NextResponse.json({
                    business_hours_start: '09:00:00',
                    business_hours_end: '17:00:00',
                    slot_duration_minutes: 60,
                    days_available: [1, 2, 3, 4, 5],
                    booking_lead_time_hours: 24,
                    max_advance_booking_days: 30,
                    buffer_between_slots_minutes: 0,
                    is_active: true
                });
            }
            console.error('Error fetching appointment settings:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Appointment settings GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PUT - Update appointment settings
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            business_hours_start,
            business_hours_end,
            slot_duration_minutes,
            days_available,
            booking_lead_time_hours,
            max_advance_booking_days,
            buffer_between_slots_minutes,
            is_active
        } = body;

        // Check if settings exist
        const { data: existing } = await supabase
            .from('appointment_settings')
            .select('id')
            .limit(1);

        let result;
        if (existing && existing.length > 0) {
            // Update existing
            const { data, error } = await supabase
                .from('appointment_settings')
                .update({
                    business_hours_start,
                    business_hours_end,
                    slot_duration_minutes,
                    days_available,
                    booking_lead_time_hours,
                    max_advance_booking_days,
                    buffer_between_slots_minutes,
                    is_active
                })
                .eq('id', existing[0].id)
                .select()
                .single();

            if (error) throw error;
            result = data;
        } else {
            // Create new settings
            const { data, error } = await supabase
                .from('appointment_settings')
                .insert([{
                    business_hours_start,
                    business_hours_end,
                    slot_duration_minutes,
                    days_available,
                    booking_lead_time_hours,
                    max_advance_booking_days,
                    buffer_between_slots_minutes,
                    is_active
                }])
                .select()
                .single();

            if (error) throw error;
            result = data;
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('Appointment settings PUT error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
