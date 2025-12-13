import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

interface CheckoutBody {
    order_id: string;
    customer_name: string;
    customer_phone: string;
    customer_email?: string;
    shipping_address: string;
    payment_method: string;
    notes?: string;
}

// POST: Process checkout for a pending order
export async function POST(request: NextRequest) {
    try {
        const body: CheckoutBody = await request.json();
        const {
            order_id,
            customer_name,
            customer_phone,
            customer_email,
            shipping_address,
            payment_method,
            notes
        } = body;

        // Validation
        if (!order_id || !customer_name || !customer_phone || !shipping_address || !payment_method) {
            return NextResponse.json(
                { error: 'Missing required checkout fields' },
                { status: 400 }
            );
        }

        // Verify order exists and is pending
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('id, lead_id, total_amount')
            .eq('id', order_id)
            .eq('status', 'pending')
            .single();

        if (orderError || !order) {
            return NextResponse.json({ error: 'Order not found or not available for checkout' }, { status: 404 });
        }

        // Update order status and details
        console.log('Updating order with:', {
            status: 'confirmed',
            customer_name,
            customer_phone,
            customer_email,
            shipping_address,
            payment_method,
            notes,
            confirmed_at: new Date().toISOString(),
        });

        const { data: updateData, error: updateError } = await supabase
            .from('orders')
            .update({
                status: 'confirmed',
                customer_name,
                customer_phone,
                customer_email,
                shipping_address,
                payment_method,
                notes,
                confirmed_at: new Date().toISOString(),
            })
            .eq('id', order_id)
            .select();

        if (updateError) {
            console.error('Error updating order:', updateError);
            return NextResponse.json({ error: 'Failed to process checkout' }, { status: 500 });
        }

        console.log('Order update result:', updateData);

        // Fetch order items for the confirmation message
        const { data: orderItems } = await supabase
            .from('order_items')
            .select('product_name, quantity, unit_price')
            .eq('order_id', order_id);

        // Get lead info to get page_id
        const { data: lead } = await supabase
            .from('leads')
            .select('page_id')
            .eq('id', order.lead_id)
            .single();

        // Send confirmation to Messenger
        if (lead?.page_id && order.lead_id) {
            try {
                // Get sender_psid from the lead
                const { data: leadData } = await supabase
                    .from('leads')
                    .select('sender_id')
                    .eq('id', order.lead_id)
                    .single();

                if (leadData?.sender_id) {
                    // Import dynamically to avoid circular dependencies
                    const { callSendAPI, sendPaymentMethodCards } = await import('../../webhook/facebookClient');
                    const { getPaymentMethods } = await import('../../webhook/data');

                    // Build order summary
                    const itemsList = orderItems?.map((item, idx) =>
                        `${idx + 1}. ${item.product_name} (x${item.quantity}) - ₱${(item.unit_price * item.quantity).toLocaleString()}`
                    ).join('\n') || '';

                    const confirmationMessage = `✅ Order Confirmed!

Thank you ${customer_name}! Your order has been placed successfully.

📦 Order Summary:
${itemsList}

💰 Total: ₱${order.total_amount.toLocaleString()}

📍 Delivery Address:
${shipping_address}

💳 Payment Method: ${payment_method}

Please send your payment using the details below. We'll process your order once payment is confirmed! 🎉`;

                    await callSendAPI(leadData.sender_id, {
                        text: confirmationMessage
                    }, lead.page_id);

                    // Show payment methods after confirmation
                    const paymentMethods = await getPaymentMethods();
                    if (paymentMethods.length > 0) {
                        await sendPaymentMethodCards(leadData.sender_id, paymentMethods, lead.page_id);
                    }
                }
            } catch (messengerError) {
                console.error('Error sending messenger confirmation:', messengerError);
                // Don't fail the checkout if messenger notification fails
            }
        }

        // Log update for debugging
        console.log('Order updated with:', {
            order_id,
            customer_name,
            customer_phone,
            customer_email,
            shipping_address,
            payment_method,
            notes
        });

        return NextResponse.json({
            success: true,
            message: 'Order placed successfully',
            order_id: order.id
        });
    } catch (error) {
        console.error('Error processing checkout:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

