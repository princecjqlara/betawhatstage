import { supabase } from '@/app/lib/supabase';
import { unstable_cache } from 'next/cache';

// Types
export interface DashboardMetrics {
    store: {
        isSetup: boolean;
        name: string | null;
        type: 'ecommerce' | 'real_estate' | 'digital_product' | null;
    };
    goal: {
        type: 'lead_generation' | 'appointment_booking' | 'tripping' | 'purchase';
        reached: number;
        total: number;
        percentage: number;
    };
    pipeline: {
        qualifiedCount: number;
        trend: 'up' | 'down' | 'stable';
        trendPercentage: number;
        percentage: number;
    };
}

export interface DashboardStatus {
    hasStore: boolean;
    hasFacebookPage: boolean;
    hasProducts: boolean;
}

export interface FlaggedLead {
    id: string;
    senderId: string;
    name: string;
    profilePic?: string;
    reason: string;
    flaggedAt: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
}

// E-commerce specific types
export interface CartAbandonmentLead {
    id: string;
    orderId: string;
    name: string;
    profilePic?: string;
    cartTotal: number;
    cartAgeHours: number;
    itemCount: number;
}

export interface TopProduct {
    id: string;
    name: string;
    imageUrl?: string;
    orderCount: number;
    revenue: number;
}

export interface EcommerceMetrics {
    revenue: {
        today: number;
        yesterday: number;
        trend: 'up' | 'down' | 'stable';
        trendPercentage: number;
    };
    orders: {
        pending: number;
        processing: number;
        shipped: number;
        delivered: number;
        total: number;
    };
    cartAbandonment: {
        count: number;
        leads: CartAbandonmentLead[];
    };
    topProducts: TopProduct[];
}

// Real Estate specific types
export interface LeadInsight {
    reason: string;
    count: number;
    description: string;
}

export interface Viewing {
    id: string;
    propertyTitle: string;
    leadName: string;
    time: string;
    status: 'scheduled' | 'completed' | 'cancelled' | 'pending';
}

export interface RealEstateMetrics {
    leads: {
        today: number;
        week: number;
        month: number;
        growth: number;
    };
    activeListings: number;
    propertiesUnderContract: number;
    viewings: {
        scheduled: number;
        pending: number;
        upcoming: Viewing[];
    };
    closureInsights: LeadInsight[];
    pipeline: {
        new: number;
        contacted: number;
        viewing: number;
        negotiating: number;
        closed: number;
    };
}

// Business Overview metrics (for OverviewCards component)
export interface OverviewMetrics {
    dailyLeads: {
        count: number;
        trend: 'up' | 'down' | 'stable';
        trendPercentage: number;
    };
    totalResponses: {
        count: number;
        responseRate: number;
    };
    activeConversations: number;
    pendingActions: number;
}

export interface DashboardData {
    metrics: DashboardMetrics | null;
    status: DashboardStatus | null;
    flaggedLeads: FlaggedLead[];
    activeSessions: Record<string, number>;
    overviewMetrics: OverviewMetrics | null;
}

