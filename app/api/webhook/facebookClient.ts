import { getPageToken } from './config';
import type { PaymentMethod, Product, Property } from './data';

const DEFAULT_APP_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://aphelion-photon.vercel.app';

// Send appointment booking card with button to open calendar
export async function sendAppointmentCard(sender_psid: string, pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);
    if (!PAGE_ACCESS_TOKEN) return false;

    // Build the booking URL with the user's PSID and Page ID
    let bookingUrl = `${DEFAULT_APP_URL}/book?psid=${encodeURIComponent(sender_psid)}`;
    if (pageId) {
        bookingUrl += `&pageId=${encodeURIComponent(pageId)}`;
    }

    const requestBody = {
        messaging_type: 'RESPONSE',
        recipient: { id: sender_psid },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'generic',
                    elements: [{
                        title: '📅 Book an Appointment',
                        subtitle: 'Choose a convenient date and time that works for you. Click below to view available slots.',
                        buttons: [
                            {
                                type: 'web_url',
                                url: bookingUrl,
                                title: '🗓️ Book Now',
                                webview_height_ratio: 'tall'
                            }
                        ]
                    }]
                }
            }
        }
    };

    console.log('Sending appointment card:', JSON.stringify(requestBody, null, 2));

    try {
        const res = await fetch(
            `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            }
        );

        const resData = await res.json();
        if (!res.ok) {
            console.error('Failed to send appointment card:', resData);
            return false;
        }

        console.log('Appointment card sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending appointment card:', error);
        return false;
    }
}

// Send cancellation confirmation request to Messenger
export async function sendCancellationConfirmation(
    sender_psid: string,
    appointmentId: string,
    appointmentDate: string,
    appointmentTime: string,
    pageId?: string
): Promise<boolean> {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);
    if (!PAGE_ACCESS_TOKEN) return false;

    const requestBody = {
        messaging_type: 'RESPONSE',
        recipient: { id: sender_psid },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'button',
                    text: `⚠️ Cancellation Request\n\nSomeone is trying to cancel your appointment on ${appointmentDate} at ${appointmentTime}.\n\nIf this was you, please confirm below:`,
                    buttons: [
                        {
                            type: 'postback',
                            title: '✅ Confirm Cancel',
                            payload: `CANCEL_APT_CONFIRM_${appointmentId}`
                        },
                        {
                            type: 'postback',
                            title: '❌ Keep Appointment',
                            payload: `CANCEL_APT_KEEP_${appointmentId}`
                        }
                    ]
                }
            }
        }
    };

    console.log('Sending cancellation confirmation:', JSON.stringify(requestBody, null, 2));

    try {
        const res = await fetch(
            `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            }
        );

        const resData = await res.json();
        if (!res.ok) {
            console.error('Failed to send cancellation confirmation:', resData);
            return false;
        }

        console.log('Cancellation confirmation sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending cancellation confirmation:', error);
        return false;
    }
}

export async function getUserProfile(sender_psid: string, pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);
    if (!PAGE_ACCESS_TOKEN) return null;

    try {
        const res = await fetch(
            `https://graph.facebook.com/v21.0/${sender_psid}?fields=first_name,last_name,profile_pic,name&access_token=${PAGE_ACCESS_TOKEN}`
        );
        const data = await res.json();
        if (data.error) {
            console.error('Error fetching user profile:', data.error);
            return null;
        }
        return data;
    } catch (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }
}

// Send products as Facebook Generic Template cards
export async function sendProductCards(sender_psid: string, products: Product[], pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);
    if (!PAGE_ACCESS_TOKEN || products.length === 0) return false;

    // Build elements for Generic Template (max 10)
    const elements = products.slice(0, 10).map(product => {
        const priceFormatted = product.price
            ? `₱${product.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
            : 'Price upon request';

        // Truncate description if too long
        let subtitle = priceFormatted;
        if (product.description) {
            const desc = product.description.length > 50
                ? product.description.substring(0, 47) + '...'
                : product.description;
            subtitle += ` • ${desc}`;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const element: any = {
            title: product.name,
            subtitle: subtitle,
        };

        // Add image if available
        if (product.image_url) {
            element.image_url = product.image_url;
        }

        // Build product URL with PSID for user tracking
        let productUrl = `${DEFAULT_APP_URL}/product/${product.id}?psid=${encodeURIComponent(sender_psid)}`;
        if (pageId) {
            productUrl += `&pageId=${encodeURIComponent(pageId)}`;
        }

        // Add buttons
        element.buttons = [
            {
                type: 'web_url',
                url: productUrl,
                title: 'View Product',
                webview_height_ratio: 'tall'
            },
            {
                type: 'postback',
                title: '🛒 Add to Cart',
                payload: `ADD_TO_CART_${product.id}`
            }
        ];

        return element;
    });


    const requestBody = {
        messaging_type: 'RESPONSE',
        recipient: { id: sender_psid },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'generic',
                    elements: elements
                }
            }
        }
    };

    console.log('Sending product cards:', JSON.stringify(requestBody, null, 2));

    try {
        const res = await fetch(
            `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            }
        );

        const resData = await res.json();
        if (!res.ok) {
            console.error('Failed to send product cards:', resData);
            return false;
        }

        console.log('Product cards sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending product cards:', error);
        return false;
    }
}

