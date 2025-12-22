import { supabase } from './supabase';
import { sendMessengerMessage } from './messengerService';
import { getBotResponse, getLatestConversationSummary } from './chatService';

// ============================================================================
// TYPES
// ============================================================================

interface Lead {
    id: string;
    sender_id: string;
    name: string | null;
    follow_up_count: number;
    last_bot_message_at: string | null;
    last_customer_message_at: string | null;
    next_follow_up_at: string | null;
    follow_up_enabled: boolean;
}

interface FollowUpSettings {
    base_intervals: number[];
    min_interval_minutes: number;
    max_interval_minutes: number;
    active_hours_start: string;
    active_hours_end: string;
    ml_learning_enabled: boolean;
    ml_weight_recent: number;
    is_enabled: boolean;
}

interface ResponsePattern {
    hour_of_day: number;
    response_delay_minutes: number | null;
    did_respond: boolean;
}

// ============================================================================
// SETTINGS CACHE
// ============================================================================

let cachedSettings: FollowUpSettings | null = null;
let settingsLastFetched = 0;
const SETTINGS_CACHE_MS = 60000; // 1 minute

async function getFollowUpSettings(): Promise<FollowUpSettings> {
    const now = Date.now();
    if (cachedSettings && now - settingsLastFetched < SETTINGS_CACHE_MS) {
        return cachedSettings;
    }

    const { data, error } = await supabase
        .from('follow_up_settings')
        .select('*')
        .limit(1)
        .single();

    if (error || !data) {
        // Return defaults if no settings found
        return {
            base_intervals: [5, 15, 30, 60, 120, 240, 480],
            min_interval_minutes: 5,
            max_interval_minutes: 1440,
            active_hours_start: '08:00:00',
            active_hours_end: '21:00:00',
            ml_learning_enabled: true,
            ml_weight_recent: 0.7,
            is_enabled: true,
        };
    }

    cachedSettings = data as FollowUpSettings;
    settingsLastFetched = now;
    return cachedSettings;
}

// ============================================================================
// ML-BASED TIMING OPTIMIZATION
// ============================================================================

/**
 * Calculate the optimal follow-up time based on:
 * 1. Base interval progression (5min, 15min, 30min...)
 * 2. Historical response patterns for this lead
 * 3. Global response patterns (what hours work best)
 * 4. Current time (respect active hours)
 */
export async function calculateOptimalFollowUpTime(
    senderId: string,
    attemptCount: number
): Promise<Date> {
    const settings = await getFollowUpSettings();
    const now = new Date();

    // Start with base interval
    const baseIntervals = settings.base_intervals;
    const intervalIndex = Math.min(attemptCount, baseIntervals.length - 1);
    let intervalMinutes = baseIntervals[intervalIndex];

    // If ML is enabled, adjust based on patterns
    if (settings.ml_learning_enabled) {
        const optimalInterval = await getMLOptimizedInterval(senderId, attemptCount, intervalMinutes);
        intervalMinutes = optimalInterval;
    }

    // Calculate target time
    let targetTime = new Date(now.getTime() + intervalMinutes * 60000);

    // Adjust for active hours
    targetTime = adjustForActiveHours(targetTime, settings);

    return targetTime;
}

/**
 * Get ML-optimized interval based on response patterns
 */
