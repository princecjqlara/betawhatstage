import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> } // Awaiting params helper for Next.js 15
) {
    try {
        const { id: leadId } = await params;

        if (!leadId) {
            return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 });
        }

        // 1. Fetch Basic Lead Info
        const { data: lead, error: leadError } = await supabase
            .from('leads')
            .select(`
                *,
                pipeline_stages (
                    id,
                    name,
                    color
                )
            `)
            .eq('id', leadId)
            .single();

        if (leadError || !lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        // 2. Fetch Appointments (using sender_psid from lead.sender_id)
        // Note: Appointments table uses sender_psid, leads table uses sender_id. They should match.
        const { data: appointments, error: apptError } = await supabase
            .from('appointments')
            .select('*')
            .eq('sender_psid', lead.sender_id)
            .order('appointment_date', { ascending: false }); // Newest first

        console.log('Fetching details for lead:', leadId);

        // 3. Fetch All Orders (Cart + History)
        // Robustness: Find all lead_ids for this sender to ensure we catch orders attached to duplicate lead records
        const { data: allLeads } = await supabase
            .from('leads')
            .select('id')
            .eq('sender_id', lead.sender_id);

        const allLeadIds = allLeads?.map(l => l.id) || [leadId];

        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select(`
                id,
                total_amount,
                status,
                created_at,
                order_items (
                    id,
                    name:product_name,
                    quantity,
                    price:unit_price,
                    variations
                )
            `)
            .in('lead_id', allLeadIds)
            .order('created_at', { ascending: false });

        if (ordersError) {
            console.error('Error fetching orders:', ordersError);
        } else {
            console.log(`Orders found for sender ${lead.sender_id}:`, orders?.length || 0);
        }

        // 4. Fetch Lead Activity (Stage History)
        const { data: activity, error: activityError } = await supabase
            .from('lead_stage_history')
            .select(`
                *,
                from_stage: from_stage_id (name),
                to_stage: to_stage_id (name)
            `)
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false });

        return NextResponse.json({
            lead: {
                ...lead,
                stage: lead.pipeline_stages // Flatten stage info
            },
            appointments: appointments || [],
            orders: orders || [],
            activity: activity || []
        });

    } catch (error) {
        console.error('Error fetching lead details:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