// Fetch dashboard metrics with 60s cache
async function fetchMetricsUncached(): Promise<DashboardMetrics | null> {
    try {
        // 1. Get Store Settings
        const { data: storeSettings } = await supabase
            .from('store_settings')
            .select('store_name, store_type, setup_completed')
            .single();

        const store = {
            isSetup: !!storeSettings?.setup_completed,
            name: storeSettings?.store_name || null,
            type: storeSettings?.store_type as 'ecommerce' | 'real_estate' | null
        };

        // 2. Get Bot Settings for primary goal
        const { data: botSettings } = await supabase
            .from('bot_settings')
            .select('primary_goal')
            .single();

        const goalType = (botSettings?.primary_goal || 'lead_generation') as
            'lead_generation' | 'appointment_booking' | 'tripping' | 'purchase';

        // 2b. Get valid stages to filter phantom leads
        const { data: validStages } = await supabase
            .from('pipeline_stages')
            .select('id');
        const validStageIds = validStages?.map(s => s.id) || [];

        // 3. Get total leads count
        const { count: totalLeads } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .in('current_stage_id', validStageIds);

        // 4. Calculate goal reached based on goal type
        let reachedCount = 0;

        if (goalType === 'lead_generation') {
            const { count } = await supabase
                .from('leads')
                .select('*', { count: 'exact', head: true })
                .or('phone.not.is.null,email.not.is.null')
                .in('current_stage_id', validStageIds);
            reachedCount = count || 0;
        } else if (goalType === 'appointment_booking') {
            const { count } = await supabase
                .from('appointments')
                .select('sender_psid', { count: 'exact', head: true })
                .in('status', ['confirmed', 'pending']);
            reachedCount = count || 0;
        } else if (goalType === 'purchase') {
            const { count } = await supabase
                .from('orders')
                .select('lead_id', { count: 'exact', head: true })
                .in('status', ['confirmed', 'processing', 'shipped', 'delivered']);
            reachedCount = count || 0;
        } else if (goalType === 'tripping') {
            const { data: stages } = await supabase
                .from('pipeline_stages')
                .select('id, display_order')
                .gte('display_order', 2);

            if (stages && stages.length > 0) {
                const stageIds = stages.map(s => s.id);
                const { count } = await supabase
                    .from('leads')
                    .select('*', { count: 'exact', head: true })
                    .in('current_stage_id', stageIds);
                reachedCount = count || 0;
            }
        }

        const total = totalLeads || 0;
        const percentage = total > 0 ? Math.round((reachedCount / total) * 100) : 0;

        // 5. Get Pipeline Health - Positive stages
        const { data: positiveStages } = await supabase
            .from('pipeline_stages')
            .select('id, name')
            .in('name', ['Qualified', 'Negotiating', 'Won', 'Appointment Booked', 'Appointment Scheduled']);

        const positiveStageIds = positiveStages?.map(s => s.id) || [];

        let qualifiedCount = 0;
        let previousQualifiedCount = 0;

        if (positiveStageIds.length > 0) {
            const { count: currentCount } = await supabase
                .from('leads')
                .select('*', { count: 'exact', head: true })
                .in('current_stage_id', positiveStageIds);
            qualifiedCount = currentCount || 0;

            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { count: prevCount } = await supabase
                .from('lead_stage_history')
                .select('*', { count: 'exact', head: true })
                .in('to_stage_id', positiveStageIds)
                .lt('created_at', sevenDaysAgo.toISOString());
            previousQualifiedCount = prevCount || 0;
        }

        let trend: 'up' | 'down' | 'stable' = 'stable';
        let trendPercentage = 0;

        if (previousQualifiedCount > 0) {
            const diff = qualifiedCount - previousQualifiedCount;
            trendPercentage = Math.round((diff / previousQualifiedCount) * 100);
            trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable';
        } else if (qualifiedCount > 0) {
            trend = 'up';
            trendPercentage = 100;
        }

        return {
            store,
            goal: {
                type: goalType,
                reached: reachedCount,
                total,
                percentage
            },
            pipeline: {
                qualifiedCount,
                trend,
                trendPercentage: Math.abs(trendPercentage),
                percentage: total > 0 ? Math.round((qualifiedCount / total) * 100) : 0
            }
        };
    } catch (error) {
        console.error('Error fetching dashboard metrics:', error);
        return null;
    }
}

// Fetch dashboard status with 60s cache
async function fetchStatusUncached(): Promise<DashboardStatus | null> {
    try {
        const { data: storeSettings, error: storeError } = await supabase
            .from('store_settings')
            .select('id, setup_completed')
            .single();

        // hasStore is true only if record exists AND setup_completed is true
        const hasStore = !storeError && !!storeSettings && storeSettings.setup_completed === true;

        const { count: facebookCount, error: fbError } = await supabase
            .from('connected_pages')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        const hasFacebookPage = !fbError && (facebookCount || 0) > 0;

        const { count: productCount, error: productError } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true });

        const hasProducts = !productError && (productCount || 0) > 0;

        return { hasStore, hasFacebookPage, hasProducts };
    } catch (error) {
        console.error('Error fetching dashboard status:', error);
        return null;
    }
}

