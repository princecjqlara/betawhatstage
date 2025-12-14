import { generateConversationSummary, getBotResponse, ImageContext } from '@/app/lib/chatService';
import { extractAndStoreContactInfo, extractContactInfo } from '@/app/lib/contactExtractionService';
import { isTakeoverActive } from '@/app/lib/humanTakeoverService';
import { analyzeImageForReceipt, isConfirmedReceipt } from '@/app/lib/receiptDetectionService';
import { analyzeAndUpdateStage, getOrCreateLead, incrementMessageCount, moveLeadToReceiptStage, shouldAnalyzeStage } from '@/app/lib/pipelineService';
import { supabase } from '@/app/lib/supabase';

import { trackActivity } from '@/app/lib/activityTrackingService';
import { callSendAPI, sendAppointmentCard, sendPaymentMethodCards, sendProductCards, sendPropertyCards, sendTypingIndicator } from './facebookClient';
import { getPageToken, getSettings } from './config';
import { getPaymentMethods, getProductById, getProducts, getProperties, PaymentMethod } from './data';
import { isAppointmentQuery, isPaymentQuery, isProductQuery, isPropertyQuery } from './keywords';

type WaitUntil = (promise: Promise<unknown>) => void;

// Handle Referral Events (Chat to Buy)
export async function handleReferral(sender_psid: string, referral: any, pageId?: string) {
    const ref = referral.ref; // e.g., "p_id:123|vars:Size-M,Color-Red" or "prop_id:456"
    if (!ref) return;

    console.log('Handling referral ref:', ref);

    // Parse ref
    const params = new URLSearchParams(ref.replace(/\|/g, '&').replace(/:/g, '='));
    const productId = params.get('p_id');
    const propertyId = params.get('prop_id') || params.get('property_id');
    const varsString = params.get('vars');

    if (productId) {
        // Get the product details
        const { data: product, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', productId)
            .single();

        if (product && !error) {
            const variationText = varsString ? `\nSelected Options: ${varsString.split(',').join(', ')}` : '';

            // Track product view activity
            await trackActivity(sender_psid, 'product_view', product.id, product.name, {
                variations: varsString || null,
                price: product.price,
            });

            // Send welcome message with product context
            await callSendAPI(sender_psid, {
                text: `Hi! 👋 I see you're interested in ${product.name}.${variationText}\n\nHow can we help you with your purchase today?`
            }, pageId);

            // Send the product card again for easy access
            await sendProductCards(sender_psid, [product], pageId);
            return;
        } else {
            console.error('Referral product not found:', productId);
            await callSendAPI(sender_psid, {
                text: "Hi! Thanks for messaging us. How can we help you today?"
            }, pageId);
            return;
        }
    }

    if (propertyId) {
        const { data: property, error } = await supabase
            .from('properties')
            .select('id, title, price, address, image_url, status, bedrooms, bathrooms')
            .eq('id', propertyId)
            .single();

        if (property && !error) {
            // Track property view activity
            await trackActivity(sender_psid, 'property_view', property.id, property.title, {
                price: property.price,
                address: property.address,
                bedrooms: property.bedrooms,
                bathrooms: property.bathrooms,
                status: property.status,
            });

            const appUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://aphelion-photon.vercel.app';
            const formattedPrice = property.price
                ? `₱${property.price.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`
                : 'Price on request';
            const subtitleParts = [formattedPrice];
            if (property.address) subtitleParts.push(property.address);
            if (property.status) subtitleParts.push(property.status.replace('_', ' '));
            const specs: string[] = [];
            if (property.bedrooms) specs.push(`${property.bedrooms} BR`);
            if (property.bathrooms) specs.push(`${property.bathrooms} BA`);
            if (specs.length) subtitleParts.push(specs.join(' • '));

            await callSendAPI(sender_psid, {
                text: `Hi! 👋 I see you're checking out "${property.title}". Would you like to talk to an agent about this property?`
            }, pageId);

            await callSendAPI(sender_psid, {
                attachment: {
                    type: 'template',
                    payload: {
                        template_type: 'generic',
                        elements: [
                            {
                                title: property.title,
                                image_url: property.image_url || undefined,
                                subtitle: subtitleParts.join(' • '),
                                buttons: [
                                    {
                                        type: 'web_url',
                                        url: `${appUrl}/property/${property.id}`,
                                        title: 'View Property',
                                        webview_height_ratio: 'tall'
                                    },
                                    {
                                        type: 'postback',
                                        title: 'I want to inquire',
                                        payload: `INQUIRE_PROP_${property.id}`
                                    }
                                ]
                            }
                        ]
                    }
                }
            }, pageId);
            return;
        } else {
            console.error('Referral property not found:', propertyId);
            await callSendAPI(sender_psid, {
                text: "Hi! Thanks for checking a property. How can we help you today?"
            }, pageId);
            return;
        }
    }

    // Fallback for unknown referral types
    await callSendAPI(sender_psid, {
        text: "Hi! Thanks for reaching out. How can we help you today?"
    }, pageId);
}

export async function handlePostback(postback: any, sender_psid: string, recipient_psid?: string, defer?: WaitUntil) {
    if (postback.referral) {
        console.log('Postback has referral:', postback.referral);
        defer?.(
            handleReferral(sender_psid, postback.referral, recipient_psid).catch(err => {
                console.error('Error handling postback referral:', err);
            })
        );
        return true;
    }

    if (postback.payload && postback.payload.startsWith('PAY_')) {
        console.log('Payment postback received:', postback.payload);
        return false;
    }

    if (postback.payload && postback.payload.startsWith('INQUIRE_PROP_')) {
        const propId = postback.payload.replace('INQUIRE_PROP_', '');
        console.log('Property Inquiry Postback:', propId);

        // Fetch property details to give context
        const { data: prop } = await supabase.from('properties').select('title, price').eq('id', propId).single();

        // Track property inquiry activity
        await trackActivity(sender_psid, 'property_inquiry', propId, prop?.title || 'Unknown Property', {
            price: prop?.price,
        });

        // Send automated response
        await callSendAPI(sender_psid, {
            text: `Thanks for your interest in ${prop?.title || 'this property'}! An agent will be with you shortly to assist you.`
        }, recipient_psid);

        // We could also notify the agent here via pipeline/lead update
        return true;
    }

    // Handle Add to Cart postback
    if (postback.payload && postback.payload.startsWith('ADD_TO_CART_')) {
        const productId = postback.payload.replace('ADD_TO_CART_', '');
        console.log('Add to Cart Postback:', productId);

        const { product, hasVariations } = await getProductById(productId);

        if (!product) {
            await callSendAPI(sender_psid, {
                text: "Sorry, that product is no longer available. 😔"
            }, recipient_psid);
            return true;
        }

        if (hasVariations) {
            // Product has variations, redirect to website to select options
            const appUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://aphelion-photon.vercel.app';
            let productUrl = `${appUrl}/product/${productId}?psid=${encodeURIComponent(sender_psid)}`;
            if (recipient_psid) {
                productUrl += `&pageId=${encodeURIComponent(recipient_psid)}`;
            }

            await callSendAPI(sender_psid, {
                attachment: {
                    type: 'template',
                    payload: {
                        template_type: 'button',
                        text: `${product.name} has options to choose from. Please select your preferred options on our website:`,
                        buttons: [
                            {
                                type: 'web_url',
                                url: productUrl,
                                title: '🛒 Select Options',
                                webview_height_ratio: 'tall'
                            }
                        ]
                    }
                }
            }, recipient_psid);
            return true;
        }

        // No variations - add directly to cart
        try {
            // Call our cart API directly (internal call)
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const res = await fetch(`${baseUrl}/api/store/cart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender_id: sender_psid,
                    product_id: productId,
                    quantity: 1,
                    unit_price: product.price || 0,
                }),
            });

            if (res.ok) {
                const cartResponse = await res.json();
                const cartId = cartResponse.cart_id;

                // Fetch current cart details to show in message
                const cartRes = await fetch(`${baseUrl}/api/store/cart?sender_id=${encodeURIComponent(sender_psid)}`);
                const cartData = await cartRes.json();

                // Build cart summary
                const cartItems = cartData.items || [];
                const itemsList = cartItems.map((item: any, idx: number) => {
                    const variationsText = item.variations
                        ? ` (${Object.values(item.variations).join(', ')})`
                        : '';
                    return `${idx + 1}. ${item.product_name}${variationsText} - x${item.quantity} = ₱${(item.unit_price * item.quantity).toLocaleString()}`;
                }).join('\n');

                const totalAmount = cartData.cart?.total_amount || 0;
                const itemCount = cartItems.reduce((sum: number, item: any) => sum + item.quantity, 0);

                const cartSummary = `✅ Added ${product.name} to your cart!\n\n🛒 Your Cart (${itemCount} ${itemCount === 1 ? 'item' : 'items'}):\n${itemsList}\n\n💰 Total: ₱${totalAmount.toLocaleString()}\n\nWhat would you like to do next?`;

                // Send confirmation with buttons
                const appUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://aphelion-photon.vercel.app';
                let checkoutUrl = `${appUrl}/checkout?psid=${encodeURIComponent(sender_psid)}`;
                if (recipient_psid) {
                    checkoutUrl += `&pageId=${encodeURIComponent(recipient_psid)}`;
                }

                await callSendAPI(sender_psid, {
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
                }, recipient_psid);

                // Track activity
                await trackActivity(sender_psid, 'add_to_cart', productId, product.name, {
                    price: product.price,
                });
            } else {
                console.error('Failed to add to cart:', await res.text());
                await callSendAPI(sender_psid, {
                    text: "Sorry, there was an issue adding that to your cart. Please try again. 😔"
                }, recipient_psid);
            }
        } catch (error) {
            console.error('Error adding to cart:', error);
            await callSendAPI(sender_psid, {
                text: "Sorry, there was an issue adding that to your cart. Please try again. 😔"
            }, recipient_psid);
        }

        return true;
    }

    // Handle Appointment Cancellation Confirmation
    if (postback.payload && postback.payload.startsWith('CANCEL_APT_CONFIRM_')) {
        const appointmentId = postback.payload.replace('CANCEL_APT_CONFIRM_', '');
        console.log('Appointment Cancellation Confirmed:', appointmentId);

        try {
            // Cancel the appointment
            const { data: appointment, error } = await supabase
                .from('appointments')
                .update({
                    status: 'cancelled',
                    cancelled_at: new Date().toISOString(),
                    cancelled_reason: 'Cancelled by customer via Messenger confirmation'
                })
                .eq('id', appointmentId)
                .select()
                .single();

            if (error) {
                console.error('Error cancelling appointment:', error);
                await callSendAPI(sender_psid, {
                    text: "Sorry, there was an issue cancelling your appointment. Please try again or contact us directly. 😔"
                }, recipient_psid);
                return true;
            }

            // Format date and time for confirmation message
            const [year, month, day] = appointment.appointment_date.split('-').map(Number);
            const aptDate = new Date(year, month - 1, day);
            const formattedDate = aptDate.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
            });

            await callSendAPI(sender_psid, {
                text: `✅ Your appointment on ${formattedDate} has been cancelled.\n\nIf you'd like to book a new appointment, just let me know! 📅`
            }, recipient_psid);

            // Track activity
            await trackActivity(sender_psid, 'appointment_cancelled', appointmentId, 'Appointment cancelled via Messenger', {
                appointment_date: appointment.appointment_date,
                start_time: appointment.start_time,
            });

        } catch (error) {
            console.error('Error in cancellation confirmation:', error);
            await callSendAPI(sender_psid, {
                text: "Sorry, something went wrong. Please try again. 😔"
            }, recipient_psid);
        }

        return true;
    }

    // Handle Appointment Cancellation Rejection (Keep Appointment)
    if (postback.payload && postback.payload.startsWith('CANCEL_APT_KEEP_')) {
        const appointmentId = postback.payload.replace('CANCEL_APT_KEEP_', '');
        console.log('Appointment Cancellation Rejected (Kept):', appointmentId);

        // Fetch appointment details for the message
        const { data: appointment } = await supabase
            .from('appointments')
            .select('appointment_date, start_time')
            .eq('id', appointmentId)
            .single();

        if (appointment) {
            const [year, month, day] = appointment.appointment_date.split('-').map(Number);
            const aptDate = new Date(year, month - 1, day);
            const formattedDate = aptDate.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
            });

            await callSendAPI(sender_psid, {
                text: `✅ Great! Your appointment on ${formattedDate} is still confirmed.\n\nWe look forward to seeing you! 😊`
            }, recipient_psid);
        } else {
            await callSendAPI(sender_psid, {
                text: "✅ Your appointment has been kept. We look forward to seeing you! 😊"
            }, recipient_psid);
        }

        return true;
    }

    return false;
}

