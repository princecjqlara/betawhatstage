import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { supabase } from '@/app/lib/supabase';
import ProductDetailClient from './ProductDetailClient';
import { Loader2, Package, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface ProductCategory {
    id: string;
    name: string;
    color: string;
}

interface Product {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    currency: string;
    image_url: string | null;
    category_id: string | null;
    category: ProductCategory | null;
    is_active: boolean;
}

interface Variation {
    id: string;
    variation_type: { name: string };
    value: string;
    price: number;
}

// Fetch product data
async function getProduct(id: string): Promise<Product | null> {
    const { data, error } = await supabase
        .from('products')
        .select(`
            *,
            category:product_categories(id, name, color)
        `)
        .eq('id', id)
        .single();

    if (error || !data) {
        return null;
    }

    return data as Product;
}

// Fetch product variations
async function getVariations(productId: string): Promise<Variation[]> {
    const { data, error } = await supabase
        .from('product_variations')
        .select(`
            *,
            variation_type:product_variation_types(id, name)
        `)
        .eq('product_id', productId)
        .order('display_order', { ascending: true });

    if (error || !data) {
        return [];
    }

    return data as Variation[];
}

// Fetch related products
async function getRelatedProducts(productId: string, categoryId: string | null): Promise<Product[]> {
    let query = supabase
        .from('products')
        .select(`
            *,
            category:product_categories(id, name, color)
        `)
        .neq('id', productId)
        .eq('is_active', true)
        .limit(4);

    if (categoryId) {
        query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;

    if (error || !data) {
        return [];
    }

    return data as Product[];
}

// Fetch connected Facebook page
async function getFacebookPageId(): Promise<string | null> {
    const { data, error } = await supabase
        .from('facebook_pages')
        .select('page_id')
        .limit(1)
        .single();

    if (error || !data) {
        return null;
    }

    return data.page_id;
}

// Generate dynamic metadata for SEO
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const product = await getProduct(id);

    if (!product) {
        return {
            title: 'Product Not Found',
        };
    }

    const formatPrice = (price: number | null) => {
        if (price === null) return 'Price on request';
        return `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
    };

    return {
        title: product.name,
        description: product.description || `${product.name} - ${formatPrice(product.price)}`,
        openGraph: {
            title: product.name,
            description: product.description || `${product.name} - ${formatPrice(product.price)}`,
            images: product.image_url ? [product.image_url] : [],
        },
    };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    // Fetch all data in parallel for better performance
    const [product, facebookPageId] = await Promise.all([
        getProduct(id),
        getFacebookPageId(),
    ]);

    if (!product) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="text-center">
                    <Package className="mx-auto mb-4 text-gray-300" size={64} />
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Product not found</h2>
                    <p className="text-gray-500 mb-6">The product you&apos;re looking for doesn&apos;t exist.</p>
                    <Link
                        href="/store"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-full hover:bg-emerald-600 transition-colors font-medium"
                    >
                        <ArrowLeft size={18} />
                        Back to Store
                    </Link>
                </div>
            </div>
        );
    }

    // Fetch variations and related products after confirming product exists
    const [variations, relatedProducts] = await Promise.all([
        getVariations(product.id),
        getRelatedProducts(product.id, product.category_id),
    ]);

    return (
        <ProductDetailClient
            product={product}
            variations={variations}
            relatedProducts={relatedProducts}
            facebookPageId={facebookPageId}
        />
    );
}