// Fetch flagged leads with 30s cache
async function fetchFlaggedLeadsUncached(): Promise<FlaggedLead[]> {
    try {
        const { data: leads, error } = await supabase
            .from('leads')
            .select('id, sender_psid, first_name, last_name, profile_pic, needs_human_attention, human_attention_reason, human_flag_priority, human_flagged_at')
            .eq('needs_human_attention', true)
            .order('human_flagged_at', { ascending: false })
            .limit(10);

        if (error || !leads) return [];

        return leads.map(lead => ({
            id: lead.id,
            senderId: lead.sender_psid,
            name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown User',
            profilePic: lead.profile_pic,
            reason: lead.human_attention_reason || 'Needs attention',
            flaggedAt: lead.human_flagged_at,
            priority: (lead.human_flag_priority || 'medium') as FlaggedLead['priority']
        }));
    } catch (error) {
        console.error('Error fetching flagged leads:', error);
        return [];
    }
}

// Fetch active takeover sessions with 30s cache
async function fetchActiveSessionsUncached(): Promise<Record<string, number>> {
    try {
        const now = new Date();
        const { data: sessions, error } = await supabase
            .from('human_takeover_sessions')
            .select('sender_psid, expires_at')
            .gt('expires_at', now.toISOString());

        if (error || !sessions) return {};

        const activeSessions: Record<string, number> = {};
        sessions.forEach(session => {
            const expiresAt = new Date(session.expires_at);
            const remainingMinutes = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 60000));
            activeSessions[session.sender_psid] = remainingMinutes;
        });

        return activeSessions;
    } catch (error) {
        console.error('Error fetching active sessions:', error);
        return {};
    }
}

// Fetch overview metrics for business overview card with 60s cache
async function fetchOverviewMetricsUncached(): Promise<OverviewMetrics | null> {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

        // 1. Daily Leads - Count leads created today vs yesterday
        const { count: todayLeads } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', todayStart.toISOString());

        const { count: yesterdayLeads } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', yesterdayStart.toISOString())
            .lt('created_at', todayStart.toISOString());

        const todayCount = todayLeads || 0;
        const yesterdayCount = yesterdayLeads || 0;

        let leadsTrend: 'up' | 'down' | 'stable' = 'stable';
        let leadsTrendPercentage = 0;
        if (yesterdayCount > 0) {
            const diff = todayCount - yesterdayCount;
            leadsTrendPercentage = Math.round((diff / yesterdayCount) * 100);
            leadsTrend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable';
        } else if (todayCount > 0) {
            leadsTrend = 'up';
            leadsTrendPercentage = 100;
        }

        // 2. Total Responses - Count all assistant messages and response rate
        const { count: totalMessages } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'assistant');

        const { count: userMessages } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'user');

        const totalResponses = totalMessages || 0;
        const totalUserMsgs = userMessages || 0;
        // Response rate = what percentage of user messages got a response
        const responseRate = totalUserMsgs > 0 ? Math.min(100, Math.round((totalResponses / totalUserMsgs) * 100)) : 100;

        // 3. Active Conversations - Leads with recent activity (last 24 hours)
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const { count: activeConvCount } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .gte('last_message_at', oneDayAgo.toISOString());

        // 4. Pending Actions - Leads needing human attention
        const { count: pendingCount } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('needs_human_attention', true);

        return {
            dailyLeads: {
                count: todayCount,
                trend: leadsTrend,
                trendPercentage: Math.abs(leadsTrendPercentage)
            },
            totalResponses: {
                count: totalResponses,
                responseRate
            },
            activeConversations: activeConvCount || 0,
            pendingActions: pendingCount || 0
        };
    } catch (error) {
        console.error('Error fetching overview metrics:', error);
        return null;
    }
}

// Cached versions using Next.js unstable_cache
export const getDashboardMetrics = unstable_cache(
    fetchMetricsUncached,
    ['dashboard-metrics'],
    { revalidate: 60, tags: ['dashboard'] }
);

export const getDashboardStatus = unstable_cache(
    fetchStatusUncached,
    ['dashboard-status'],
    { revalidate: 60, tags: ['dashboard'] }
);

export const getFlaggedLeads = unstable_cache(
    fetchFlaggedLeadsUncached,
    ['dashboard-flagged-leads'],
    { revalidate: 30, tags: ['dashboard', 'leads'] }
);

export const getActiveSessions = unstable_cache(
    fetchActiveSessionsUncached,
    ['dashboard-active-sessions'],
    { revalidate: 30, tags: ['dashboard', 'sessions'] }
);

