import { supabase } from './supabase';
import { sendMessengerMessage, sendMessengerAttachment, disableBotForLead, type AttachmentType } from './messengerService';
import { getBotResponse } from './chatService';

interface WorkflowNode {
    id: string;
    type: 'custom';
    data: {
        type: string;
        label: string;
        description?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
    };
}

interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
}

interface WorkflowData {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
}

interface ExecutionContext {
    leadId: string;
    senderId: string;
    conversationHistory?: string;
    lastMessageTime?: Date;
    // Appointment-triggered workflow fields
    appointmentId?: string;
    appointmentDateTime?: Date;  // Combined date + start_time
}

interface ExecuteWorkflowOptions {
    skipPublishCheck?: boolean;
    appointmentId?: string;
    appointmentDateTime?: Date;
}

export async function executeWorkflow(
    workflowId: string,
    leadId: string,
    senderId: string,
    skipPublishCheckOrOptions: boolean | ExecuteWorkflowOptions = false
): Promise<void> {
    // Support both old signature (boolean) and new signature (options object)
    const options: ExecuteWorkflowOptions = typeof skipPublishCheckOrOptions === 'boolean'
        ? { skipPublishCheck: skipPublishCheckOrOptions }
        : skipPublishCheckOrOptions;

    const skipPublishCheck = options.skipPublishCheck ?? false;

    console.log(`Starting workflow ${workflowId} for lead ${leadId}`);

    // Get workflow data
    let query = supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId);

    // Only check published status if not skipping
    if (!skipPublishCheck) {
        query = query.eq('is_published', true);
    }

    const { data: workflow, error: workflowError } = await query.single();

    if (workflowError) {
        console.error('Error fetching workflow:', workflowError);
        return;
    }

    if (!workflow) {
        console.error('Workflow not found or not published:', workflowId);
        return;
    }

    console.log('Workflow loaded:', workflow.name);

    const workflowData = workflow.workflow_data as WorkflowData;
    console.log('Workflow data:', JSON.stringify(workflowData, null, 2));

    // Find trigger node
    const triggerNode = workflowData.nodes.find(n => n.data.type === 'trigger');
    if (!triggerNode) {
        console.error('No trigger node found in workflow');
        return;
    }

    console.log('Trigger node found:', triggerNode.id);

    // Create execution record
    const { data: execution, error: execError } = await supabase
        .from('workflow_executions')
        .insert({
            workflow_id: workflowId,
            lead_id: leadId,
            current_node_id: triggerNode.id,
            execution_data: { senderId },
            status: 'pending',
            appointment_id: options?.appointmentId || null,
        })
        .select()
        .single();

    if (execError) {
        console.error('Error creating execution record:', execError);
        return;
    }

    if (!execution) {
        console.error('Failed to create execution record');
        return;
    }

    console.log('Execution record created:', execution.id);

    // Build execution context
    const context: ExecutionContext = {
        leadId,
        senderId,
        appointmentId: options?.appointmentId,
        appointmentDateTime: options?.appointmentDateTime,
    };

    // Start executing from trigger
    await continueExecution(execution.id, workflowData, context);
}

export async function continueExecution(
    executionId: string,
    workflowData: WorkflowData,
    context: ExecutionContext
): Promise<void> {
    console.log('continueExecution called for:', executionId);

    const { data: execution, error: execError } = await supabase
        .from('workflow_executions')
        .select('*')
        .eq('id', executionId)
        .single();

    if (execError) {
        console.error('Error fetching execution:', execError);
        return;
    }

    if (!execution || execution.status !== 'pending') {
        console.log('Execution not found or not pending:', execution?.status);
        return;
    }

    console.log('Current node ID:', execution.current_node_id);

    const currentNode = workflowData.nodes.find(n => n.id === execution.current_node_id);
    if (!currentNode) {
        console.log('No current node found - end of workflow');
        // End of workflow
        await supabase
            .from('workflow_executions')
            .update({ status: 'completed' })
            .eq('id', executionId);
        return;
    }

    console.log(`Executing node ${currentNode.id} (${currentNode.data.type})`);
    console.log('Node data:', JSON.stringify(currentNode.data, null, 2));

    // Execute the node
    const nextNodeId = await executeNode(currentNode, workflowData, context, executionId);
    console.log('Next node ID:', nextNodeId);

    if (nextNodeId === 'WAIT') {
        // Node scheduled for later execution
        console.log('Execution scheduled for later');
        return;
    }

    if (nextNodeId === 'STOP') {
        // Workflow stopped
        await supabase
            .from('workflow_executions')
            .update({ status: 'stopped' })
            .eq('id', executionId);
        return;
    }

    if (!nextNodeId) {
        // End of workflow
        await supabase
            .from('workflow_executions')
            .update({ status: 'completed' })
            .eq('id', executionId);
        return;
    }

    // Update execution to next node
    await supabase
        .from('workflow_executions')
        .update({ current_node_id: nextNodeId })
        .eq('id', executionId);

    // Continue execution
    await continueExecution(executionId, workflowData, context);
}

