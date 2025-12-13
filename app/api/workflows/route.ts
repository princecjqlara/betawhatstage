import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// Validate UUID format
function isValidUUID(str: string | null | undefined): boolean {
    if (!str) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

// GET /api/workflows - List all workflows
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('workflows')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json(data || []);
    } catch (error) {
        console.error('Error fetching workflows:', error);
        return NextResponse.json({ error: 'Failed to fetch workflows' }, { status: 500 });
    }
}

// POST /api/workflows - Create new workflow
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, trigger_stage_id, trigger_type, workflow_data, prompt } = body;

        let finalName = name;
        let finalWorkflowData = workflow_data;

        // If prompt is provided, generate workflow using AI
        if (prompt) {
            try {
                // Dynamic import to avoid circular dependencies if any
                const { generateWorkflow } = await import('@/app/lib/workflowGenerator');
                const generated = await generateWorkflow(prompt);

                finalName = generated.name || name || 'AI Generated Workflow';
                finalWorkflowData = {
                    nodes: generated.nodes,
                    edges: generated.edges
                };
            } catch (aiError) {
                console.error('Error generating workflow with AI:', aiError);
                // Fallback to empty workflow if AI fails, but keep the name if provided
                finalName = name || 'Untitled Workflow';
                finalWorkflowData = workflow_data || { nodes: [], edges: [] };
            }
        }

        // Validate trigger_stage_id is a valid UUID or set to null
        const validStageId = isValidUUID(trigger_stage_id) ? trigger_stage_id : null;

        const { data, error } = await supabase
            .from('workflows')
            .insert({
                name: finalName,
                trigger_stage_id: (trigger_type === 'appointment_booked') ? null : validStageId,
                trigger_type: trigger_type || 'stage_change',
                workflow_data: finalWorkflowData,
                is_published: false,
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error creating workflow:', error);
        return NextResponse.json({ error: 'Failed to create workflow' }, { status: 500 });
    }
}

// PUT /api/workflows - Update workflow
export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, name, trigger_stage_id, trigger_type, workflow_data } = body;

        // Validate trigger_stage_id is a valid UUID or set to null
        const validStageId = isValidUUID(trigger_stage_id) ? trigger_stage_id : null;

        const { data, error } = await supabase
            .from('workflows')
            .update({
                name,
                trigger_stage_id: (trigger_type === 'appointment_booked') ? null : validStageId,
                trigger_type: trigger_type || 'stage_change',
                workflow_data,
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error updating workflow:', error);
        return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 });
    }
}

