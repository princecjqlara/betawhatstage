import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { continueExecution } from '@/app/lib/workflowEngine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
    try {
        // Verify cron secret to prevent unauthorized access (skip in development)
        const authHeader = req.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        // Only check auth if CRON_SECRET is set (production)
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            console.log('Unauthorized cron request');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('Executing scheduled workflows...');

        // Get all pending executions that are scheduled for now or earlier
        const { data: executions, error } = await supabase
            .from('workflow_executions')
            .select(`
        *,
        workflows:workflows(workflow_data)
      `)
            .eq('status', 'pending')
            .not('scheduled_for', 'is', null)
            .lte('scheduled_for', new Date().toISOString())
            .limit(10);

        if (error) throw error;

        if (!executions || executions.length === 0) {
            console.log('No scheduled executions found');
            return NextResponse.json({ processed: 0 });
        }

        console.log(`Found ${executions.length} scheduled executions`);

        // Process each execution
        for (const execution of executions) {
            try {
                // Get lead sender_id
                const { data: lead } = await supabase
                    .from('leads')
                    .select('sender_id')
                    .eq('id', execution.lead_id)
                    .single();

                if (!lead) {
                    console.error('Lead not found for execution:', execution.id);
                    continue;
                }

                // Clear scheduled_for and continue execution
                await supabase
                    .from('workflow_executions')
                    .update({ scheduled_for: null })
                    .eq('id', execution.id);

                const workflowData = (execution.workflows as any).workflow_data;
                const executionData = execution.execution_data as any || {};

                // Build context, restoring appointment data if present
                const context = {
                    leadId: execution.lead_id,
                    senderId: lead.sender_id,
                    appointmentId: executionData.appointmentId || execution.appointment_id,
                    appointmentDateTime: executionData.appointmentDateTime
                        ? new Date(executionData.appointmentDateTime)
                        : undefined,
                };

                await continueExecution(execution.id, workflowData, context);

                console.log('Processed execution:', execution.id);
            } catch (execError) {
                console.error('Error processing execution:', execution.id, execError);
            }
        }

        return NextResponse.json({ processed: executions.length });
    } catch (error) {
        console.error('Cron execution error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
