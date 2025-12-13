import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - List appointments (optionally filter by sender_psid or date)
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const senderPsid = searchParams.get('sender_psid');
        const date = searchParams.get('date');
        const status = searchParams.get('status');

        let query = supabase
            .from('appointments')
            .select('*')
            .order('appointment_date', { ascending: true })
            .order('start_time', { ascending: true });

        if (senderPsid) {
            query = query.eq('sender_psid', senderPsid);
        }

        if (date) {
            query = query.eq('appointment_date', date);
        }

        if (status) {
            query = query.eq('status', status);
        } else {
            // By default, exclude cancelled appointments
            query = query.neq('status', 'cancelled');
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching appointments:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data || []);
    } catch (error) {
        console.error('Appointments GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Create a new appointment
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            sender_psid,
            customer_name,
            customer_email,
            customer_phone,
            appointment_date,
            start_time,
            end_time,
            notes,
            page_id
        } = body;

        // Validate required fields
        if (!sender_psid || !appointment_date || !start_time || !end_time) {
            return NextResponse.json(
                { error: 'Missing required fields: sender_psid, appointment_date, start_time, end_time' },
                { status: 400 }
            );
        }

        // Check if the slot is available
        const { data: existingAppointments, error: checkError } = await supabase
            .from('appointments')
            .select('id')
            .eq('appointment_date', appointment_date)
            .eq('start_time', start_time)
            .neq('status', 'cancelled')
            .limit(1);

        if (checkError) {
            console.error('Error checking slot availability:', checkError);
            return NextResponse.json({ error: checkError.message }, { status: 500 });
        }

        if (existingAppointments && existingAppointments.length > 0) {
            return NextResponse.json(
                { error: 'This time slot is no longer available' },
                { status: 409 }
            );
        }

        // Create the appointment

        // Create the appointment

        // Fetch Facebook Profile Name from Leads table (captured during initial contact)
        let facebookName = null;
        if (sender_psid) {
            try {
                const { data: lead } = await supabase
                    .from('leads')
                    .select('name')
                    .eq('sender_id', sender_psid)
                    .single();

                if (lead && lead.name) {
                    facebookName = lead.name;
                }
            } catch (err) {
                console.error('Error fetching name from leads table:', err);
            }
        }

        const { data, error } = await supabase
            .from('appointments')
            .insert([{
                sender_psid,
                customer_name: customer_name || facebookName, // Fallback to FB name if manual name is empty
                facebook_name: facebookName,
                customer_email,
                customer_phone,
                appointment_date,
                start_time,
                end_time,
                notes,
                page_id,
                status: 'confirmed'
            }])
            .select()
            .single();

        if (error) {
            console.error('Error creating appointment:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Track appointment booking activity and update pipeline
        try {
            const { trackActivity } = await import('@/app/lib/activityTrackingService');
            const { moveLeadToAppointmentStage } = await import('@/app/lib/pipelineService');

            // Track the activity
            await trackActivity(sender_psid, 'appointment_booked', data.id, 'Appointment', {
                appointment_date,
                start_time,
                end_time,
                customer_name: customer_name || facebookName,
            });

            // Move lead to "Appointment Scheduled" stage
            await moveLeadToAppointmentStage(sender_psid, {
                appointmentId: data.id,
                appointmentDate: appointment_date,
                startTime: start_time,
            });

            // Trigger appointment-based workflows
            const { triggerWorkflowsForAppointment } = await import('@/app/lib/workflowEngine');
            await triggerWorkflowsForAppointment(data.id, sender_psid, appointment_date, start_time);
        } catch (activityError) {
            console.error('Error tracking appointment activity:', activityError);
            // Don't fail the booking if activity tracking fails
        }

        // Send confirmation to Messenger
        if (page_id && sender_psid) {
            // Import dynamically to avoid circular dependencies
            const { callSendAPI } = await import('../webhook/facebookClient');

            // Parse date string manually to avoid UTC conversion issues
            const [year, month, day] = appointment_date.split('-').map(Number);
            const dateObj = new Date(year, month - 1, day);

            const formattedDate = dateObj.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
            });

            // Format time (HH:mm:ss -> h:mm AM/PM)
            const [hours, minutes] = start_time.split(':');
            const hour = parseInt(hours);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour % 12 || 12;
            const formattedTime = `${displayHour}:${minutes} ${ampm}`;

            await callSendAPI(sender_psid, {
                text: `✅ Appointment Confirmed!\n\nWe've scheduled your appointment for ${formattedDate} at ${formattedTime}.\n\nSee you then!`
            }, page_id);
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        console.error('Appointments POST error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE - Cancel an appointment
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const reason = searchParams.get('reason');

        if (!id) {
            return NextResponse.json({ error: 'Appointment ID is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('appointments')
            .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancelled_reason: reason || 'User cancelled'
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error cancelling appointment:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Appointments DELETE error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
