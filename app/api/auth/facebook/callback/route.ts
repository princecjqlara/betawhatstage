import { NextResponse } from 'next/server';
import { storeAuthSession } from '@/app/lib/authSession';

// Facebook OAuth configuration
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const REDIRECT_URI = process.env.NEXT_PUBLIC_BASE_URL
    ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/facebook/callback`
    : 'http://localhost:3000/api/auth/facebook/callback';

interface FacebookPage {
    id: string;
    name: string;
    access_token: string;
    picture?: {
        data?: {
            url?: string;
        };
    };
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
        console.error('Facebook OAuth error:', error, errorDescription);
        const redirectUrl = new URL('/settings', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
        redirectUrl.searchParams.set('error', errorDescription || 'Facebook login failed');
        return NextResponse.redirect(redirectUrl.toString());
    }

    if (!code) {
        const redirectUrl = new URL('/settings', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
        redirectUrl.searchParams.set('error', 'No authorization code received');
        return NextResponse.redirect(redirectUrl.toString());
    }

    if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
        const redirectUrl = new URL('/settings', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
        redirectUrl.searchParams.set('error', 'Facebook App not configured');
        return NextResponse.redirect(redirectUrl.toString());
    }

    try {
        // Step 1: Exchange code for short-lived access token
        const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
        tokenUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
        tokenUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
        tokenUrl.searchParams.set('redirect_uri', REDIRECT_URI);
        tokenUrl.searchParams.set('code', code);

        const tokenResponse = await fetch(tokenUrl.toString());
        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error('Token exchange error:', tokenData.error);
            throw new Error(tokenData.error.message || 'Failed to exchange code for token');
        }

        const shortLivedToken = tokenData.access_token;

        // Step 2: Exchange for long-lived token
        const longLivedUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
        longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
        longLivedUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
        longLivedUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
        longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken);

        const longLivedResponse = await fetch(longLivedUrl.toString());
        const longLivedData = await longLivedResponse.json();

        if (longLivedData.error) {
            console.error('Long-lived token error:', longLivedData.error);
            throw new Error(longLivedData.error.message || 'Failed to get long-lived token');
        }

        const longLivedUserToken = longLivedData.access_token;

        // Step 3: Fetch user's pages with their access tokens
        const pagesUrl = new URL('https://graph.facebook.com/v21.0/me/accounts');
        pagesUrl.searchParams.set('access_token', longLivedUserToken);
        pagesUrl.searchParams.set('fields', 'id,name,access_token,picture');

        const pagesResponse = await fetch(pagesUrl.toString());
        const pagesData = await pagesResponse.json();

        console.log('=== Facebook Pages API Response ===');
        console.log(`Found ${pagesData.data?.length || 0} pages`);

        if (pagesData.error) {
            console.error('Pages fetch error:', pagesData.error);
            throw new Error(pagesData.error.message || 'Failed to fetch pages');
        }

        const pages: FacebookPage[] = pagesData.data || [];

        // Build pages payload
        const pagesPayload = pages.map((page: FacebookPage) => ({
            id: page.id,
            name: page.name,
            access_token: page.access_token,
            picture: page.picture?.data?.url || null,
        }));

        // Store pages in server-side session (avoids cookie size limits)
        const sessionId = storeAuthSession(pagesPayload);
        console.log(`Stored ${pagesPayload.length} pages in session: ${sessionId}`);

        const redirectUrl = new URL('/settings', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
        redirectUrl.searchParams.set('success', 'true');
        redirectUrl.searchParams.set('fb_session', sessionId);

        return NextResponse.redirect(redirectUrl.toString());

    } catch (error) {
        console.error('Facebook OAuth callback error:', error);
        const redirectUrl = new URL('/settings', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
        redirectUrl.searchParams.set('error', error instanceof Error ? error.message : 'Failed to connect Facebook');
        return NextResponse.redirect(redirectUrl.toString());
    }
}
