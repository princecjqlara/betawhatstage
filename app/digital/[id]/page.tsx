import { supabase } from '@/app/lib/supabase';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import DigitalProductClient from './DigitalProductClient';
import { BookOpen } from 'lucide-react';

interface Media {
    id: string;
    media_type: 'image' | 'video';
    media_url: string;
    thumbnail_url: string | null;
    display_order: number;
}

interface Field {
    id: string;
    label: string;
    field_type: string;
    is_required: boolean;
    options?: string[];
    placeholder?: string;
    use_separator?: boolean;
    step_number: number;
}

interface DigitalProduct {
    id: string;
    title: string;
    description: string | null;
    short_description: string | null;
    price: number | null;
    currency: string;
    is_active: boolean;
    access_type: string;
    access_duration_days: number | null;
    payment_type: 'one_time' | 'recurring';
    billing_interval: 'monthly' | 'yearly';
    thumbnail_url: string | null;
    creator_name: string | null;
    category: { id: string; name: string; color: string } | null;
    checkout_form: {
        id: string;
        title: string;
        description: string | null;
        settings: {
            steps?: { label: string }[];
            payment_instructions?: string;
            [key: string]: any;
        };
    } | null;
    media: Media[];
}

// Server-side data fetching function
async function getDigitalProduct(id: string): Promise<DigitalProduct | null> {
    const { data: product, error } = await supabase
        .from('digital_products')
        .select(`
            *,
            category:product_categories(id, name, color),
            checkout_form:forms(id, title, description, settings),
            media:digital_product_media(id, media_type, media_url, thumbnail_url, display_order)
        `)
        .eq('id', id)
        .single();

    if (error || !product) {
        console.log('[DigitalProduct] Error fetching product:', error?.message);
        return null;
    }

    // Sort media by display_order
    product.media = product.media?.sort((a: any, b: any) => a.display_order - b.display_order) || [];

    // Normalize checkout_form - Supabase may return it as array for FK relations
    if (Array.isArray(product.checkout_form)) {
        product.checkout_form = product.checkout_form[0] || null;
    }

    console.log('[DigitalProduct] Loaded product:', product.id, 'checkout_form:', product.checkout_form?.id);

    return product;
}

// Server-side form fields fetching
async function getFormFields(formId: string): Promise<{ fields: Field[], settings: any }> {
    console.log('[DigitalProduct] Fetching form fields for form:', formId);

    const { data: form, error } = await supabase
        .from('forms')
        .select(`
            settings,
            fields:form_fields(id, label, field_type, is_required, options, placeholder, use_separator, step_number)
        `)
        .eq('id', formId)
        .single();

    if (error || !form) {
        console.log('[DigitalProduct] Error fetching form fields:', error?.message);
        return { fields: [], settings: {} };
    }

    console.log('[DigitalProduct] Form found, fields count:', form.fields?.length || 0);

    // Ensure fields have step_number
    const fieldsWithSteps = (form.fields || []).map((f: Field) => ({
        ...f,
        step_number: f.step_number || 1
    }));

    return { fields: fieldsWithSteps, settings: form.settings };
}

// Generate metadata for SEO
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const product = await getDigitalProduct(id);

    if (!product) {
        return {
            title: 'Product Not Found',
            description: 'The requested digital product could not be found.'
        };
    }

    return {
        title: product.title,
        description: product.short_description || product.description || `Get access to ${product.title}`,
        openGraph: {
            title: product.title,
            description: product.short_description || product.description || `Get access to ${product.title}`,
            images: product.thumbnail_url ? [product.thumbnail_url] : product.media?.[0]?.media_url ? [product.media[0].media_url] : [],
        },
    };
}

// Server Component - fetches data on the server for instant HTML delivery
export default async function DigitalProductPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    // Fetch product data on the server
    const product = await getDigitalProduct(id);

    // Handle not found
    if (!product) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center text-gray-500">
                    <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <h1 className="text-2xl font-bold mb-2 text-gray-800">Product Not Found</h1>
                    <p>The digital product you're looking for doesn't exist.</p>
                </div>
            </div>
        );
    }

    // Handle inactive product
    if (!product.is_active) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center text-gray-500">
                    <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <h1 className="text-2xl font-bold mb-2 text-gray-800">Product Not Available</h1>
                    <p>This product is currently not available.</p>
                </div>
            </div>
        );
    }

    // Fetch form fields if checkout form exists
    let formFields: Field[] = [];
    if (product.checkout_form?.id) {
        const formData = await getFormFields(product.checkout_form.id);
        formFields = formData.fields;

        // Update product with form settings (for steps)
        if (formData.settings) {
            product.checkout_form.settings = formData.settings;
        }
    }

    // Render the client component with server-fetched data
    return <DigitalProductClient product={product} initialFormFields={formFields} />;
}
