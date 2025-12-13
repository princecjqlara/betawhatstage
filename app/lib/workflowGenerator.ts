import OpenAI from 'openai';
import { supabase } from './supabase';
import { searchDocuments } from './rag';

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

export interface WorkflowNode {
    id: string;
    type: 'custom';
    position: { x: number; y: number };
    data: {
        type: 'trigger' | 'message' | 'wait' | 'smart_condition' | 'stop_bot';
        label: string;
        description?: string;
        // Message node fields
        messageMode?: 'custom' | 'ai';
        messageText?: string;
        // Trigger node fields
        triggerStageId?: string;
        triggerType?: 'stage_change' | 'appointment_booked';
        // Wait node fields
        duration?: string;
        unit?: 'minutes' | 'hours' | 'days';
        waitMode?: 'duration' | 'before_appointment';
        // Smart condition fields
        conditionType?: 'has_replied' | 'ai_rule';
        conditionRule?: string;
        // Stop bot fields
        reason?: string;
    };
}

export interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    animated?: boolean;
    style?: { stroke: string; strokeWidth: number };
}

export interface GeneratedWorkflow {
    name: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
}

// Fetch bot rules from database
async function getBotRules(): Promise<string[]> {
    try {
        const { data: rules, error } = await supabase
            .from('bot_rules')
            .select('rule')
            .eq('enabled', true)
            .order('priority', { ascending: true })
            .limit(10);

        if (error) {
            console.error('[WorkflowGenerator] Error fetching bot rules:', error);
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return rules?.map((r: any) => r.rule) || [];
    } catch (error) {
        console.error('[WorkflowGenerator] Error fetching bot rules:', error);
        return [];
    }
}

// Fetch bot settings (name, tone)
async function getBotSettings(): Promise<{ botName: string; botTone: string }> {
    try {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('bot_name, bot_tone')
            .limit(1)
            .single();

        if (error || !data) {
            return { botName: 'Assistant', botTone: 'friendly and professional' };
        }

        return {
            botName: data.bot_name || 'Assistant',
            botTone: data.bot_tone || 'friendly and professional'
        };
    } catch {
        return { botName: 'Assistant', botTone: 'friendly and professional' };
    }
}

const BASE_SYSTEM_PROMPT = `You are an expert workflow designer. Generate COMPREHENSIVE and DETAILED workflow sequences based on user instructions. Do not cut corners.

OUTPUT FORMAT: You MUST respond with ONLY valid JSON (no markdown, no explanation). The JSON structure:
{
  "name": "Workflow Name",
  "nodes": [...],
  "edges": [...]
}

AVAILABLE TRIGGER TYPES:
1. "stage_change" - Triggers when lead enters a pipeline stage. Fields: { type: "trigger", triggerType: "stage_change", triggerStageId, label, description }
2. "appointment_booked" - Triggers when customer books an appointment. Fields: { type: "trigger", triggerType: "appointment_booked", label, description }

AVAILABLE NODE TYPES:
1. "trigger" - Starting point. Always use as first node.
2. "message" - Send a message. Fields: { type: "message", label, description, messageMode: "custom"|"ai", messageText }
3. "wait" - Delay before next step. Two modes:
   - Duration mode: { type: "wait", waitMode: "duration", duration: "5", unit: "minutes"|"hours"|"days" }
   - Before Appointment mode (only for appointment_booked trigger): { type: "wait", waitMode: "before_appointment", duration: "1", unit: "days"|"hours"|"minutes" } - schedules message X time BEFORE the appointment
4. "smart_condition" - Branch logic. Fields: { type: "smart_condition", label, description, conditionType: "has_replied"|"ai_rule", conditionRule }
5. "stop_bot" - End workflow. Fields: { type: "stop_bot", label, description, reason }

APPOINTMENT WORKFLOW DESIGN RULES:
- When creating appointment reminder workflows, use triggerType: "appointment_booked"
- Use waitMode: "before_appointment" to schedule messages BEFORE the appointment (e.g., 1 day before, 1 hour before, 10 minutes before)
- Typical reminder sequence: 1 day before -> 1 hour before -> 10 minutes before
- Example: { type: "wait", label: "1 Day Before", waitMode: "before_appointment", duration: "1", unit: "days" }

DESIGN RULES FOR "LONGER WORKFLOWS":
- Unless explicitly asked for a "simple" workflow, always create a MULTI-STEP sequence.
- Include at least 3-5 message steps separated by waits.
- Use "smart_condition" nodes to check for replies or intent.
- Create branching paths: what happens if they reply? what happens if they don't?
- Example structure: Trigger -> Message 1 -> Wait 1 Day -> Smart Condition (Replied?) -> (If No) Message 2 -> Wait 2 Days -> (If No) Message 3.
- Make the workflow feel complete and robust.

NODE STRUCTURE:
{
  "id": "unique_id",
  "type": "custom",
  "position": { "x": number, "y": number },
  "data": { "type": "...", "label": "...", ... }
}

EDGE STRUCTURE:
{
  "id": "edge_id",
  "source": "source_node_id",
  "target": "target_node_id",
  "sourceHandle": null (or "true"/"false" for smart_condition branches),
  "animated": true,
  "style": { "stroke": "#94a3b8", "strokeWidth": 2 }
}

POSITIONING RULES:
- Start trigger at x:250, y:50
- Space nodes vertically by 150px
- For branches (smart_condition): true path goes left (x:100), false path goes right (x:400)
- Merge branches back to center (x:250) after

EXAMPLE 1 - Stage-based workflow:
Prompt: "Create a follow-up sequence for New Lead Stage"
Output:
{
  "name": "New Lead Follow-up",
  "nodes": [
    {"id":"1","type":"custom","position":{"x":250,"y":50},"data":{"type":"trigger","triggerType":"stage_change","label":"New Lead Stage","description":"Triggered when lead enters New Lead stage"}},
    {"id":"2","type":"custom","position":{"x":250,"y":200},"data":{"type":"message","label":"Initial Hello","messageMode":"custom","messageText":"Hey! 👋 Saw you checking us out. Quick question - what caught your attention?"}},
    {"id":"3","type":"custom","position":{"x":250,"y":350},"data":{"type":"wait","label":"Wait 1 Hour","waitMode":"duration","duration":"1","unit":"hours"}},
    {"id":"4","type":"custom","position":{"x":250,"y":500},"data":{"type":"smart_condition","label":"Did they reply?","conditionType":"has_replied"}}
  ],
  "edges": [
    {"id":"e1","source":"1","target":"2","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
    {"id":"e2","source":"2","target":"3","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
    {"id":"e3","source":"3","target":"4","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}}
  ]
}

EXAMPLE 2 - Appointment reminder workflow:
Prompt: "Create appointment reminders"
Output:
{
  "name": "Appointment Reminders",
  "nodes": [
    {"id":"1","type":"custom","position":{"x":250,"y":50},"data":{"type":"trigger","triggerType":"appointment_booked","label":"Appointment Booked","description":"Triggered when customer books an appointment"}},
    {"id":"2","type":"custom","position":{"x":250,"y":200},"data":{"type":"wait","label":"1 Day Before","waitMode":"before_appointment","duration":"1","unit":"days"}},
    {"id":"3","type":"custom","position":{"x":250,"y":350},"data":{"type":"message","label":"Day Before Reminder","messageMode":"custom","messageText":"Hi! 👋 Just a friendly reminder - your appointment is tomorrow. See you then!"}},
    {"id":"4","type":"custom","position":{"x":250,"y":500},"data":{"type":"wait","label":"1 Hour Before","waitMode":"before_appointment","duration":"1","unit":"hours"}},
    {"id":"5","type":"custom","position":{"x":250,"y":650},"data":{"type":"message","label":"Hour Before Reminder","messageMode":"custom","messageText":"Your appointment is in 1 hour! 🕐 We're excited to see you soon."}}
  ],
  "edges": [
    {"id":"e1","source":"1","target":"2","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
    {"id":"e2","source":"2","target":"3","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
    {"id":"e3","source":"3","target":"4","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
    {"id":"e4","source":"4","target":"5","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}}
  ]
}`;

export async function generateWorkflow(prompt: string, stageId?: string): Promise<GeneratedWorkflow> {
    // Fetch business context in parallel
    const [rules, settings, knowledgeContext] = await Promise.all([
        getBotRules(),
        getBotSettings(),
        searchDocuments(prompt, 3) // Get relevant knowledge for this workflow topic
    ]);

    console.log('[WorkflowGenerator] Context loaded:', {
        rulesCount: rules.length,
        botName: settings.botName,
        hasKnowledge: !!knowledgeContext
    });

    // Build enhanced system prompt with business context
    let systemPrompt = BASE_SYSTEM_PROMPT;

    // Add bot personality context
    systemPrompt += `\n\nBOT PERSONALITY:
- Bot Name: ${settings.botName}
- Tone: ${settings.botTone}
- Keep messages consistent with this personality`;

    // Add business rules
    if (rules.length > 0) {
        systemPrompt += `\n\nBUSINESS RULES (follow these when creating messages):
${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
    }

    // Add knowledge base context
    if (knowledgeContext && knowledgeContext.trim().length > 0) {
        systemPrompt += `\n\nBUSINESS CONTEXT (use this information in messages):
${knowledgeContext.substring(0, 2000)}`;
    }

    systemPrompt += `\n\nMESSAGE STYLE GUIDELINES:
- Keep messages casual, short, and easy to respond to
- Use questions that prompt quick replies
- Add appropriate emojis sparingly
- Make messages feel personal, not robotic
- Reference business info from context when relevant
- Follow the bot personality and rules above`;

    const userPrompt = stageId
        ? `${prompt}\n\nNote: Use trigger stage ID: "${stageId}"`
        : prompt;

    // Retry logic with fallback models
    const models = [
        "meta/llama-3.1-70b-instruct",  // Faster, more reliable
        "qwen/qwen3-235b-a22b"           // Backup - larger but slower
    ];

    let lastError: Error | null = null;

    for (const model of models) {
        try {
            console.log(`[WorkflowGenerator] Trying model: ${model}`);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response: any = await client.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 4096,
            });

            const content = response.choices[0]?.message?.content;

            if (!content || content.trim().length === 0) {
                console.warn(`[WorkflowGenerator] Empty response from ${model}, trying next...`);
                lastError = new Error(`Empty response from ${model}`);
                continue;
            }

            console.log(`[WorkflowGenerator] Got response from ${model}:`, content.substring(0, 100));

            // Clean the response - remove markdown code blocks if present
            let jsonStr = content.trim();

            // Remove thinking tags if present (Qwen model artifact)
            if (jsonStr.includes('<think>')) {
                const thinkEnd = jsonStr.indexOf('</think>');
                if (thinkEnd !== -1) {
                    jsonStr = jsonStr.substring(thinkEnd + 8).trim();
                }
            }

            if (jsonStr.startsWith('```json')) {
                jsonStr = jsonStr.slice(7);
            }
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.slice(3);
            }
            if (jsonStr.endsWith('```')) {
                jsonStr = jsonStr.slice(0, -3);
            }
            jsonStr = jsonStr.trim();

            // Parse the JSON
            const workflow = JSON.parse(jsonStr) as GeneratedWorkflow;

            // Validate structure
            if (!workflow.name || !Array.isArray(workflow.nodes) || !Array.isArray(workflow.edges)) {
                console.warn(`[WorkflowGenerator] Invalid structure from ${model}, trying next...`);
                lastError = new Error('Invalid workflow structure');
                continue;
            }

            // Ensure all nodes have required fields
            workflow.nodes = workflow.nodes.map(node => ({
                ...node,
                type: 'custom' as const,
                data: {
                    ...node.data,
                    type: node.data.type || 'message',
                    label: node.data.label || 'Untitled Node',
                }
            }));

            // Ensure all edges have styling
            workflow.edges = workflow.edges.map(edge => ({
                ...edge,
                animated: edge.animated ?? true,
                style: edge.style || { stroke: '#94a3b8', strokeWidth: 2 }
            }));

            console.log('[WorkflowGenerator] Workflow generated:', workflow.name, 'with', workflow.nodes.length, 'nodes');

            return workflow;

        } catch (error) {
            console.error(`[WorkflowGenerator] Error with ${model}:`, error);
            lastError = error instanceof Error ? error : new Error(String(error));
            // Continue to next model
        }
    }

    // All models failed
    throw lastError || new Error('Failed to generate workflow after all retries');
}
