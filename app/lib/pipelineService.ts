import OpenAI from 'openai';
import { supabase } from './supabase';

// Constants
const MESSAGES_BEFORE_ANALYSIS = 5;
const TRIGGER_KEYWORDS = ['buy', 'price', 'order', 'payment', 'interested', 'how much', 'magkano', 'bili', 'bayad'];

// Initialize OpenAI client for NVIDIA
const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

// Types
interface Lead {
    id: string;
    sender_id: string;
    name: string | null;
    current_stage_id: string | null;
    message_count: number;
    last_analyzed_at: string | null;
    email: string | null;
    phone: string | null;
    goal_met_at: string | null;
}

interface PipelineStage {
    id: string;
    name: string;
    display_order: number;
    color: string;
}

// Get or create a lead record for a sender
export async function getOrCreateLead(senderId: string, pageAccessToken?: string): Promise<Lead | null> {
    try {
        // Check if lead exists
        const { data: existing } = await supabase
            .from('leads')
            .select('*')
            .eq('sender_id', senderId)
            .single();

        // Helper function to fetch Facebook profile using multiple methods
        const fetchFacebookProfile = async (): Promise<{ name: string | null; profilePic: string | null }> => {
            if (!pageAccessToken) {
                console.log('No page access token provided, skipping profile fetch');
                return { name: null, profilePic: null };
            }

            // Method 1: Try the standard Graph API (might work for some apps)
            try {
                const url = `https://graph.facebook.com/v21.0/${senderId}?fields=first_name,last_name,name,profile_pic&access_token=${pageAccessToken}`;
                console.log('Trying standard Graph API profile fetch:', senderId);

                const profileRes = await fetch(url);
                if (profileRes.ok) {
                    const profile = await profileRes.json();
                    const name = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || null;
                    if (name) {
                        console.log('Got profile from standard Graph API:', name);
                        return { name, profilePic: profile.profile_pic || null };
                    }
                }
            } catch (e) {
                console.log('Standard Graph API failed, trying alternatives...');
            }

            // Method 2: Try the Messenger Platform User Profile API
            try {
                const url = `https://graph.facebook.com/v21.0/me/personas?access_token=${pageAccessToken}`;
                // This won't give us the user's name, but we can try conversations
            } catch (e) {
                // Continue to next method
            }

            // Method 3: Try to find conversation and get participant info
            try {
                // Get conversations where this user is a participant
                const convUrl = `https://graph.facebook.com/v21.0/me/conversations?fields=participants,senders,updated_time&access_token=${pageAccessToken}`;
                console.log('Trying conversations API...');

                const convRes = await fetch(convUrl);
                if (convRes.ok) {
                    const convData = await convRes.json();

                    // Find conversation with this sender
                    for (const conv of convData.data || []) {
                        const participants = conv.participants?.data || conv.senders?.data || [];
                        for (const participant of participants) {
                            if (participant.id === senderId && participant.name) {
                                console.log('Got name from conversations API:', participant.name);
                                return { name: participant.name, profilePic: null };
                            }
                        }
                    }
                } else {
                    const errorData = await convRes.text();
                    console.log('Conversations API response:', convRes.status, errorData);
                }
            } catch (e) {
                console.log('Conversations API failed:', e);
            }

            // Method 4: Try direct conversation lookup
            try {
                const threadUrl = `https://graph.facebook.com/v21.0/t_${senderId}?fields=participants&access_token=${pageAccessToken}`;
                console.log('Trying direct thread lookup...');

                const threadRes = await fetch(threadUrl);
                if (threadRes.ok) {
                    const threadData = await threadRes.json();
                    const participants = threadData.participants?.data || [];
                    for (const participant of participants) {
                        if (participant.id === senderId && participant.name) {
                            console.log('Got name from thread lookup:', participant.name);
                            return { name: participant.name, profilePic: null };
                        }
                    }
                }
            } catch (e) {
                console.log('Thread lookup failed:', e);
            }

            console.log('All profile fetch methods failed for sender:', senderId);
            return { name: null, profilePic: null };
        };

        if (existing) {
            // If lead exists but has no name, try to fetch it
            if (!existing.name && pageAccessToken) {
                console.log('Existing lead has no name, attempting to fetch profile');
                const { name, profilePic } = await fetchFacebookProfile();

                if (name) {
                    await supabase
                        .from('leads')
                        .update({ name, profile_pic: profilePic })
                        .eq('id', existing.id);

                    return { ...existing, name, profile_pic: profilePic } as Lead;
                }
            }
            return existing as Lead;
        }

        // Fetch user profile from Facebook for new lead
        const { name: userName, profilePic } = await fetchFacebookProfile();

        // Get the default "New Lead" stage
        const { data: defaultStage } = await supabase
            .from('pipeline_stages')
            .select('id')
            .eq('is_default', true)
            .single();

        // Create new lead
        const { data: newLead, error: insertError } = await supabase
            .from('leads')
            .insert({
                sender_id: senderId,
                name: userName,
                profile_pic: profilePic,
                current_stage_id: defaultStage?.id || null,
                message_count: 0,
                last_message_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (insertError) {
            console.error('Error creating lead:', insertError);
            return null;
        }

        return newLead as Lead;
    } catch (error) {
        console.error('Error in getOrCreateLead:', error);
        return null;
    }

}


// Increment message count for a lead
export async function incrementMessageCount(leadId: string): Promise<number> {
    try {
        const { data, error } = await supabase
            .rpc('increment_lead_message_count', { lead_id: leadId });

        if (error) {
            // Fallback: fetch and update manually
            const { data: lead } = await supabase
                .from('leads')
                .select('message_count')
                .eq('id', leadId)
                .single();

            const newCount = (lead?.message_count || 0) + 1;

            await supabase
                .from('leads')
                .update({
                    message_count: newCount,
                    last_message_at: new Date().toISOString()
                })
                .eq('id', leadId);

            return newCount;
        }

        return data || 1;
    } catch (error) {
        console.error('Error incrementing message count:', error);
        return 0;
    }
}

// Check if we should analyze the lead's stage
export function shouldAnalyzeStage(lead: Lead, latestMessage: string): boolean {
    // Trigger after every N messages
    if (lead.message_count > 0 && lead.message_count % MESSAGES_BEFORE_ANALYSIS === 0) {
        return true;
    }

    // Trigger on keywords
    const lowerMessage = latestMessage.toLowerCase();
    for (const keyword of TRIGGER_KEYWORDS) {
        if (lowerMessage.includes(keyword)) {
            return true;
        }
    }

    return false;
}

// Analyze conversation and update stage
export async function analyzeAndUpdateStage(lead: Lead, senderId: string): Promise<void> {
    try {
        // Fetch recent conversation history
        const { data: messages, error: historyError } = await supabase
            .from('conversations')
            .select('role, content')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: true })
            .limit(20);

        if (historyError || !messages || messages.length === 0) {
            console.log('No conversation history to analyze');
            return;
        }

        // Fetch all pipeline stages
        const { data: stages, error: stagesError } = await supabase
            .from('pipeline_stages')
            .select('id, name, description')
            .order('display_order', { ascending: true });

        if (stagesError || !stages) {
            console.error('Error fetching stages:', stagesError);
            return;
        }

        // Build conversation summary
        const conversationSummary = messages
            .map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content}`)
            .join('\n');

        // Build stages list for prompt
        const stagesList = stages.map(s => `- ${s.name}: ${s.description || 'No description'}`).join('\n');

        // Call LLM to classify
        const prompt = `You are a sales pipeline classifier. Based on the conversation below, determine which pipeline stage this lead should be in.

AVAILABLE STAGES:
${stagesList}

CONVERSATION HISTORY:
${conversationSummary}

Respond with ONLY a JSON object in this exact format:
{"stage": "Stage Name", "reason": "Brief reason for classification"}

Choose the most appropriate stage based on the customer's intent, interest level, and conversation progress.`;

        const completion = await client.chat.completions.create({
            model: "deepseek-ai/deepseek-v3.1",
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 200,
        });

        const responseText = completion.choices[0]?.message?.content || '';
        console.log('Pipeline classification response:', responseText);

        // Parse JSON response
        let classification;
        try {
            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                classification = JSON.parse(jsonMatch[0]);
            }
        } catch (parseError) {
            console.error('Error parsing classification:', parseError);
            return;
        }

        if (!classification?.stage) {
            console.log('No stage classification returned');
            return;
        }

        // Find the matching stage
        const matchedStage = stages.find(s =>
            s.name.toLowerCase() === classification.stage.toLowerCase()
        );

        if (!matchedStage) {
            console.log('Stage not found:', classification.stage);
            return;
        }

        // Update lead if stage changed
        if (matchedStage.id !== lead.current_stage_id) {
            // Record stage change history
            await supabase
                .from('lead_stage_history')
                .insert({
                    lead_id: lead.id,
                    from_stage_id: lead.current_stage_id,
                    to_stage_id: matchedStage.id,
                    reason: classification.reason || 'AI classification',
                    changed_by: 'ai',
                });

            // Update lead's current stage
            await supabase
                .from('leads')
                .update({
                    current_stage_id: matchedStage.id,
                    last_analyzed_at: new Date().toISOString(),
                    ai_classification_reason: classification.reason,
                })
                .eq('id', lead.id);

            console.log(`Lead ${lead.id} moved to stage: ${matchedStage.name}`);

            // Trigger workflows for this stage change
            try {
                const { triggerWorkflowsForStage } = await import('./workflowEngine');
                await triggerWorkflowsForStage(matchedStage.id, lead.id);
            } catch (workflowError) {
                console.error('Error triggering workflows:', workflowError);
            }
        } else {
            // Just update last analyzed timestamp
            await supabase
                .from('leads')
                .update({ last_analyzed_at: new Date().toISOString() })
                .eq('id', lead.id);
        }
    } catch (error) {
        console.error('Error in analyzeAndUpdateStage:', error);
    }
}