async function executeNode(
    node: WorkflowNode,
    workflowData: WorkflowData,
    context: ExecutionContext,
    executionId: string
): Promise<string | null | 'WAIT' | 'STOP'> {
    switch (node.data.type) {
        case 'trigger':
            // Just pass through to next node
            return getNextNode(node.id, workflowData);

        case 'message':
            const messageMode = node.data.messageMode || 'custom';
            let messageText = node.data.messageText || node.data.label || 'Hello!';
            const imageUrl = node.data.imageUrl;

            if (messageMode === 'ai') {
                // Generate AI message based on prompt + conversation context
                try {
                    // Fetch recent conversation
                    const { data: messages } = await supabase
                        .from('conversations')
                        .select('role, content')
                        .eq('sender_id', context.senderId)
                        .order('created_at', { ascending: true })
                        .limit(10);

                    const conversationContext = messages
                        ?.map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content}`)
                        .join('\n') || '';

                    const aiPrompt = `Generate a message for this customer based on the following instruction:

Instruction: ${messageText}

Recent conversation:
${conversationContext}

Respond with ONLY the message text to send, nothing else. Keep it natural and conversational in Taglish if appropriate.`;

                    messageText = await getBotResponse(aiPrompt, context.senderId);
                } catch (error) {
                    console.error('Error generating AI message:', error);
                    // Fallback to the prompt itself if AI fails
                }
            }

            // Send attachment first if present (image, video, audio, or file)
            if (imageUrl) {
                const attachmentType = (node.data.attachmentType as AttachmentType) || 'image';
                await sendMessengerAttachment(
                    context.senderId,
                    imageUrl,
                    attachmentType,
                    { messagingType: 'MESSAGE_TAG', tag: 'ACCOUNT_UPDATE' }
                );
            }

            // Send text message (if there's any text to send)
            if (messageText && messageText.trim()) {
                await sendMessengerMessage(
                    context.senderId,
                    messageText,
                    { messagingType: 'MESSAGE_TAG', tag: 'ACCOUNT_UPDATE' }
                );
            }
            return getNextNode(node.id, workflowData);

        case 'wait':
            // Check wait mode: 'duration' (default) or 'before_appointment'
            const waitMode = node.data.waitMode || 'duration';
            const duration = parseInt(node.data.duration || '5');
            const unit = node.data.unit || 'minutes';

            let scheduledFor: Date;

            if (waitMode === 'before_appointment' && context.appointmentDateTime) {
                // Schedule relative to appointment time (e.g., "1 day before")
                const offsetMs = unit === 'hours' ? duration * 3600000 :
                    unit === 'days' ? duration * 86400000 :
                        duration * 60000; // minutes

                scheduledFor = new Date(context.appointmentDateTime.getTime() - offsetMs);

                // Don't schedule if the time has already passed
                if (scheduledFor.getTime() <= Date.now()) {
                    console.log('Scheduled time has passed, skipping to next node');
                    return getNextNode(node.id, workflowData);
                }
            } else {
                // Default: schedule for duration from now
                const delayMs = unit === 'hours' ? duration * 3600000 :
                    unit === 'days' ? duration * 86400000 :
                        duration * 60000; // minutes

                scheduledFor = new Date(Date.now() + delayMs);
            }

            await supabase
                .from('workflow_executions')
                .update({
                    scheduled_for: scheduledFor.toISOString(),
                    current_node_id: getNextNode(node.id, workflowData),
                    // Store appointment context for cron to use when resuming
                    execution_data: {
                        senderId: context.senderId,
                        appointmentId: context.appointmentId,
                        appointmentDateTime: context.appointmentDateTime?.toISOString(),
                    },
                })
                .eq('id', executionId);

            return 'WAIT';

        case 'smart_condition':
            const conditionMet = await evaluateSmartCondition(node, context);
            return getNextNodeByCondition(node.id, workflowData, conditionMet);

        case 'stop_bot':
            await disableBotForLead(context.leadId, node.data.reason || 'Workflow stopped');
            return 'STOP';

        default:
            console.warn('Unknown node type:', node.data.type);
            return getNextNode(node.id, workflowData);
    }
}

function getNextNode(nodeId: string, workflowData: WorkflowData): string | null {
    console.log('Getting next node for:', nodeId);
    console.log('Available edges:', workflowData.edges.map(e => `${e.source} -> ${e.target}`));

    // Find all edges from this node
    const edges = workflowData.edges.filter(e => e.source === nodeId);
    console.log('Matching edges:', edges.map(e => e.target));

    // Find the first edge where target node actually exists
    for (const edge of edges) {
        const targetNode = workflowData.nodes.find(n => n.id === edge.target);
        if (targetNode) {
            console.log('Found valid next node:', edge.target, '(', targetNode.data.type, ')');
            return edge.target;
        } else {
            console.warn('Target node does not exist:', edge.target);
        }
    }

    console.log('No valid next node found');
    return null;
}

function getNextNodeByCondition(
    nodeId: string,
    workflowData: WorkflowData,
    conditionMet: boolean
): string | null {
    const edge = workflowData.edges.find(
        e => e.source === nodeId && e.sourceHandle === (conditionMet ? 'true' : 'false')
    );
    return edge?.target || null;
}

async function evaluateSmartCondition(
    node: WorkflowNode,
    context: ExecutionContext
): Promise<boolean> {
    const conditionType = node.data.conditionType || 'has_replied';

    if (conditionType === 'has_replied') {
        // Check if user has sent a message recently
        const { data: lead } = await supabase
            .from('leads')
            .select('last_message_at')
            .eq('id', context.leadId)
            .single();

        if (!lead?.last_message_at) return false;

        const lastMessageTime = new Date(lead.last_message_at);
        const timeSinceMessage = Date.now() - lastMessageTime.getTime();
        const threshold = 3600000; // 1 hour

        return timeSinceMessage < threshold;
    }

    if (conditionType === 'ai_rule') {
        // Use AI to evaluate custom rule
        const rule = node.data.conditionRule || node.data.description;
        if (!rule) return false;

        try {
            const prompt = `You are evaluating a condition for a workflow automation.
      
Condition to check: ${rule}

Context:
- Lead ID: ${context.leadId}
- Recent conversation context available

Respond with ONLY "true" or "false" based on whether the condition is met.`;

            const response = await getBotResponse(prompt, context.senderId);
            return response.toLowerCase().includes('true');
        } catch (error) {
            console.error('Error evaluating AI condition:', error);
            return false;
        }
    }

    return false;
}

export async function triggerWorkflowsForStage(stageId: string, leadId: string): Promise<void> {
    console.log(`Checking workflows for stage ${stageId} and lead ${leadId}`);

    const { data: workflows, error: workflowError } = await supabase
        .from('workflows')
        .select('*')
        .eq('trigger_stage_id', stageId)
        .eq('is_published', true);

    if (workflowError) {
        console.error('Error fetching workflows:', workflowError);
        return;
    }

    if (!workflows || workflows.length === 0) {
        console.log('No workflows triggered for stage:', stageId);
        return;
    }

    console.log(`Found ${workflows.length} workflows to trigger:`, workflows.map(w => w.name));

    const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('sender_id')
        .eq('id', leadId)
        .single();

    if (leadError) {
        console.error('Error fetching lead:', leadError);
        return;
    }

    if (!lead?.sender_id) {
        console.error('Lead not found or no sender_id:', leadId);
        return;
    }

    console.log('Lead sender_id:', lead.sender_id);

    for (const workflow of workflows) {
        console.log(`Executing workflow: ${workflow.name} (${workflow.id})`);
        // Skip publish check since we already filtered for published workflows
        await executeWorkflow(workflow.id, leadId, lead.sender_id, true);
    }
}

/**
 * Trigger workflows when an appointment is booked
 * Schedules messages relative to the appointment time (e.g., 1 day before, 1 hour before)
 */
export async function triggerWorkflowsForAppointment(
    appointmentId: string,
    senderId: string,
    appointmentDate: string,  // YYYY-MM-DD format
    startTime: string         // HH:mm:ss format
): Promise<void> {
    console.log(`Checking workflows for appointment ${appointmentId}`);

    // Find workflows with appointment_booked trigger
    const { data: workflows, error: workflowError } = await supabase
        .from('workflows')
        .select('*')
        .eq('trigger_type', 'appointment_booked')
        .eq('is_published', true);

    if (workflowError) {
        console.error('Error fetching appointment workflows:', workflowError);
        return;
    }

    if (!workflows || workflows.length === 0) {
        console.log('No appointment-triggered workflows found');
        return;
    }

    console.log(`Found ${workflows.length} appointment workflows to trigger:`, workflows.map(w => w.name));

    // Get lead from sender_id
    const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('id')
        .eq('sender_id', senderId)
        .single();

    if (leadError || !lead) {
        console.error('Lead not found for sender:', senderId);
        return;
    }

    // Parse appointment datetime
    // appointmentDate is YYYY-MM-DD, startTime is HH:mm:ss
    const [year, month, day] = appointmentDate.split('-').map(Number);
    const [hours, minutes] = startTime.split(':').map(Number);
    const appointmentDateTime = new Date(year, month - 1, day, hours, minutes);

    console.log('Appointment datetime:', appointmentDateTime.toISOString());

    // Execute each workflow
    for (const workflow of workflows) {
        console.log(`Executing appointment workflow: ${workflow.name} (${workflow.id})`);

        await executeWorkflow(workflow.id, lead.id, senderId, {
            skipPublishCheck: true,
            appointmentId,
            appointmentDateTime,
        });
    }
}