export async function handleMessage(sender_psid: string, received_message: string, pageId?: string) {
    console.log('handleMessage called, generating response...');

    // Check if human takeover is active for this conversation
    const takeoverActive = await isTakeoverActive(sender_psid);
    if (takeoverActive) {
        console.log('Human takeover active for', sender_psid, '- skipping AI response');
        return;
    }

    // Get page access token for profile fetching (using per-page token)
    const pageToken = await getPageToken(pageId);

    // Get or create lead early to check goal status
    const lead = await getOrCreateLead(sender_psid, pageToken || undefined);

    // --- BOT GOAL CHECK ---
    // REMOVED

    // Send typing indicator immediately
    await sendTypingIndicator(sender_psid, true, pageId);

    // Process message and send response
    try {
        // --- REMOVED STRICT KEYWORD TRIGGERS ---
        // We now let the AI decide when to show these UIs based on context.
        // The AI will output tags like [SHOW_PRODUCTS], [SHOW_BOOKING], etc.

        // Track the lead and check if stage analysis is needed
        if (lead) {
            const messageCount = await incrementMessageCount(lead.id);
            console.log(`Lead ${lead.id} message count: ${messageCount}`);

            // Extract and store contact info (phone/email) from the message
            extractAndStoreContactInfo(lead.id, received_message).catch((err: unknown) => {
                console.error('Error extracting contact info:', err);
            });

            // CHeck if we should analyze stage (runs in background, non-blocking)
            if (shouldAnalyzeStage({ ...lead, message_count: messageCount }, received_message)) {
                console.log('Triggering pipeline stage analysis...');
                analyzeAndUpdateStage(lead, sender_psid).catch((err: unknown) => {
                    console.error('Error in stage analysis:', err);
                });
            }

            // --- CONVERSATION SUMMARIZATION CHECK ---
            // Summarize every 20 messages to keep long-term context
            if (messageCount > 0 && messageCount % 20 === 0) {
                console.log(`Triggering conversation summary at message count ${messageCount}...`);
                generateConversationSummary(sender_psid, lead.id).catch((err: unknown) => {
                    console.error('Error in conversation summary:', err);
                });
            }
        }

        // Get Bot Response
        const rawResponseText = await getBotResponse(received_message, sender_psid);
        console.log('Raw Bot response:', rawResponseText.substring(0, 100) + '...');

        // Parse tags from response
        let finalResponseText = rawResponseText;
        const showProducts = rawResponseText.includes('[SHOW_PRODUCTS]');
        const showProperties = rawResponseText.includes('[SHOW_PROPERTIES]');
        const showBooking = rawResponseText.includes('[SHOW_BOOKING]');
        const showPaymentMethods = rawResponseText.includes('[SHOW_PAYMENT_METHODS]');
        const showCart = rawResponseText.includes('[SHOW_CART]');

        // Check for REMOVE_CART tag with product name
        const removeCartMatch = rawResponseText.match(/\[REMOVE_CART:([^\]]+)\]/);
        const productToRemove = removeCartMatch ? removeCartMatch[1].trim() : null;

        // Remove tags from text to send to user
        finalResponseText = finalResponseText
            .replace(/\[SHOW_PRODUCTS\]/g, '')
            .replace(/\[SHOW_PROPERTIES\]/g, '')
            .replace(/\[SHOW_BOOKING\]/g, '')
            .replace(/\[SHOW_PAYMENT_METHODS\]/g, '')
            .replace(/\[SHOW_CART\]/g, '')
            .replace(/\[REMOVE_CART:[^\]]+\]/g, '')
            .trim();

        // Send the AI's text response (possibly split into multiple messages)
        if (finalResponseText) {
            // Check if split messages is enabled
            const settings = await getSettings();
            const splitMessagesEnabled = settings?.split_messages ?? false;

            if (splitMessagesEnabled) {
                // Split by sentence-ending punctuation (. ? ! ) followed by space or end of string
                // But keep the punctuation with the sentence
                const sentences = finalResponseText
                    .split(/(?<=[.?!。？！])\s+/)
                    .map(s => s.trim())
                    .filter(s => s.length > 0);

                // Send each sentence as a separate message with slight delay
                for (const sentence of sentences) {
                    await callSendAPI(sender_psid, { text: sentence }, pageId);
                    // Small delay between messages to make it feel more natural
                    if (sentences.indexOf(sentence) < sentences.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                }
            } else {
                // Send as single message
                await callSendAPI(sender_psid, { text: finalResponseText }, pageId);
            }
        }

        // --- HANDLE UI TRIGGERS ---

        if (showProducts) {
            console.log('AI triggered [SHOW_PRODUCTS]');
            const products = await getProducts();
            if (products.length > 0) {
                await sendProductCards(sender_psid, products, pageId);
            }
        }

        if (showProperties) {
            console.log('AI triggered [SHOW_PROPERTIES]');
            const properties = await getProperties();
            if (properties.length > 0) {
                await sendPropertyCards(sender_psid, properties, pageId);
            }
        }

        if (showBooking) {
            console.log('AI triggered [SHOW_BOOKING]');
            await sendAppointmentCard(sender_psid, pageId);
        }

        if (showPaymentMethods) {
            console.log('AI triggered [SHOW_PAYMENT_METHODS]');
            const paymentMethods = await getPaymentMethods();
            if (paymentMethods.length > 0) {
                await sendPaymentMethodCards(sender_psid, paymentMethods, pageId);
            }
        }

        // Handle cart removal via AI (must complete BEFORE showing cart)
        if (productToRemove) {
            console.log('AI triggered [REMOVE_CART] for:', productToRemove);
            try {
                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                console.log(`Calling DELETE ${baseUrl}/api/store/cart?sender_id=${sender_psid}&product_name=${productToRemove}`);

                const res = await fetch(
                    `${baseUrl}/api/store/cart?sender_id=${encodeURIComponent(sender_psid)}&product_name=${encodeURIComponent(productToRemove)}`,
                    { method: 'DELETE' }
                );

                const responseText = await res.text();
                console.log('DELETE response status:', res.status, 'body:', responseText);

                if (!res.ok) {
                    try {
                        const errorData = JSON.parse(responseText);
                        console.error('Failed to remove from cart:', errorData.error);
                        // Send error message only if item not found
                        if (errorData.error === 'Item not found in cart') {
                            await callSendAPI(sender_psid, {
                                text: `Hindi ko po makita ang "${productToRemove}" sa cart mo. Baka mali yung pangalan? 🤔`
                            }, pageId);
                        }
                    } catch (e) {
                        console.error('Error parsing DELETE response:', responseText);
                    }
                } else {
                    console.log('✅ Successfully removed item from cart');
                }
                // Success message is already sent by the DELETE API
            } catch (error) {
                console.error('Error removing item from cart:', error);
            }
        }

        // Handle show cart
        if (showCart) {
            console.log('AI triggered [SHOW_CART]');
            try {
                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                const res = await fetch(`${baseUrl}/api/store/cart?sender_id=${encodeURIComponent(sender_psid)}`);
                const cartData = await res.json();

                if (cartData.items && cartData.items.length > 0) {
                    const itemsList = cartData.items.map((item: any, idx: number) => {
                        const variationsText = item.variations
                            ? ` (${Object.values(item.variations).join(', ')})`
                            : '';
                        return `${idx + 1}. ${item.product_name}${variationsText} - x${item.quantity} = ₱${(item.unit_price * item.quantity).toLocaleString()}`;
                    }).join('\n');

                    const totalAmount = cartData.cart?.total_amount || 0;
                    const itemCount = cartData.items.reduce((sum: number, item: any) => sum + item.quantity, 0);

                    const appUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://aphelion-photon.vercel.app';
                    let checkoutUrl = `${appUrl}/checkout?psid=${encodeURIComponent(sender_psid)}`;
                    if (pageId) {
                        checkoutUrl += `&pageId=${encodeURIComponent(pageId)}`;
                    }

                    await callSendAPI(sender_psid, {
                        attachment: {
                            type: 'template',
                            payload: {
                                template_type: 'button',
                                text: `🛒 Your Cart (${itemCount} ${itemCount === 1 ? 'item' : 'items'}):\n\n${itemsList}\n\n💰 Total: ₱${totalAmount.toLocaleString()}`,
                                buttons: [
                                    {
                                        type: 'web_url',
                                        url: checkoutUrl,
                                        title: '🛍️ Checkout',
                                        webview_height_ratio: 'tall'
                                    },
                                    {
                                        type: 'postback',
                                        title: '➕ Add More Items',
                                        payload: 'SHOW_PRODUCTS'
                                    }
                                ]
                            }
                        }
                    }, pageId);
                } else {
                    await callSendAPI(sender_psid, {
                        text: '🛒 Wala pa pong laman ang cart mo. Gusto mo bang tumingin ng products?'
                    }, pageId);

                    // Manually trigger product cards since we removed the tag
                    const products = await getProducts();
                    if (products.length > 0) {
                        await sendProductCards(sender_psid, products, pageId);
                    }
                }
            } catch (error) {
                console.error('Error fetching cart:', error);
            }
        }

    } finally {
        // Turn off typing indicator
        await sendTypingIndicator(sender_psid, false, pageId);
    }
}

