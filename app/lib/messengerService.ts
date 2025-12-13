import { supabase } from './supabase';

export interface MessengerSendOptions {
    messagingType?: 'RESPONSE' | 'UPDATE' | 'MESSAGE_TAG';
    tag?: 'ACCOUNT_UPDATE' | 'CONFIRMED_EVENT_UPDATE' | 'POST_PURCHASE_UPDATE';
}

// Cache for page tokens to avoid repeated DB calls
const pageTokenCache = new Map<string, { token: string; fetchedAt: number }>();
const PAGE_TOKEN_CACHE_MS = 60000; // 1 minute cache

// Get page access token - prioritizes OAuth connected_pages, falls back to bot_settings
async function getPageAccessToken(): Promise<string | null> {
    const now = Date.now();

    // Check cache first
    const cached = pageTokenCache.get('default');
    if (cached && now - cached.fetchedAt < PAGE_TOKEN_CACHE_MS) {
        return cached.token;
    }

    try {
        // First try to get an active connected page (OAuth flow)
        const { data: connectedPage, error: connectedError } = await supabase
            .from('connected_pages')
            .select('page_access_token')
            .eq('is_active', true)
            .limit(1)
            .single();

        if (!connectedError && connectedPage?.page_access_token) {
            pageTokenCache.set('default', { token: connectedPage.page_access_token, fetchedAt: now });
            console.log('[MessengerService] Using OAuth connected page token');
            return connectedPage.page_access_token;
        }

        // Fallback to bot_settings (legacy manual token)
        const { data: settings } = await supabase
            .from('bot_settings')
            .select('facebook_page_access_token')
            .limit(1)
            .single();

        const token = settings?.facebook_page_access_token || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || null;

        if (token) {
            pageTokenCache.set('default', { token, fetchedAt: now });
            console.log('[MessengerService] Using bot_settings/env token (fallback)');
        }

        return token;
    } catch (error) {
        console.error('[MessengerService] Error fetching page token:', error);
        return process.env.FACEBOOK_PAGE_ACCESS_TOKEN || null;
    }
}

export async function sendMessengerMessage(
    psid: string,
    text: string,
    options: MessengerSendOptions = {}
): Promise<boolean> {
    try {
        const PAGE_ACCESS_TOKEN = await getPageAccessToken();

        if (!PAGE_ACCESS_TOKEN) {
            console.error('[MessengerService] No Facebook Page Access Token available');
            return false;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const requestBody: any = {
            recipient: { id: psid },
            message: { text },
        };

        // Add messaging_type and tag for messages outside 24hr window
        if (options.messagingType) {
            requestBody.messaging_type = options.messagingType;
        }
        if (options.tag) {
            requestBody.tag = options.tag;
        }

        console.log('[MessengerService] Sending message:', { psid, messagingType: options.messagingType, tag: options.tag });

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
            console.error('[MessengerService] Failed to send message:', resData);
            return false;
        }

        console.log('[MessengerService] Message sent successfully');
        return true;
    } catch (error) {
        console.error('[MessengerService] Error sending message:', error);
        return false;
    }
}

export async function sendWithAccountUpdateTag(psid: string, text: string): Promise<boolean> {
    return sendMessengerMessage(psid, text, {
        messagingType: 'MESSAGE_TAG',
        tag: 'ACCOUNT_UPDATE',
    });
}

// Send an image message via Messenger
export async function sendMessengerImage(
    psid: string,
    imageUrl: string,
    options: MessengerSendOptions = {}
): Promise<boolean> {
    return sendMessengerAttachment(psid, imageUrl, 'image', options);
}

// Attachment type for Messenger
export type AttachmentType = 'image' | 'video' | 'audio' | 'file';

// Send any attachment via Messenger (image, video, audio, file)
export async function sendMessengerAttachment(
    psid: string,
    url: string,
    type: AttachmentType = 'file',
    options: MessengerSendOptions = {}
): Promise<boolean> {
    try {
        const PAGE_ACCESS_TOKEN = await getPageAccessToken();

        if (!PAGE_ACCESS_TOKEN) {
            console.error('[MessengerService] No Facebook Page Access Token available');
            return false;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const requestBody: any = {
            recipient: { id: psid },
            message: {
                attachment: {
                    type: type,
                    payload: {
                        url: url,
                        is_reusable: true
                    }
                }
            },
        };

        // Add messaging_type and tag for messages outside 24hr window
        if (options.messagingType) {
            requestBody.messaging_type = options.messagingType;
        }
        if (options.tag) {
            requestBody.tag = options.tag;
        }

        console.log('[MessengerService] Sending attachment:', { psid, url, type, messagingType: options.messagingType, tag: options.tag });

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
            console.error('[MessengerService] Failed to send attachment:', resData);
            return false;
        }

        console.log('[MessengerService] Attachment sent successfully');
        return true;
    } catch (error) {
        console.error('[MessengerService] Error sending attachment:', error);
        return false;
    }
}

export async function canUseBotForLead(leadId: string): Promise<boolean> {
    const { data: lead } = await supabase
        .from('leads')
        .select('bot_disabled')
        .eq('id', leadId)
        .single();

    return !lead?.bot_disabled;
}

export async function disableBotForLead(leadId: string, reason?: string): Promise<void> {
    await supabase
        .from('leads')
        .update({ bot_disabled: true, bot_disabled_reason: reason })
        .eq('id', leadId);
}

export async function enableBotForLead(leadId: string): Promise<void> {
    await supabase
        .from('leads')
        .update({ bot_disabled: false, bot_disabled_reason: null })
        .eq('id', leadId);
}
