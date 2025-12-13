import { supabase } from './supabase';

// Types
export type ActivityType =
    | 'product_view'
    | 'property_view'
    | 'property_inquiry'
    | 'appointment_booked'
    | 'appointment_cancelled'
    | 'payment_sent'
    | 'add_to_cart';

export interface LeadActivity {
    id: string;
    lead_id: string | null;
    sender_id: string;
    activity_type: ActivityType;
    item_id: string | null;
    item_name: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
}

/**
 * Track a customer activity (product view, property view, appointment, etc.)
 */
export async function trackActivity(
    senderId: string,
    activityType: ActivityType,
    itemId?: string,
    itemName?: string,
    metadata?: Record<string, unknown>
): Promise<void> {
    try {
        // Get lead_id from sender_id if exists
        const { data: lead } = await supabase
            .from('leads')
            .select('id')
            .eq('sender_id', senderId)
            .single();

        const { error } = await supabase
            .from('lead_activities')
            .insert({
                lead_id: lead?.id || null,
                sender_id: senderId,
                activity_type: activityType,
                item_id: itemId || null,
                item_name: itemName || null,
                metadata: metadata || {},
            });

        if (error) {
            console.error('Error tracking activity:', error);
        } else {
            console.log(`📊 Activity tracked: ${activityType} - ${itemName || itemId || 'N/A'} for sender ${senderId}`);
        }
    } catch (error) {
        console.error('Error in trackActivity:', error);
    }
}

/**
 * Get recent activities for a sender (for AI context)
 */
export async function getRecentActivities(
    senderId: string,
    limit: number = 10
): Promise<LeadActivity[]> {
    try {
        const { data, error } = await supabase
            .from('lead_activities')
            .select('*')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching activities:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error in getRecentActivities:', error);
        return [];
    }
}

/**
 * Format activities for AI system prompt context
 */
export function buildActivityContextForAI(activities: LeadActivity[]): string {
    if (!activities || activities.length === 0) {
        return '';
    }

    const now = new Date();
    const lines: string[] = [];

    for (const activity of activities) {
        const activityDate = new Date(activity.created_at);
        const timeDiff = formatTimeDiff(now, activityDate);

        let description = '';
        switch (activity.activity_type) {
            case 'product_view':
                description = `Viewed product "${activity.item_name || activity.item_id}"`;
                if (activity.metadata?.variations) {
                    description += ` (selected: ${activity.metadata.variations})`;
                }
                break;
            case 'property_view':
                description = `Viewed property "${activity.item_name || activity.item_id}"`;
                break;
            case 'property_inquiry':
                description = `Inquired about property "${activity.item_name || activity.item_id}"`;
                break;
            case 'appointment_booked':
                const appointmentDate = activity.metadata?.appointment_date;
                const appointmentTime = activity.metadata?.start_time;
                if (appointmentDate && appointmentTime) {
                    description = `Booked appointment for ${appointmentDate} at ${appointmentTime}`;
                } else {
                    description = `Booked an appointment`;
                }
                break;
            case 'appointment_cancelled':
                description = `Cancelled their appointment`;
                break;
            case 'payment_sent':
                description = `Sent payment proof`;
                if (activity.metadata?.amount) {
                    description += ` (₱${activity.metadata.amount})`;
                }
                break;
            case 'add_to_cart':
                description = `Added "${activity.item_name || activity.item_id}" to cart`;
                break;
            default:
                description = `${activity.activity_type}: ${activity.item_name || activity.item_id || 'N/A'}`;
        }

        lines.push(`- ${description} (${timeDiff})`);
    }

    return `CUSTOMER ACTIVITY HISTORY (Recent actions by this customer):
${lines.join('\n')}

Use this information to personalize your responses. Reference items they've viewed or follow up on appointments.
`;
}

/**
 * Helper to format time difference in human-readable form
 */
function formatTimeDiff(now: Date, past: Date): string {
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return past.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}