// Handle image messages - analyze and pass context to chatbot for intelligent response
export async function handleImageMessage(sender_psid: string, imageUrl: string, pageId?: string, accompanyingText?: string) {
    console.log('handleImageMessage called, analyzing image...');

    // Check if human takeover is active
    const takeoverActive = await isTakeoverActive(sender_psid);
    if (takeoverActive) {
        console.log('Human takeover active for', sender_psid, '- skipping AI response for image');
        return;
    }

    try {
        // Get page token for this specific page
        const pageToken = await getPageToken(pageId);

        // Get or create the lead first
        const lead = await getOrCreateLead(sender_psid, pageToken || undefined);
        if (!lead) {
            console.error('Could not get or create lead for sender:', sender_psid);
            return;
        }

        // Send typing indicator while analyzing
        await sendTypingIndicator(sender_psid, true, pageId);

        // Analyze the image
        const result = await analyzeImageForReceipt(imageUrl);
        console.log('Image analysis result:', result);

        // Build image context for the chatbot
        const imageContext: ImageContext = {
            isReceipt: result.isReceipt,
            confidence: result.confidence,
            details: result.details,
            extractedAmount: result.extractedAmount,
            extractedDate: result.extractedDate,
            imageUrl: imageUrl,
            receiverName: result.receiverName,
            receiverNumber: result.receiverNumber,
            paymentPlatform: result.paymentPlatform,
        };

        // If receipt detected, verify against stored payment methods
        if (result.isReceipt && result.confidence >= 0.5) {
            const paymentMethods = await getPaymentMethods();

            // Priority: Account NUMBER is the most reliable (names are often masked like "JO*N AN***O")
            if (paymentMethods.length > 0) {
                let matchedMethod: PaymentMethod | null = null;
                let matchedBy = '';

                // FIRST: Try to match by account number (most reliable)
                if (result.receiverNumber) {
                    for (const pm of paymentMethods) {
                        if (pm.account_number) {
                            // Normalize numbers for comparison (remove spaces, dashes, parentheses)
                            const extractedNum = result.receiverNumber.replace(/[\s\-\(\)]/g, '');
                            const storedNum = pm.account_number.replace(/[\s\-\(\)]/g, '');

                            // Check if last 4 digits match (often numbers start differently like +63 vs 09)
                            const extractedLast4 = extractedNum.slice(-4);
                            const storedLast4 = storedNum.slice(-4);

                            if (extractedNum.includes(storedNum) ||
                                storedNum.includes(extractedNum) ||
                                (extractedLast4 === storedLast4 && extractedNum.length >= 8)) {
                                matchedMethod = pm;
                                matchedBy = 'account number';
                                break;
                            }
                        }
                    }
                }

                // SECOND: Only if no number match AND name looks unmasked (no asterisks)
                if (!matchedMethod && result.receiverName && !result.receiverName.includes('*')) {
                    for (const pm of paymentMethods) {
                        if (pm.account_name) {
                            const extractedName = result.receiverName.toLowerCase().replace(/[^a-z]/g, '');
                            const storedName = pm.account_name.toLowerCase().replace(/[^a-z]/g, '');
                            if (extractedName.includes(storedName) || storedName.includes(extractedName)) {
                                matchedMethod = pm;
                                matchedBy = 'account name';
                                break;
                            }
                        }
                    }
                }

                if (matchedMethod) {
                    imageContext.verificationStatus = 'verified';
                    imageContext.verificationDetails = `Payment sent to ${matchedMethod.name} - ${matchedBy} matches our records!`;
                    console.log('✅ Payment VERIFIED:', imageContext.verificationDetails);
                } else if (result.receiverNumber) {
                    // Only mark as mismatch if we have a number to compare
                    imageContext.verificationStatus = 'mismatch';
                    const ourNumbers = paymentMethods
                        .filter(pm => pm.account_number)
                        .map(pm => `${pm.name}: ${pm.account_number}`)
                        .join(', ');
                    imageContext.verificationDetails = `Receipt shows payment to ${result.receiverNumber}, but our account numbers are: ${ourNumbers}`;
                    console.log('⚠️ Payment MISMATCH:', imageContext.verificationDetails);
                } else {
                    // No number to verify - accept but note we couldn't fully verify
                    imageContext.verificationStatus = 'unknown';
                    imageContext.verificationDetails = 'Could not extract account number from receipt for full verification, but receipt looks valid';
                }
            } else {
                imageContext.verificationStatus = 'unknown';
                imageContext.verificationDetails = 'No payment methods configured to verify against';
            }
        }

        // If high-confidence receipt detected, also move to receipt stage
        if (isConfirmedReceipt(result)) {
            console.log('Receipt confirmed! Moving lead to payment stage...');
            await moveLeadToReceiptStage(lead.id, imageUrl, result.details || 'Receipt detected by AI');
        }

        // Increment message count for the lead
        await incrementMessageCount(lead.id);

        // Extract contact info from accompanying text if present
        if (accompanyingText) {
            extractAndStoreContactInfo(lead.id, accompanyingText).catch((err: unknown) => {
                console.error('Error extracting contact info from image message:', err);
            });
        }

        // Build a user message that includes any accompanying text
        const userMessage = accompanyingText
            ? `[Customer sent an image with message: "${accompanyingText}"]`
            : "[Customer sent an image]";

        // Get chatbot response with image context
        const responseText = await getBotResponse(userMessage, sender_psid, imageContext);
        console.log('Bot response for image:', responseText.substring(0, 100) + '...');

        // Send the AI's response (possibly split into multiple messages)
        const settings = await getSettings();
        const splitMessagesEnabled = settings?.split_messages ?? false;

        if (splitMessagesEnabled) {
            const sentences = responseText
                .split(/(?<=[.?!。？！])\s+/)
                .map(s => s.trim())
                .filter(s => s.length > 0);

            for (const sentence of sentences) {
                await callSendAPI(sender_psid, { text: sentence }, pageId);
                if (sentences.indexOf(sentence) < sentences.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
        } else {
            await callSendAPI(sender_psid, { text: responseText }, pageId);
        }

    } catch (error) {
        console.error('Error in handleImageMessage:', error);
        // Send a fallback response on error
        await callSendAPI(sender_psid, {
            text: "Nakita ko po ang image niyo. May tanong ba kayo tungkol dito? 😊"
        }, pageId);
    } finally {
        await sendTypingIndicator(sender_psid, false, pageId);
    }
}