async function getMLOptimizedInterval(
    senderId: string,
    attemptCount: number,
    baseInterval: number
): Promise<number> {
    const settings = await getFollowUpSettings();

    // Get this lead's response patterns
    const { data: leadPatterns } = await supabase
        .from('follow_up_response_patterns')
        .select('hour_of_day, response_delay_minutes, did_respond')
        .eq('sender_id', senderId)
        .eq('did_respond', true)
        .order('created_at', { ascending: false })
        .limit(10);

    // Get global response patterns (successful responses)
    const { data: globalPatterns } = await supabase
        .from('follow_up_response_patterns')
        .select('hour_of_day, response_delay_minutes, did_respond')
        .eq('did_respond', true)
        .order('created_at', { ascending: false })
        .limit(100);

    // If no patterns yet, use base interval
    if ((!leadPatterns || leadPatterns.length === 0) && (!globalPatterns || globalPatterns.length === 0)) {
        return baseInterval;
    }

    // Calculate average response time for this lead
    let leadAvgDelay = 0;
    if (leadPatterns && leadPatterns.length > 0) {
        const delays = leadPatterns
            .filter(p => p.response_delay_minutes !== null)
            .map(p => p.response_delay_minutes as number);
        if (delays.length > 0) {
            leadAvgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
        }
    }

    // Calculate global average
    let globalAvgDelay = baseInterval;
    if (globalPatterns && globalPatterns.length > 0) {
        const delays = globalPatterns
            .filter(p => p.response_delay_minutes !== null)
            .map(p => p.response_delay_minutes as number);
        if (delays.length > 0) {
            globalAvgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
        }
    }

    // Blend lead-specific and global patterns
    const mlWeight = settings.ml_weight_recent;
    let optimizedInterval: number;

    if (leadPatterns && leadPatterns.length >= 3) {
        // Enough lead data - weight heavily toward lead patterns
        optimizedInterval = leadAvgDelay * mlWeight + globalAvgDelay * (1 - mlWeight);
    } else if (leadPatterns && leadPatterns.length > 0) {
        // Some lead data - blend equally
        optimizedInterval = (leadAvgDelay + globalAvgDelay + baseInterval) / 3;
    } else {
        // No lead data - use global with base influence
        optimizedInterval = globalAvgDelay * 0.6 + baseInterval * 0.4;
    }

    // Apply attempt multiplier (wait longer for later attempts)
    const attemptMultiplier = 1 + (attemptCount * 0.2);
    optimizedInterval = optimizedInterval * attemptMultiplier;

    // Clamp to min/max
    optimizedInterval = Math.max(settings.min_interval_minutes, optimizedInterval);
    optimizedInterval = Math.min(settings.max_interval_minutes, optimizedInterval);

    console.log(`[FollowUp] ML interval for ${senderId}: base=${baseInterval}, optimized=${Math.round(optimizedInterval)}`);

    return Math.round(optimizedInterval);
}

/**
 * Adjust target time to fall within active hours
 */
function adjustForActiveHours(targetTime: Date, settings: FollowUpSettings): Date {
    const [startHour, startMin] = settings.active_hours_start.split(':').map(Number);
    const [endHour, endMin] = settings.active_hours_end.split(':').map(Number);

    const targetHour = targetTime.getHours();
    const targetMin = targetTime.getMinutes();
    const targetTimeNum = targetHour * 60 + targetMin;
    const startTimeNum = startHour * 60 + startMin;
    const endTimeNum = endHour * 60 + endMin;

    // If target is within active hours, return as-is
    if (targetTimeNum >= startTimeNum && targetTimeNum <= endTimeNum) {
        return targetTime;
    }

    // If target is after end time, schedule for next day's start
    if (targetTimeNum > endTimeNum) {
        const nextDay = new Date(targetTime);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setHours(startHour, startMin, 0, 0);
        return nextDay;
    }

    // If target is before start time, schedule for today's start
    const sameDay = new Date(targetTime);
    sameDay.setHours(startHour, startMin, 0, 0);
    return sameDay;
}

// ============================================================================
// GET BEST HOUR TO CONTACT
// ============================================================================

/**
 * Find the hour of day when this lead (or leads globally) are most responsive
 */
export async function getBestHourToContact(senderId?: string): Promise<number> {
    // Query response patterns grouped by hour
    let query = supabase
        .from('follow_up_response_patterns')
        .select('hour_of_day, did_respond')
        .eq('did_respond', true);

    if (senderId) {
        query = query.eq('sender_id', senderId);
    }

    const { data: patterns } = await query.limit(200);

    if (!patterns || patterns.length === 0) {
        return 10; // Default: 10 AM
    }

    // Count responses by hour
    const hourCounts: Record<number, number> = {};
    patterns.forEach(p => {
        hourCounts[p.hour_of_day] = (hourCounts[p.hour_of_day] || 0) + 1;
    });

    // Find hour with most responses
    let bestHour = 10;
    let maxCount = 0;
    for (const [hour, count] of Object.entries(hourCounts)) {
        if (count > maxCount) {
            maxCount = count;
            bestHour = parseInt(hour);
        }
    }

    return bestHour;
}

// ============================================================================
// AI MESSAGE GENERATION
// ============================================================================

