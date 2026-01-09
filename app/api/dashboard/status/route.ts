import { NextResponse } from 'next/server';
import { createClient, getCurrentUserId } from '@/app/lib/supabaseServer';

export async function GET() {
    try {
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();

        // 1. Check Store Settings - must be for current user AND setup_completed must be true
        const { data: storeSettings, error: storeError } = await supabase
            .from('store_settings')
            .select('id, setup_completed')
            .eq('user_id', userId)
            .single();

        // hasStore is true only if record exists AND setup_completed is true
        const hasStore = !storeError && !!storeSettings && storeSettings.setup_completed === true;

        // 2. Check Facebook Page Connection
        const { count: facebookCount, error: fbError } = await supabase
            .from('connected_pages')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        const hasFacebookPage = !fbError && (facebookCount || 0) > 0;

        // 3. Check Products
        const { count: productCount, error: productError } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true });

        const hasProducts = !productError && (productCount || 0) > 0;

        return NextResponse.json({
            hasStore,
            hasFacebookPage,
            hasProducts
        }, {
            headers: {
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
            }
        });

    } catch (error) {
        console.error('Error checking dashboard status:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