// Get all leads grouped by stage
export async function getLeadsByStage(): Promise<Record<string, Lead[]>> {
    try {
        const { data: leads, error } = await supabase
            .from('leads')
            .select(`
                *,
                pipeline_stages (
                    id,
                    name,
                    display_order,
                    color
                )
            `)
            .order('last_message_at', { ascending: false });

        if (error) {
            console.error('Error fetching leads:', error);
            return {};
        }

        // Group by stage
        const grouped: Record<string, Lead[]> = {};
        for (const lead of leads || []) {
            const stageName = (lead as unknown as { pipeline_stages?: { name: string } }).pipeline_stages?.name || 'Unassigned';
            if (!grouped[stageName]) {
                grouped[stageName] = [];
            }
            grouped[stageName].push(lead);
        }

        return grouped;
    } catch (error) {
        console.error('Error in getLeadsByStage:', error);
        return {};
    }
}

// Get all pipeline stages
export async function getPipelineStages(): Promise<PipelineStage[]> {
    try {
        const { data, error } = await supabase
            .from('pipeline_stages')
            .select('*')
            .order('display_order', { ascending: true });

        if (error) {
            console.error('Error fetching stages:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error in getPipelineStages:', error);
        return [];
    }
}

// Move a lead to the "Payment Sent" stage when a receipt is detected
export async function moveLeadToReceiptStage(leadId: string, receiptImageUrl: string, reason: string): Promise<boolean> {
    try {
        // Find or create the "Payment Sent" stage
        let { data: paymentStage } = await supabase
            .from('pipeline_stages')
            .select('id')
            .eq('name', 'Payment Sent')
            .single();

        // If "Payment Sent" stage doesn't exist, create it
        if (!paymentStage) {
            const { data: newStage, error: createError } = await supabase
                .from('pipeline_stages')
                .insert({
                    name: 'Payment Sent',
                    display_order: 3, // After "Qualified" typically
                    color: '#22c55e', // Green color
                    description: 'Customer sent proof of payment',
                })
                .select()
                .single();

            if (createError) {
                console.error('Error creating Payment Sent stage:', createError);
                return false;
            }
            paymentStage = newStage;
        }

        // Get current lead info
        const { data: lead } = await supabase
            .from('leads')
            .select('current_stage_id')
            .eq('id', leadId)
            .single();

        if (!lead) {
            console.error('Lead not found:', leadId);
            return false;
        }

        if (!paymentStage) {
            console.error('Payment stage not available');
            return false;
        }

        // Only update if not already in Payment Sent stage
        if (lead.current_stage_id === paymentStage.id) {
            console.log('Lead already in Payment Sent stage');
            return true;
        }

        // Record stage change history
        await supabase
            .from('lead_stage_history')
            .insert({
                lead_id: leadId,
                from_stage_id: lead.current_stage_id,
                to_stage_id: paymentStage.id,
                reason: reason,
                changed_by: 'ai_receipt_detection',
            });

        // Update lead's current stage and receipt info
        const { error: updateError } = await supabase
            .from('leads')
            .update({
                current_stage_id: paymentStage.id,
                receipt_image_url: receiptImageUrl,
                receipt_detected_at: new Date().toISOString(),
                ai_classification_reason: reason,
            })
            .eq('id', leadId);

        if (updateError) {
            console.error('Error updating lead stage:', updateError);
            return false;
        }

        console.log(`Lead ${leadId} moved to Payment Sent stage`);

        // Trigger workflows for this stage change
        try {
            const { triggerWorkflowsForStage } = await import('./workflowEngine');
            await triggerWorkflowsForStage(paymentStage.id, leadId);
        } catch (workflowError) {
            console.error('Error triggering workflows:', workflowError);
        }

        return true;
    } catch (error) {
        console.error('Error in moveLeadToReceiptStage:', error);
        return false;
    }
}

// Move a lead to the "Appointment Scheduled" stage when an appointment is booked
export async function moveLeadToAppointmentStage(
    senderId: string,
    appointmentDetails: { appointmentId: string; appointmentDate: string; startTime: string }
): Promise<boolean> {
    try {
        // Get lead by sender_id
        const { data: lead } = await supabase
            .from('leads')
            .select('id, current_stage_id')
            .eq('sender_id', senderId)
            .single();

        if (!lead) {
            console.log('Lead not found for sender:', senderId);
            return false;
        }

        // Find or create the "Appointment Scheduled" stage
        let { data: appointmentStage } = await supabase
            .from('pipeline_stages')
            .select('id')
            .eq('name', 'Appointment Scheduled')
            .single();

        // If "Appointment Scheduled" stage doesn't exist, create it
        if (!appointmentStage) {
            const { data: newStage, error: createError } = await supabase
                .from('pipeline_stages')
                .insert({
                    name: 'Appointment Scheduled',
                    display_order: 2,
                    color: '#8b5cf6', // Purple color
                    description: 'Customer has booked an appointment',
                })
                .select()
                .single();

            if (createError) {
                console.error('Error creating Appointment Scheduled stage:', createError);
                return false;
            }
            appointmentStage = newStage;
        }

        if (!appointmentStage) {
            console.error('Appointment Scheduled stage not available');
            return false;
        }

        // Only update if not already in Appointment Scheduled stage
        if (lead.current_stage_id === appointmentStage.id) {
            console.log('Lead already in Appointment Scheduled stage');
            return true;
        }

        // Record stage change history
        await supabase
            .from('lead_stage_history')
            .insert({
                lead_id: lead.id,
                from_stage_id: lead.current_stage_id,
                to_stage_id: appointmentStage.id,
                reason: `Booked appointment for ${appointmentDetails.appointmentDate} at ${appointmentDetails.startTime}`,
                changed_by: 'appointment_booking',
            });

        // Update lead's current stage
        const { error: updateError } = await supabase
            .from('leads')
            .update({
                current_stage_id: appointmentStage.id,
                ai_classification_reason: `Booked appointment (ID: ${appointmentDetails.appointmentId})`,
            })
            .eq('id', lead.id);

        if (updateError) {
            console.error('Error updating lead stage:', updateError);
            return false;
        }

        console.log(`📅 Lead ${lead.id} moved to Appointment Scheduled stage`);

        // Trigger workflows for this stage change
        try {
            const { triggerWorkflowsForStage } = await import('./workflowEngine');
            await triggerWorkflowsForStage(appointmentStage.id, lead.id);
        } catch (workflowError) {
            console.error('Error triggering workflows:', workflowError);
        }

        return true;
    } catch (error) {
        console.error('Error in moveLeadToAppointmentStage:', error);
        return false;
    }
}
