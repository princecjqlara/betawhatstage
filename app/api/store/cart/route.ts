import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

interface AddToCartBody {
    sender_id: string; // PSID
    product_id: string;
    quantity?: number;
    variations?: Record<string, string>; // e.g., { "Size": "M", "Color": "Red" }
    unit_price: number;
    page_id?: string; // Facebook Page ID for notifications
}

// Helper to get or create a pending order (cart) for a lead
async function getOrCreateCart(leadId: string) {
    // Try to find an existing pending order
    const { data: existingOrder, error: findError } = await supabase
        .from('orders')
        .select('*')
        .eq('lead_id', leadId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (existingOrder && !findError) {
        return existingOrder;
    }

    // Create a new pending order (cart)
    const { data: newOrder, error: createError } = await supabase
        .from('orders')
        .insert({
            lead_id: leadId,
            status: 'pending',
            total_amount: 0,
        })
        .select()
        .single();

    if (createError) {
        console.error('Error creating cart:', createError);
        throw new Error('Failed to create cart');
    }

    return newOrder;
}

// Helper to recalculate and update order total
async function recalculateOrderTotal(orderId: string) {
    const { data: items, error } = await supabase
        .from('order_items')
        .select('total_price')
        .eq('order_id', orderId);

    if (error) {
        console.error('Error fetching order items for total:', error);
        return;
    }

    const total = items?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0;

    await supabase
        .from('orders')
        .update({ total_amount: total })
        .eq('id', orderId);
}

// GET: Retrieve the current cart for a sender
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const senderId = searchParams.get('sender_id');

    if (!senderId) {
        return NextResponse.json({ error: 'sender_id is required' }, { status: 400 });
    }

    try {
        // Find the lead by sender_id
        const { data: lead, error: leadError } = await supabase
            .from('leads')
            .select('id')
            .eq('sender_id', senderId)
            .single();

        if (leadError || !lead) {
            return NextResponse.json({ cart: null, items: [] });
        }

        // Find the pending order (cart)
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('lead_id', lead.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (orderError || !order) {
            return NextResponse.json({ cart: null, items: [] });
        }

        // Fetch items in the cart
        const { data: items, error: itemsError } = await supabase
            .from('order_items')
            .select('*, products(name, image_url)')
            .eq('order_id', order.id);

        if (itemsError) {
            console.error('Error fetching cart items:', itemsError);
        }

        return NextResponse.json({
            cart: order,
            items: items || [],
        });
    } catch (error) {
        console.error('Error getting cart:', error);
        return NextResponse.json({ error: 'Failed to get cart' }, { status: 500 });
    }
}

// POST: Add an item to the cart
export async function POST(request: NextRequest) {
    try {
        const body: AddToCartBody = await request.json();
        const { sender_id, product_id, quantity = 1, variations, unit_price, page_id } = body;

        if (!sender_id || !product_id || unit_price === undefined) {
            return NextResponse.json(
                { error: 'sender_id, product_id, and unit_price are required' },
                { status: 400 }
            );
        }

        // Find or create the lead
        let { data: lead, error: leadError } = await supabase
            .from('leads')
            .select('id, page_id')
            .eq('sender_id', sender_id)
            .single();

        if (leadError || !lead) {
            // Create lead if not exists, include page_id if provided
            const leadInsert: { sender_id: string; page_id?: string } = { sender_id };
            if (page_id) {
                leadInsert.page_id = page_id;
            }

            const { data: newLead, error: createLeadError } = await supabase
                .from('leads')
                .insert(leadInsert)
                .select()
                .single();

            if (createLeadError || !newLead) {
                console.error('Error creating lead:', createLeadError);
                return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
            }
            lead = newLead;
        } else if (page_id && !lead.page_id) {
            // Update existing lead with page_id if it doesn't have one
            await supabase
                .from('leads')
                .update({ page_id })
                .eq('id', lead.id);
            lead.page_id = page_id;
        }


        // Get product details for the snapshot
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('name')
            .eq('id', product_id)
            .single();

        if (productError || !product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        // Get or create the cart - lead is guaranteed to exist at this point
        const cart = await getOrCreateCart(lead!.id);

        // Check if product already in cart (with same variations)
        const { data: existingItem } = await supabase
            .from('order_items')
            .select('id, quantity')
            .eq('order_id', cart.id)
            .eq('product_id', product_id)
            .eq('variations', variations || null)
            .single();

        if (existingItem) {
            // Update quantity
            const { error: updateError } = await supabase
                .from('order_items')
                .update({ quantity: existingItem.quantity + quantity })
                .eq('id', existingItem.id);

            if (updateError) {
                console.error('Error updating cart item:', updateError);
                return NextResponse.json({ error: 'Failed to update cart' }, { status: 500 });
            }
        } else {
            // Insert new item
            const { error: insertError } = await supabase
                .from('order_items')
                .insert({
                    order_id: cart.id,
                    product_id,
                    product_name: product.name,
                    quantity,
                    unit_price,
                    variations: variations || null,
                });

            if (insertError) {
                console.error('Error adding item to cart:', insertError);
                return NextResponse.json({ error: 'Failed to add item to cart' }, { status: 500 });
            }
        }

        // Recalculate order total
        await recalculateOrderTotal(cart.id);

        // Send confirmation to Messenger (if lead has page_id)
        // lead is guaranteed to exist at this point (either found or created above)
        if (lead!.page_id) {
            try {
                // Fetch all cart items to show in the message
                const { data: cartItems } = await supabase
                    .from('order_items')
                    .select('product_name, quantity, unit_price, variations')
                    .eq('order_id', cart.id);

                // Get updated cart total
                const { data: updatedCart } = await supabase
                    .from('orders')
                    .select('total_amount')
                    .eq('id', cart.id)
                    .single();

                // Build cart summary
                const itemsList = cartItems?.map((item, idx) => {
                    const variationsText = item.variations
                        ? ` (${Object.values(item.variations).join(', ')})`
                        : '';
                    return `${idx + 1}. ${item.product_name}${variationsText} - x${item.quantity} = ₱${(item.unit_price * item.quantity).toLocaleString()}`;
                }).join('\n') || '';

                const totalAmount = updatedCart?.total_amount || 0;
                const itemCount = cartItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;

                const cartSummary = `✅ Added ${product.name} to your cart!

🛒 Your Cart (${itemCount} ${itemCount === 1 ? 'item' : 'items'}):
${itemsList}

💰 Total: ₱${totalAmount.toLocaleString()}

What would you like to do next?`;

                // Import dynamically to avoid circular dependencies
                const { callSendAPI } = await import('../../webhook/facebookClient');

                const appUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://aphelion-photon.vercel.app';
                let checkoutUrl = `${appUrl}/checkout?psid=${encodeURIComponent(sender_id)}`;
                if (lead!.page_id) {
                    checkoutUrl += `&pageId=${encodeURIComponent(lead!.page_id)}`;
                }

                await callSendAPI(sender_id, {
                    attachment: {
                        type: 'template',
                        payload: {
                            template_type: 'button',
                            text: cartSummary,
                            buttons: [
                                {
                                    type: 'web_url',
                                    url: checkoutUrl,
                                    title: '🛍️ Checkout',
                                    webview_height_ratio: 'tall'
                                },
                                {
                                    type: 'postback',
                                    title: '🔙 Continue Shopping',
                                    payload: 'SHOW_PRODUCTS'
                                }
                            ]
                        }
                    }
                }, lead!.page_id);

                console.log('✅ Sent cart confirmation to Messenger');
            } catch (messengerError) {
                console.error('Error sending messenger notification:', messengerError);
                // Don't fail the cart operation if messenger notification fails
            }
        } else {
            console.log('⚠️ No page_id found for lead, skipping Messenger notification');
        }

        return NextResponse.json({ success: true, cart_id: cart.id });
    } catch (error) {
        console.error('Error adding to cart:', error);
        return NextResponse.json({ error: 'Failed to add to cart' }, { status: 500 });
    }
}

// DELETE: Remove an item from the cart
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const senderId = searchParams.get('sender_id');
        const itemId = searchParams.get('item_id');
        const productName = searchParams.get('product_name'); // For chat-based removal

        if (!senderId) {
            return NextResponse.json({ error: 'sender_id is required' }, { status: 400 });
        }

        if (!itemId && !productName) {
            return NextResponse.json({ error: 'item_id or product_name is required' }, { status: 400 });
        }

        // Find the lead
        const { data: lead, error: leadError } = await supabase
            .from('leads')
            .select('id, page_id')
            .eq('sender_id', senderId)
            .single();

        if (leadError || !lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        // Find the pending order (cart)
        const { data: cart, error: cartError } = await supabase
            .from('orders')
            .select('id')
            .eq('lead_id', lead.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (cartError || !cart) {
            return NextResponse.json({ error: 'No active cart found' }, { status: 404 });
        }

        // Find the item to remove
        let items: { id: string; product_name: string }[] | null = null;

        if (itemId) {
            const { data, error } = await supabase
                .from('order_items')
                .select('id, product_name')
                .eq('order_id', cart.id)
                .eq('id', itemId);
            items = data;
            if (error) console.error('Error finding item by id:', error);
        } else if (productName) {
            // Try multiple search strategies for product name
            // 1. First try exact match with ilike
            let { data: directMatch } = await supabase
                .from('order_items')
                .select('id, product_name')
                .eq('order_id', cart.id)
                .ilike('product_name', `%${productName}%`);

            if (directMatch && directMatch.length > 0) {
                items = directMatch;
            } else {
                // 2. Try stripping special characters and matching
                const cleanedName = productName.replace(/[^\w\s]/g, '').trim();
                console.log(`Trying cleaned name: "${cleanedName}"`);

                const { data: cleanMatch } = await supabase
                    .from('order_items')
                    .select('id, product_name')
                    .eq('order_id', cart.id)
                    .ilike('product_name', `%${cleanedName}%`);

                if (cleanMatch && cleanMatch.length > 0) {
                    items = cleanMatch;
                } else {
                    // 3. Try matching just the first word
                    const firstWord = productName.split(/[\s(]/)[0].trim();
                    console.log(`Trying first word: "${firstWord}"`);

                    if (firstWord.length >= 3) {
                        const { data: wordMatch } = await supabase
                            .from('order_items')
                            .select('id, product_name')
                            .eq('order_id', cart.id)
                            .ilike('product_name', `%${firstWord}%`);

                        items = wordMatch;
                    }
                }
            }
        }

        if (!items || items.length === 0) {
            // Log what's in the cart for debugging
            const { data: allItems } = await supabase
                .from('order_items')
                .select('product_name')
                .eq('order_id', cart.id);
            console.log('Cart contains:', allItems?.map(i => i.product_name));
            console.log('Tried to find:', productName);

            return NextResponse.json({ error: 'Item not found in cart' }, { status: 404 });
        }

        // Remove the first matching item
        const itemToRemove = items[0];
        const { error: deleteError } = await supabase
            .from('order_items')
            .delete()
            .eq('id', itemToRemove.id);

        if (deleteError) {
            console.error('Error removing item from cart:', deleteError);
            return NextResponse.json({ error: 'Failed to remove item' }, { status: 500 });
        }

        // Recalculate order total
        await recalculateOrderTotal(cart.id);

        // Send confirmation to Messenger
        if (lead.page_id) {
            try {
                const { callSendAPI } = await import('../../webhook/facebookClient');

                // Get updated cart details
                const { data: remainingItems } = await supabase
                    .from('order_items')
                    .select('product_name, quantity, unit_price, variations')
                    .eq('order_id', cart.id);

                const { data: updatedCart } = await supabase
                    .from('orders')
                    .select('total_amount')
                    .eq('id', cart.id)
                    .single();

                let message = `✅ Removed "${itemToRemove.product_name}" from your cart.`;

                if (remainingItems && remainingItems.length > 0) {
                    const itemsList = remainingItems.map((item, idx) => {
                        const variationsText = item.variations
                            ? ` (${Object.values(item.variations).join(', ')})`
                            : '';
                        return `${idx + 1}. ${item.product_name}${variationsText} - x${item.quantity} = ₱${(item.unit_price * item.quantity).toLocaleString()}`;
                    }).join('\n');

                    const totalAmount = updatedCart?.total_amount || 0;
                    message += `\n\n🛒 Your Cart:\n${itemsList}\n\n💰 Total: ₱${totalAmount.toLocaleString()}`;
                } else {
                    message += '\n\nYour cart is now empty.';
                }

                await callSendAPI(senderId, { text: message }, lead.page_id);
            } catch (messengerError) {
                console.error('Error sending messenger notification:', messengerError);
            }
        }

        return NextResponse.json({
            success: true,
            removed_item: itemToRemove.product_name
        });
    } catch (error) {
        console.error('Error removing from cart:', error);
        return NextResponse.json({ error: 'Failed to remove from cart' }, { status: 500 });
    }
}