export const getOverviewMetrics = unstable_cache(
    fetchOverviewMetricsUncached,
    ['dashboard-overview-metrics'],
    { revalidate: 60, tags: ['dashboard', 'overview'] }
);

// Main function to fetch all dashboard data in parallel
export async function getDashboardData(): Promise<DashboardData> {
    const [metrics, status, flaggedLeads, activeSessions, overviewMetrics] = await Promise.all([
        getDashboardMetrics(),
        getDashboardStatus(),
        getFlaggedLeads(),
        getActiveSessions(),
        getOverviewMetrics()
    ]);

    return { metrics, status, flaggedLeads, activeSessions, overviewMetrics };
}

// ============================================================================
// E-COMMERCE DASHBOARD METRICS
// ============================================================================

async function fetchEcommerceMetricsUncached(abandonmentHours: number = 24): Promise<EcommerceMetrics> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const abandonmentThreshold = new Date(now.getTime() - abandonmentHours * 60 * 60 * 1000);

    try {
        // 1. Revenue Calculation
        const { data: todayOrders } = await supabase
            .from('orders')
            .select('total_amount')
            .in('status', ['confirmed', 'processing', 'shipped', 'delivered'])
            .gte('created_at', todayStart.toISOString());

        const { data: yesterdayOrders } = await supabase
            .from('orders')
            .select('total_amount')
            .in('status', ['confirmed', 'processing', 'shipped', 'delivered'])
            .gte('created_at', yesterdayStart.toISOString())
            .lt('created_at', todayStart.toISOString());

        const todayRevenue = todayOrders?.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) || 0;
        const yesterdayRevenue = yesterdayOrders?.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) || 0;

        let revenueTrend: 'up' | 'down' | 'stable' = 'stable';
        let revenueTrendPercentage = 0;
        if (yesterdayRevenue > 0) {
            const diff = todayRevenue - yesterdayRevenue;
            revenueTrendPercentage = Math.round((diff / yesterdayRevenue) * 100);
            revenueTrend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable';
        } else if (todayRevenue > 0) {
            revenueTrend = 'up';
            revenueTrendPercentage = 100;
        }

        // 2. Order Status Counts
        const { count: pendingCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        const { count: processingCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'processing');

        const { count: shippedCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'shipped');

        const { count: deliveredCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'delivered');

        // 3. Cart Abandonment (pending orders older than threshold)
        const { data: abandonedOrders } = await supabase
            .from('orders')
            .select(`
                id,
                total_amount,
                created_at,
                lead_id,
                leads (
                    id,
                    name,
                    profile_pic
                )
            `)
            .eq('status', 'pending')
            .lt('created_at', abandonmentThreshold.toISOString())
            .order('created_at', { ascending: false })
            .limit(10);

        // Get item counts for abandoned orders
        const abandonedOrderIds = abandonedOrders?.map(o => o.id) || [];
        const { data: orderItemCounts } = abandonedOrderIds.length > 0
            ? await supabase
                .from('order_items')
                .select('order_id')
                .in('order_id', abandonedOrderIds)
            : { data: [] };

        const itemCountMap: Record<string, number> = {};
        orderItemCounts?.forEach(item => {
            itemCountMap[item.order_id] = (itemCountMap[item.order_id] || 0) + 1;
        });

        const cartAbandonmentLeads: CartAbandonmentLead[] = (abandonedOrders || []).map(order => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const lead = order.leads as any;
            const createdAt = new Date(order.created_at);
            const ageHours = Math.round((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
            return {
                id: lead?.id || '',
                orderId: order.id,
                name: lead?.name || 'Unknown',
                profilePic: lead?.profile_pic,
                cartTotal: Number(order.total_amount) || 0,
                cartAgeHours: ageHours,
                itemCount: itemCountMap[order.id] || 0
            };
        });

        // 4. Top Products (last 7 days)
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const { data: recentOrderIds } = await supabase
            .from('orders')
            .select('id')
            .in('status', ['confirmed', 'processing', 'shipped', 'delivered'])
            .gte('created_at', sevenDaysAgo.toISOString());

        const orderIds = recentOrderIds?.map(o => o.id) || [];

        let topProducts: TopProduct[] = [];
        if (orderIds.length > 0) {
            const { data: orderItems } = await supabase
                .from('order_items')
                .select(`
                    product_id,
                    product_name,
                    quantity,
                    total_price,
                    products (
                        id,
                        name,
                        image_url
                    )
                `)
                .in('order_id', orderIds);

            // Aggregate by product
            const productMap: Record<string, { name: string; imageUrl?: string; orderCount: number; revenue: number }> = {};
            orderItems?.forEach(item => {
                const productId = item.product_id || item.product_name;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const product = item.products as any;
                if (!productMap[productId]) {
                    productMap[productId] = {
                        name: product?.name || item.product_name || 'Unknown',
                        imageUrl: product?.image_url,
                        orderCount: 0,
                        revenue: 0
                    };
                }
                productMap[productId].orderCount += 1;
                productMap[productId].revenue += Number(item.total_price) || 0;
            });

            topProducts = Object.entries(productMap)
                .map(([id, data]) => ({ id, ...data }))
                .sort((a, b) => b.orderCount - a.orderCount)
                .slice(0, 5);
        }

        return {
            revenue: {
                today: todayRevenue,
                yesterday: yesterdayRevenue,
                trend: revenueTrend,
                trendPercentage: Math.abs(revenueTrendPercentage)
            },
            orders: {
                pending: pendingCount || 0,
                processing: processingCount || 0,
                shipped: shippedCount || 0,
                delivered: deliveredCount || 0,
                total: (pendingCount || 0) + (processingCount || 0) + (shippedCount || 0) + (deliveredCount || 0)
            },
            cartAbandonment: {
                count: cartAbandonmentLeads.length,
                leads: cartAbandonmentLeads
            },
            topProducts
        };
    } catch (error) {
        console.error('Error fetching e-commerce metrics:', error);
        return {
            revenue: { today: 0, yesterday: 0, trend: 'stable', trendPercentage: 0 },
            orders: { pending: 0, processing: 0, shipped: 0, delivered: 0, total: 0 },
            cartAbandonment: { count: 0, leads: [] },
            topProducts: []
        };
    }
}

