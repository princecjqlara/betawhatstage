import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Do not run code between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.

    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Protected routes - redirect to login if not authenticated
    const isLoginPage = request.nextUrl.pathname === '/login';
    const isApiRoute = request.nextUrl.pathname.startsWith('/api');
    // Allow public access to product/property detail pages
    const isPublicProductPage = /^\/product\/[^/]+$/.test(request.nextUrl.pathname);
    const isPublicPropertyPage = /^\/property\/[^/]+$/.test(request.nextUrl.pathname);
    const isBookingPage = request.nextUrl.pathname === '/book';

    if (!user && !isLoginPage && !isApiRoute && !isPublicProductPage && !isPublicPropertyPage && !isBookingPage) {
        // Redirect unauthenticated users to login
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }

    if (user && isLoginPage) {
        // Redirect authenticated users away from login page
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}
