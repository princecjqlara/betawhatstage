import AppointmentManager from '@/app/components/AppointmentManager';
import { supabase } from '@/app/lib/supabase';

// Force dynamic rendering since we're fetching data that changes frequently
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getData() {
    const [appointmentsRes, settingsRes] = await Promise.all([
        supabase
            .from('appointments')
            .select('*')
            .order('appointment_date', { ascending: true })
            .order('start_time', { ascending: true })
            .neq('status', 'cancelled'),
        supabase
            .from('appointment_settings')
            .select('*')
            .limit(1)
            .single()
    ]);

    // Handle settings default if not found
    let settings = settingsRes.data;
    if (settingsRes.error && settingsRes.error.code === 'PGRST116') {
        settings = {
            business_hours_start: '09:00:00',
            business_hours_end: '17:00:00',
            slot_duration_minutes: 60,
            days_available: [1, 2, 3, 4, 5],
            booking_lead_time_hours: 24,
            max_advance_booking_days: 30,
            buffer_between_slots_minutes: 0,
            is_active: true
        };
    }

    return {
        appointments: appointmentsRes.data || [],
        settings: settings || undefined
    };
}

export default async function AppointmentsPage() {
    const { appointments, settings } = await getData();

    return (
        <AppointmentManager
            initialAppointments={appointments}
            initialSettings={settings}
        />
    );
}
