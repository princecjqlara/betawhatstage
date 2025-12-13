
import { createClient } from './supabaseClient';

export interface OrderItem {
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    variations: Record<string, unknown> | null;
}

export interface Order {
    id: string;
    lead_id: string;
    status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
    total_amount: number;
    currency: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
    leads?: {
        name: string | null;
        email: string | null;
        phone: string | null;
    };
    order_items?: OrderItem[];
}

export async function getOrders() {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('orders')
        .select(`
            *,
            leads (
                name,
                email,
                phone
            ),
            order_items (
                *
            )
        `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching orders:', error);
        throw error;
    }

    return data as Order[];
}

export async function updateOrderStatus(orderId: string, status: string) {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId)
        .select()
        .single();

    if (error) {
        console.error('Error updating order status:', error);
        throw error;
    }

    return data;
}

export async function deleteOrder(orderId: string) {
    const supabase = createClient();

    const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

    if (error) {
        console.error('Error deleting order:', error);
        throw error;
    }

    return true;
}
