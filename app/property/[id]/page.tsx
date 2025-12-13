import { Metadata } from 'next';
import { supabase } from '@/app/lib/supabase';
import PropertyDetailClient from './PropertyDetailClient';
import { Building } from 'lucide-react';
import Link from 'next/link';

interface Property {
    id: string;
    title: string;
    description: string | null;
    price: number | null;
    currency: string;
    address: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    sqft: number | null;
    status: 'for_sale' | 'for_rent' | 'sold' | 'rented';
    image_url: string | null;
    is_active: boolean;
    property_type: string | null;
    year_built: number | null;
    lot_area: number | null;
    garage_spaces: number | null;
    down_payment: number | null;
    monthly_amortization: number | null;
    payment_terms: string | null;
}

// Fetch property data
async function getProperty(id: string): Promise<Property | null> {
    const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !data) {
        return null;
    }

    return data as Property;
}

// Fetch related properties
async function getRelatedProperties(propertyId: string): Promise<Property[]> {
    const { data, error } = await supabase
        .from('properties')
        .select('*')
        .neq('id', propertyId)
        .eq('is_active', true)
        .limit(3);

    if (error || !data) {
        return [];
    }

    return data as Property[];
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
    const property = await getProperty(id);

    if (!property) {
        return {
            title: 'Property Not Found',
        };
    }

    const formatPrice = (price: number | null) => {
        if (price === null) return 'Price on Request';
        return `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
    };

    const description = property.description ||
        `${property.title} - ${formatPrice(property.price)}${property.bedrooms ? ` | ${property.bedrooms} BR` : ''}${property.bathrooms ? ` | ${property.bathrooms} Bath` : ''}`;

    return {
        title: property.title,
        description,
        openGraph: {
            title: property.title,
            description,
            images: property.image_url ? [property.image_url] : [],
        },
    };
}

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    // Fetch all data in parallel for better performance
    const [property, facebookPageId] = await Promise.all([
        getProperty(id),
        getFacebookPageId(),
    ]);

    if (!property) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center flex-col">
                <Building className="text-gray-300 mb-4" size={64} />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Property not found</h2>
                <Link href="/store" className="mt-4 px-6 py-2 bg-emerald-500 text-white rounded-full">
                    Back to Listings
                </Link>
            </div>
        );
    }

    // Fetch related properties after confirming property exists
    const relatedProperties = await getRelatedProperties(property.id);

    return (
        <PropertyDetailClient
            property={property}
            relatedProperties={relatedProperties}
            facebookPageId={facebookPageId}
        />
    );
}