const FOLLOW_UP_STRATEGIES = [
    {
        name: 'value_question',
        prompt: `Generate a follow-up message that offers value or asks a thought-provoking question related to the conversation. Make them curious to respond.`
    },
    {
        name: 'simpler_question',
        prompt: `Rephrase your last question in a simpler, more engaging way. Make it super easy to answer - maybe yes/no or a quick choice.`
    },
    {
        name: 'new_angle',
        prompt: `Offer something new related to their interests - a quick tip, interesting fact, or related option they might not have considered.`
    },
    {
        name: 'curiosity_hook',
        prompt: `Create curiosity with an open-ended question or intriguing statement that makes them want to know more.`
    },
    {
        name: 'helpful_nudge',
        prompt: `Send a helpful nudge - acknowledge they might be busy and offer a simple next step or ask what's holding them back.`
    }
];

/**
 * Generate an AI-powered follow-up message based on conversation context
 */
export async function generateFollowUpMessage(
    senderId: string,
    attemptCount: number
): Promise<string> {
    // Get conversation history
    const { data: messages } = await supabase
        .from('conversations')
        .select('role, content')
        .eq('sender_id', senderId)
        .order('created_at', { ascending: false })
        .limit(15);

    // Get conversation summary for context
    const summary = await getLatestConversationSummary(senderId);

    // Build conversation context
    const conversationContext = messages
        ?.reverse()
        .map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content}`)
        .join('\n') || 'No recent conversation.';

    // Select strategy based on attempt count (cycle through strategies)
    const strategyIndex = attemptCount % FOLLOW_UP_STRATEGIES.length;
    const strategy = FOLLOW_UP_STRATEGIES[strategyIndex];

    const prompt = `You are a skilled sales assistant following up with a customer who hasn't replied.

CONTEXT:
${summary ? `Summary: ${summary}\n` : ''}
Recent conversation:
${conversationContext}

STRATEGY: ${strategy.name}
${strategy.prompt}

RULES:
1. DO NOT say things like "Uy, stop scrolling" or "Are you still there?"
2. DO NOT be pushy or desperate
3. BE valuable, helpful, or curiosity-inducing
4. Keep it SHORT (1-2 sentences max)
5. Match the language used in the conversation (Tagalog/Taglish if they used it)
6. If they were asking about specific products/services, reference that context
7. Make it easy for them to respond with a simple answer

