import { Suspense } from 'react';
import { supabase } from '@/app/lib/supabase';
import { Loader2 } from 'lucide-react';
import BookingPageClient from './BookingPageClient';
import { unstable_cache } from 'next/cache';

interface AppointmentSettings {
    business_hours_start: string;
    business_hours_end: string;
    slot_duration_minutes: number;
    days_available: number[];
    booking_lead_time_hours: number;
    max_advance_booking_days: number;
    buffer_between_slots_minutes: number;
    is_active: boolean;
}

interface Appointment {
    id: string;
    appointment_date: string;
    start_time: string;
    end_time: string;
    status: string;
    customer_name?: string;
    notes?: string;
}

// Default settings if none exist in database
const defaultSettings: AppointmentSettings = {
    business_hours_start: '09:00:00',
    business_hours_end: '17:00:00',
    slot_duration_minutes: 60,
    days_available: [1, 2, 3, 4, 5],
    booking_lead_time_hours: 24,
    max_advance_booking_days: 30,
    buffer_between_slots_minutes: 0,
    is_active: true,
};

// Fetch appointment settings on the server (cached for 5 minutes)
const getAppointmentSettings = unstable_cache(
    async (): Promise<AppointmentSettings> => {
        try {
            const { data, error } = await supabase
                .from('appointment_settings')
                .select('*')
                .limit(1)
                .single();

            if (error || !data) {
                return defaultSettings;
            }

            return data as AppointmentSettings;
        } catch (error) {
            console.error('Failed to fetch appointment settings:', error);
            return defaultSettings;
        }
    },
    ['appointment-settings'],
    { revalidate: 300, tags: ['appointment-settings'] } // Cache for 5 minutes
);

// Fetch existing appointments for a customer (cached for 60 seconds per customer)
async function getExistingAppointments(senderPsid: string): Promise<Appointment[]> {
    if (!senderPsid) return [];

    try {
        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('appointments')
            .select('id, appointment_date, start_time, end_time, status, customer_name, notes')
            .eq('sender_psid', senderPsid)
            .gte('appointment_date', today)
            .neq('status', 'cancelled')
            .order('appointment_date', { ascending: true })
            .order('start_time', { ascending: true });

        if (error) {
            console.error('Failed to fetch existing appointments:', error);
            return [];
        }

        return (data || []) as Appointment[];
    } catch (error) {
        console.error('Failed to fetch existing appointments:', error);
        return [];
    }
}

// Server component to wrap the data fetching
async function BookingPageContent({ senderPsid, pageId }: { senderPsid: string; pageId: string }) {
    // Parallel fetch for settings and existing appointments
    const [settings, existingAppointments] = await Promise.all([
        getAppointmentSettings(),
        getExistingAppointments(senderPsid),
    ]);

    return (
        <BookingPageClient
            initialSettings={settings}
            initialAppointments={existingAppointments}
            senderPsid={senderPsid}
            pageId={pageId}
        />
    );
}

export default async function BookingPage({
    searchParams,
}: {
    searchParams: Promise<{ psid?: string; pageId?: string }>;
}) {
    const params = await searchParams;
    const senderPsid = params.psid || '';
    const pageId = params.pageId || '';

    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
                    <div className="text-center">
                        <Loader2 className="animate-spin mx-auto mb-4 text-emerald-500" size={40} />
                        <p className="text-gray-500">Loading booking calendar...</p>
                    </div>
                </div>
            }
        >
            <BookingPageContent senderPsid={senderPsid} pageId={pageId} />
        </Suspense>
    );
}