// Send properties as Facebook Generic Template cards
export async function sendPropertyCards(sender_psid: string, properties: Property[], pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);
    if (!PAGE_ACCESS_TOKEN || properties.length === 0) return false;

    // Build elements for Generic Template (max 10)
    const elements = properties.slice(0, 10).map(property => {
        const priceFormatted = property.price
            ? `₱${property.price.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
            : 'Price upon request';

        // Subtitle: Address + Beds/Baths
        const details = [
            property.address,
            property.bedrooms ? `${property.bedrooms} Beds` : null,
            property.bathrooms ? `${property.bathrooms} Baths` : null
        ].filter(Boolean).join(' • ');

        let subtitle = `${priceFormatted}`;
        if (details) subtitle += `\n${details}`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const element: any = {
            title: property.title,
            subtitle: subtitle,
        };

        // Add image if available
        if (property.image_url) {
            element.image_url = property.image_url;
        }

        // Add buttons
        element.buttons = [
            {
                type: 'web_url',
                url: `${DEFAULT_APP_URL}/property/${property.id}`,
                title: 'View Details',
                webview_height_ratio: 'tall'
            },
            {
                type: 'postback',
                title: '💬 Inquire',
                payload: `INQUIRE_PROP_${property.id}`
            }
        ];

        return element;
    });

    const requestBody = {
        messaging_type: 'RESPONSE',
        recipient: { id: sender_psid },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'generic',
                    elements: elements
                }
            }
        }
    };

    console.log('Sending property cards:', JSON.stringify(requestBody, null, 2));

    try {
        const res = await fetch(
            `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            }
        );

        const resData = await res.json();
        if (!res.ok) {
            console.error('Failed to send property cards:', resData);
            return false;
        }

        console.log('Property cards sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending property cards:', error);
        return false;
    }
}


// Send payment methods as Facebook Generic Template cards
export async function sendPaymentMethodCards(sender_psid: string, methods: PaymentMethod[], pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);
    if (!PAGE_ACCESS_TOKEN || methods.length === 0) return false;

    // Build elements for Generic Template (max 10)
    const elements = methods.slice(0, 10).map(pm => {
        const subtitle = [
            pm.account_name ? `Account: ${pm.account_name}` : null,
            pm.account_number ? `Number: ${pm.account_number}` : null,
        ].filter(Boolean).join('\n');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const element: any = {
            title: pm.name,
            subtitle: subtitle || 'Payment method available',
        };

        // Add QR code image if available
        if (pm.qr_code_url) {
            element.image_url = pm.qr_code_url;
        }

        // Add buttons
        element.buttons = [
            {
                type: 'postback',
                title: '✅ I\'ll pay here',
                payload: `PAY_${pm.id}`
            }
        ];

        // Add View QR button if QR code exists
        if (pm.qr_code_url) {
            element.buttons.push({
                type: 'web_url',
                title: '📱 View QR Code',
                url: pm.qr_code_url,
                webview_height_ratio: 'tall'
            });
        }

        return element;
    });

    const requestBody = {
        messaging_type: 'RESPONSE',
        recipient: { id: sender_psid },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'generic',
                    elements: elements
                }
            }
        }
    };

    console.log('Sending payment cards:', JSON.stringify(requestBody, null, 2));

    try {
        const res = await fetch(
            `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            }
        );

        const resData = await res.json();
        if (!res.ok) {
            console.error('Failed to send payment cards:', resData);
            return false;
        }

        console.log('Payment cards sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending payment cards:', error);
        return false;
    }
}

// Send typing indicator to show bot is working
export async function sendTypingIndicator(sender_psid: string, on: boolean, pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);

    if (!PAGE_ACCESS_TOKEN) return;

    try {
        await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: sender_psid },
                sender_action: on ? 'typing_on' : 'typing_off'
            }),
        });
    } catch (error) {
        console.error('Failed to send typing indicator:', error);
    }
}


export async function callSendAPI(sender_psid: string, response: any, pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);

    console.log('callSendAPI called, token present:', !!PAGE_ACCESS_TOKEN);

    if (!PAGE_ACCESS_TOKEN) {
        console.warn('FACEBOOK_PAGE_ACCESS_TOKEN not set, skipping message send.');
        return;
    }

    const requestBody = {
        messaging_type: 'RESPONSE',
        recipient: {
            id: sender_psid,
        },
        message: response,
    };

    console.log('Sending to Facebook:', JSON.stringify(requestBody, null, 2));

    try {
        const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        const resText = await res.text();
        console.log('Facebook API response:', res.status, resText);

        if (!res.ok) {
            console.error('Unable to send message:', resText);
        }
    } catch (error) {
        console.error('Unable to send message:', error);
    }
}