Generate ONLY the follow-up message, nothing else:`;

    try {
        const message = await getBotResponse(prompt, `followup_${senderId}_${Date.now()}`);

        // Clean up the response (remove quotes if wrapped)
        let cleanedMessage = message.trim();
        if (cleanedMessage.startsWith('"') && cleanedMessage.endsWith('"')) {
            cleanedMessage = cleanedMessage.slice(1, -1);
        }

        return cleanedMessage;
    } catch (error) {
        console.error('[FollowUp] Error generating message:', error);
        // Fallback messages
        const fallbacks = [
            'May I help you with anything else? 😊',
            'Let me know if you have any questions!',
            'I\'m here if you need more info.',
        ];
        return fallbacks[attemptCount % fallbacks.length];
    }
}

// ============================================================================
// CORE FOLLOW-UP LOGIC
// ============================================================================

// Pipeline stages that should exclude leads from follow-up
const EXCLUDED_STAGE_NAMES = ['Won', 'Appointment Scheduled', 'Delivered', 'Closed'];

// Order statuses that indicate an active/ongoing order
const ACTIVE_ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped'];

// Appointment statuses that indicate an active/upcoming appointment
const ACTIVE_APPOINTMENT_STATUSES = ['pending', 'confirmed'];

/**
 * Get all leads that need a follow-up right now
 * Excludes leads who:
 * - Have already bought (Won/Delivered stage)
 * - Have booked an appointment (Appointment Scheduled stage or upcoming appointment)
 * - Have an ongoing order (active order status)
 */
export async function getLeadsNeedingFollowUp(limit: number = 10): Promise<Lead[]> {
    const settings = await getFollowUpSettings();

    if (!settings.is_enabled) {
        console.log('[FollowUp] System disabled globally');
        return [];
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const todayDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Step 1: Get IDs of excluded pipeline stages
    const { data: excludedStages } = await supabase
        .from('pipeline_stages')
        .select('id, name')
        .in('name', EXCLUDED_STAGE_NAMES);

    const excludedStageIds = (excludedStages || []).map(s => s.id);
    console.log(`[FollowUp] Excluded stages: ${excludedStages?.map(s => s.name).join(', ') || 'none'}`);

    // Step 2: Get sender_ids of leads with active orders
    const { data: activeOrders } = await supabase
        .from('orders')
        .select('lead_id, leads!inner(sender_id)')
        .in('status', ACTIVE_ORDER_STATUSES);

    const senderIdsWithActiveOrders = new Set(
        (activeOrders || [])
            .map(o => {
                // Supabase returns the joined lead data - extract sender_id safely
                const leadData = o.leads as unknown as { sender_id: string } | null;
                return leadData?.sender_id;
            })
            .filter((id): id is string => Boolean(id))
    );
    console.log(`[FollowUp] Leads with active orders: ${senderIdsWithActiveOrders.size}`);

    // Step 3: Get sender_ids of leads with upcoming appointments
    const { data: upcomingAppointments } = await supabase
        .from('appointments')
        .select('sender_psid')
        .in('status', ACTIVE_APPOINTMENT_STATUSES)
        .gte('appointment_date', todayDate);

    const senderIdsWithAppointments = new Set(
        (upcomingAppointments || []).map(a => a.sender_psid)
    );
    console.log(`[FollowUp] Leads with upcoming appointments: ${senderIdsWithAppointments.size}`);

    // Step 4: Query leads with basic filters
    let query = supabase
        .from('leads')
        .select('id, sender_id, name, follow_up_count, last_bot_message_at, last_customer_message_at, next_follow_up_at, follow_up_enabled, current_stage_id')
        .eq('follow_up_enabled', true)
        .eq('bot_disabled', false)
        .not('next_follow_up_at', 'is', null)
        .lte('next_follow_up_at', nowIso)
        .order('next_follow_up_at', { ascending: true })
        .limit(limit * 3); // Fetch more to account for filtering

    const { data: leads, error } = await query;

    if (error) {
        console.error('[FollowUp] Error fetching leads:', error);
        return [];
    }

    // Step 5: Filter out excluded leads
    const filtered = (leads || []).filter(lead => {
        // Check 1: Bot must have messaged
        if (!lead.last_bot_message_at) {
            return false;
        }

        // Check 2: Customer hasn't replied since bot's last message
        if (lead.last_customer_message_at &&
            new Date(lead.last_customer_message_at) > new Date(lead.last_bot_message_at)) {
            return false;
        }

        // Check 3: Not in an excluded pipeline stage (bought, appointment scheduled, etc.)
        if (lead.current_stage_id && excludedStageIds.includes(lead.current_stage_id)) {
            console.log(`[FollowUp] Excluding ${lead.name || lead.sender_id}: in excluded stage`);
            return false;
        }

        // Check 4: No active orders
        if (senderIdsWithActiveOrders.has(lead.sender_id)) {
            console.log(`[FollowUp] Excluding ${lead.name || lead.sender_id}: has active order`);
            return false;
        }

        // Check 5: No upcoming appointments
        if (senderIdsWithAppointments.has(lead.sender_id)) {
            console.log(`[FollowUp] Excluding ${lead.name || lead.sender_id}: has upcoming appointment`);
            return false;
        }

        return true;
    });

    // Limit to requested number after filtering
    const result = filtered.slice(0, limit);

    console.log(`[FollowUp] Found ${result.length} leads needing follow-up (after exclusions)`);
    return result as Lead[];
}

/**
 * Send a follow-up message to a lead
 */
export async function sendFollowUp(lead: Lead): Promise<boolean> {
    console.log(`[FollowUp] Sending follow-up #${lead.follow_up_count + 1} to ${lead.name || lead.sender_id}`);

    try {
        // Generate AI message
        const message = await generateFollowUpMessage(lead.sender_id, lead.follow_up_count);
        console.log(`[FollowUp] Generated message: ${message}`);

        // Send via Messenger with message tag (for outside 24hr window)
        const sent = await sendMessengerMessage(lead.sender_id, message, {
            messagingType: 'MESSAGE_TAG',
            tag: 'ACCOUNT_UPDATE',
        });

        if (!sent) {
            console.error('[FollowUp] Failed to send message');
            return false;
        }

        // Track the pattern (for ML learning)
        const now = new Date();
        await supabase.from('follow_up_response_patterns').insert({
            lead_id: lead.id,
            sender_id: lead.sender_id,
            follow_up_sent_at: now.toISOString(),
            hour_of_day: now.getHours(),
            day_of_week: now.getDay(),
            follow_up_attempt: lead.follow_up_count + 1,
            message_type: FOLLOW_UP_STRATEGIES[lead.follow_up_count % FOLLOW_UP_STRATEGIES.length].name,
            did_respond: false,
        });

        // Calculate next follow-up time
        const nextFollowUpTime = await calculateOptimalFollowUpTime(
            lead.sender_id,
            lead.follow_up_count + 1
        );

        // Update lead
        await supabase
            .from('leads')
            .update({
                follow_up_count: lead.follow_up_count + 1,
                last_bot_message_at: now.toISOString(),
                next_follow_up_at: nextFollowUpTime.toISOString(),
            })
            .eq('id', lead.id);

        // Store the message in conversation history
        await supabase.from('conversations').insert({
            sender_id: lead.sender_id,
            role: 'assistant',
            content: message,
        });

        console.log(`[FollowUp] Success! Next follow-up at ${nextFollowUpTime.toISOString()}`);
        return true;
    } catch (error) {
        console.error('[FollowUp] Error sending follow-up:', error);
        return false;
    }
}

