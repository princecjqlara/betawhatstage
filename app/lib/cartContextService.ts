import { supabase } from './supabase';

/**
 * Get current cart for a sender (pending order)
 */
export async function getCurrentCart(senderId: string) {
    try {
        // Find the lead by sender_id
        const { data: lead } = await supabase
            .from('leads')
            .select('id')
            .eq('sender_id', senderId)
            .single();

        if (!lead) {
            return null;
        }

        // Find the pending order (cart)
        const { data: order } = await supabase
            .from('orders')
            .select('id, total_amount')
            .eq('lead_id', lead.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!order) {
            return null;
        }

        // Fetch items in the cart
        const { data: items } = await supabase
            .from('order_items')
            .select('product_name, quantity, unit_price, variations')
            .eq('order_id', order.id);

        return {
            order_id: order.id,
            total_amount: order.total_amount,
            items: items || [],
            item_count: items?.reduce((sum, item) => sum + item.quantity, 0) || 0
        };
    } catch (error) {
        console.error('Error fetching cart for context:', error);
        return null;
    }
}

/**
 * Format cart info for AI context
 */
export function buildCartContextForAI(cart: Awaited<ReturnType<typeof getCurrentCart>>): string {
    if (!cart || cart.items.length === 0) {
        return '';
    }

    const itemsList = cart.items.map((item, idx) => {
        const variationsText = item.variations
            ? ` (${Object.values(item.variations).join(', ')})`
            : '';
        return `  ${idx + 1}. ${item.product_name}${variationsText} - Qty: ${item.quantity} - ₱${(item.unit_price * item.quantity).toLocaleString()}`;
    }).join('\n');

    return `CURRENT CART (Customer has items in cart ready to checkout):
Total Items: ${cart.item_count}
Total Amount: ₱${cart.total_amount.toLocaleString()}

Items in Cart:
${itemsList}

IMPORTANT: The customer has items waiting in their cart. If they ask about their cart, order, or checkout, reference these items. Remind them they can checkout anytime.
`;
}
