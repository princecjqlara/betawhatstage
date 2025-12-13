import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { waitUntil } from '@vercel/functions';

// GET - Fetch all leads with their stages
export async function GET() {
    try {
        // First, get all stages
        const { data: stages, error: stagesError } = await supabase
            .from('pipeline_stages')
            .select('*')
            .order('display_order', { ascending: true });

        if (stagesError) {
            console.error('Error fetching stages:', stagesError);
            return NextResponse.json({ error: 'Failed to fetch stages' }, { status: 500 });
        }

        // Then, get all leads
        const { data: leads, error: leadsError } = await supabase
            .from('leads')
            .select('*')
            .order('last_message_at', { ascending: false });

        if (leadsError) {
            console.error('Error fetching leads:', leadsError);
            return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
        }

        // Group leads by stage
        const stagesWithLeads = stages?.map(stage => ({
            ...stage,
            leads: leads?.filter(lead => lead.current_stage_id === stage.id) || [],
        })) || [];

        return NextResponse.json({ stages: stagesWithLeads }, {
            headers: {
                'Cache-Control': 'private, s-maxage=10, stale-while-revalidate=30',
            },
        });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PATCH - Update a lead's stage (manual override)
export async function PATCH(req: Request) {
    try {
        const { leadId, stageId, reason } = await req.json();

        if (!leadId || !stageId) {
            return NextResponse.json({ error: 'Lead ID and Stage ID are required' }, { status: 400 });
        }

        // Get current stage for history
        const { data: lead } = await supabase
            .from('leads')
            .select('current_stage_id, sender_id')
            .eq('id', leadId)
            .single();

        const stageChanged = lead?.current_stage_id !== stageId;

        // Record stage change history
        if (stageChanged) {
            await supabase
                .from('lead_stage_history')
                .insert({
                    lead_id: leadId,
                    from_stage_id: lead?.current_stage_id,
                    to_stage_id: stageId,
                    reason: reason || 'Manual update',
                    changed_by: 'user',
                });
        }

        // Update lead
        const { data, error } = await supabase
            .from('leads')
            .update({ current_stage_id: stageId })
            .eq('id', leadId)
            .select()
            .single();

        if (error) {
            console.error('Error updating lead:', error);
            return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
        }

        // Trigger workflows for this stage if stage changed
        if (stageChanged && lead?.sender_id) {
            console.log(`Lead ${leadId} moved to stage ${stageId}, triggering workflows...`);
            const { triggerWorkflowsForStage } = await import('@/app/lib/workflowEngine');

            // Use waitUntil to keep the serverless function alive while workflow executes
            waitUntil(
                triggerWorkflowsForStage(stageId, leadId).catch(err => {
                    console.error('Error triggering workflows:', err);
                })
            );
        }

        return NextResponse.json({ lead: data });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