/**
 * Mark that a customer has replied (resets follow-up tracking)
 * Call this when a customer sends a message
 */
export async function markCustomerReplied(senderId: string): Promise<void> {
    const now = new Date();

    // Update lead
    const { data: lead } = await supabase
        .from('leads')
        .select('id, last_bot_message_at, follow_up_count')
        .eq('sender_id', senderId)
        .single();

    if (!lead) return;

    // Update response patterns - mark recent follow-ups as responded
    if (lead.last_bot_message_at) {
        const lastBotTime = new Date(lead.last_bot_message_at);
        const responseDelayMinutes = Math.round((now.getTime() - lastBotTime.getTime()) / 60000);

        // Update the most recent follow-up pattern for this lead
        await supabase
            .from('follow_up_response_patterns')
            .update({
                did_respond: true,
                response_received_at: now.toISOString(),
                response_delay_minutes: responseDelayMinutes,
            })
            .eq('sender_id', senderId)
            .eq('did_respond', false)
            .order('created_at', { ascending: false })
            .limit(1);
    }

    // Reset follow-up state - customer has engaged!
    await supabase
        .from('leads')
        .update({
            follow_up_count: 0,
            last_customer_message_at: now.toISOString(),
            next_follow_up_at: null,  // Clear - will be set again if bot responds
        })
        .eq('id', lead.id);

    console.log(`[FollowUp] Customer ${senderId} replied, reset follow-up tracking`);
}

/**
 * Schedule the next follow-up after bot sends a message
 * Call this after the bot responds to a customer
 */
export async function scheduleNextFollowUp(senderId: string): Promise<void> {
    const settings = await getFollowUpSettings();

    if (!settings.is_enabled) return;

    const { data: lead } = await supabase
        .from('leads')
        .select('id, follow_up_count, follow_up_enabled')
        .eq('sender_id', senderId)
        .single();

    if (!lead || !lead.follow_up_enabled) return;

    const now = new Date();
    const nextFollowUpTime = await calculateOptimalFollowUpTime(senderId, lead.follow_up_count);

    await supabase
        .from('leads')
        .update({
            last_bot_message_at: now.toISOString(),
            next_follow_up_at: nextFollowUpTime.toISOString(),
        })
        .eq('id', lead.id);

    console.log(`[FollowUp] Scheduled next follow-up for ${senderId} at ${nextFollowUpTime.toISOString()}`);
}

/**
 * Disable follow-ups for a specific lead
 */
export async function disableFollowUpsForLead(senderId: string): Promise<void> {
    await supabase
        .from('leads')
        .update({
            follow_up_enabled: false,
            next_follow_up_at: null,
        })
        .eq('sender_id', senderId);
}

/**
 * Enable follow-ups for a specific lead
 */
export async function enableFollowUpsForLead(senderId: string): Promise<void> {
    await supabase
        .from('leads')
        .update({ follow_up_enabled: true })
        .eq('sender_id', senderId);
}