// Export cached version (30s cache for more real-time e-commerce data)
export const getEcommerceMetrics = (abandonmentHours?: number) =>
    unstable_cache(
        () => fetchEcommerceMetricsUncached(abandonmentHours),
        [`ecommerce-metrics-${abandonmentHours || 24}`],
        { revalidate: 30, tags: ['dashboard', 'ecommerce'] }
    )();

// ============================================================================
// REAL ESTATE DASHBOARD METRICS
// ============================================================================

async function fetchRealEstateMetricsUncached(): Promise<RealEstateMetrics> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    try {
        // 1. Lead counts (today, this week, this month)
        const { count: leadsToday } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', todayStart.toISOString());

        const { count: leadsThisWeek } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', weekStart.toISOString());

        const { count: leadsThisMonth } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', monthStart.toISOString());

        const { count: leadsLastWeek } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', lastWeekStart.toISOString())
            .lt('created_at', weekStart.toISOString());

        // Calculate growth percentage
        const thisWeekCount = leadsThisWeek || 0;
        const lastWeekCount = leadsLastWeek || 0;
        const growth = lastWeekCount > 0
            ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)
            : (thisWeekCount > 0 ? 100 : 0);

        // 2. Active Listings
        const { count: activeListings } = await supabase
            .from('properties')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true)
            .in('status', ['for_sale', 'for_rent']);

        // 3. Properties Under Contract (sold/rented but still active for tracking)
        const { count: underContract } = await supabase
            .from('properties')
            .select('*', { count: 'exact', head: true })
            .in('status', ['sold', 'rented']);

        // 4. Viewings/Appointments - scheduled and pending
        const tomorrow = new Date(todayStart.getTime() + 2 * 24 * 60 * 60 * 1000);

        const { count: scheduledViewings } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .in('status', ['confirmed', 'pending'])
            .gte('appointment_date', todayStart.toISOString().split('T')[0]);

        const { count: pendingViewings } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending')
            .gte('appointment_date', todayStart.toISOString().split('T')[0]);

        // Get upcoming viewings for display
        const { data: upcomingAppointments } = await supabase
            .from('appointments')
            .select('id, customer_name, appointment_date, start_time, status, properties(title)')
            .in('status', ['confirmed', 'pending'])
            .gte('appointment_date', todayStart.toISOString().split('T')[0])
            .lte('appointment_date', tomorrow.toISOString().split('T')[0])
            .order('appointment_date', { ascending: true })
            .order('start_time', { ascending: true })
            .limit(5);

        const upcomingViewings: Viewing[] = (upcomingAppointments || []).map(apt => {
            const dateStr = apt.appointment_date;
            const isToday = dateStr === todayStart.toISOString().split('T')[0];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const property = apt.properties as any;
            return {
                id: apt.id,
                propertyTitle: property?.title || 'Property Viewing',
                leadName: apt.customer_name || 'Unknown',
                time: `${isToday ? 'Today' : 'Tomorrow'}, ${apt.start_time?.slice(0, 5) || ''}`,
                status: apt.status as Viewing['status']
            };
        });

        // 5. Pipeline stages breakdown
        const { data: stages } = await supabase
            .from('pipeline_stages')
            .select('id, name, display_order');

        const stageMap: Record<string, string> = {};
        stages?.forEach(s => { stageMap[s.id] = s.name.toLowerCase(); });

        const { data: leadsWithStages } = await supabase
            .from('leads')
            .select('current_stage_id');

        const pipelineCounts = {
            new: 0,
            contacted: 0,
            viewing: 0,
            negotiating: 0,
            closed: 0
        };

        (leadsWithStages || []).forEach(lead => {
            const stageName = stageMap[lead.current_stage_id] || '';
            if (stageName.includes('new')) pipelineCounts.new++;
            else if (stageName.includes('interested') || stageName.includes('contacted')) pipelineCounts.contacted++;
            else if (stageName.includes('qualified') || stageName.includes('appointment') || stageName.includes('viewing')) pipelineCounts.viewing++;
            else if (stageName.includes('negotiating')) pipelineCounts.negotiating++;
            else if (stageName.includes('won') || stageName.includes('closed')) pipelineCounts.closed++;
            else pipelineCounts.new++; // Default to new
        });

        // 6. Closure Insights - Why leads haven't closed
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

        // No response in 24h
        const { count: noResponse24h } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .lt('last_message_at', oneDayAgo.toISOString())
            .is('bot_disabled', false);

        // Stalled leads (no activity 3+ days)
        const { count: stalledLeads } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .lt('last_message_at', threeDaysAgo.toISOString());

        // Leads needing human attention (likely complex issues)
        const { count: needsAttention } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('needs_human_attention', true);

        // Leads with appointments that were no-shows
        const { count: noShows } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'no_show');

        // Cancelled appointments
        const { count: cancelled } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'cancelled');

        const closureInsights: LeadInsight[] = [
            { reason: 'No Response (24h+)', count: noResponse24h || 0, description: 'Leads waiting for your reply' },
            { reason: 'Stalled Leads', count: stalledLeads || 0, description: 'No activity for 3+ days' },
            { reason: 'Needs Human Attention', count: needsAttention || 0, description: 'Bot escalated to agent' },
            { reason: 'No-Shows', count: noShows || 0, description: 'Missed scheduled viewings' },
            { reason: 'Cancelled Viewings', count: cancelled || 0, description: 'Appointments that were cancelled' },
        ].filter(insight => insight.count > 0);

        return {
            leads: {
                today: leadsToday || 0,
                week: thisWeekCount,
                month: leadsThisMonth || 0,
                growth
            },
            activeListings: activeListings || 0,
            propertiesUnderContract: underContract || 0,
            viewings: {
                scheduled: scheduledViewings || 0,
                pending: pendingViewings || 0,
                upcoming: upcomingViewings
            },
            closureInsights,
            pipeline: pipelineCounts
        };
    } catch (error) {
        console.error('Error fetching real estate metrics:', error);
        return {
            leads: { today: 0, week: 0, month: 0, growth: 0 },
            activeListings: 0,
            propertiesUnderContract: 0,
            viewings: { scheduled: 0, pending: 0, upcoming: [] },
            closureInsights: [],
            pipeline: { new: 0, contacted: 0, viewing: 0, negotiating: 0, closed: 0 }
        };
    }
}

// Export cached version (30s cache for real estate data)
export const getRealEstateMetrics = unstable_cache(
    fetchRealEstateMetricsUncached,
    ['real-estate-metrics'],
    { revalidate: 30, tags: ['dashboard', 'real-estate'] }
);
