'use client';

import { useState } from 'react';
import {
    Share2,
    MessageCircle,
    MapPin,
    BedDouble,
    Bath,
    Maximize,
    Banknote,
    Home,
    Building,
    ChevronRight,
} from 'lucide-react';
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

interface PropertyDetailClientProps {
    property: Property;
    relatedProperties: Property[];
    facebookPageId: string | null;
}

export default function PropertyDetailClient({
    property,
    relatedProperties,
    facebookPageId,
}: PropertyDetailClientProps) {
    const formatPrice = (price: number | null) => {
        if (price === null) return 'Price on Request';
        return `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
    };

    const handleChatToInquire = () => {
        if (!facebookPageId) {
            alert('Messenger is not configured. Please contact the administrator.');
            return;
        }

        const refPayload = `prop_id:${property.id}`;
        const mmeUrl = `https://m.me/${facebookPageId}?ref=${encodeURIComponent(refPayload)}`;
        window.open(mmeUrl, '_blank');
    };

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Breadcrumb */}
                <nav className="flex items-center gap-2 text-sm mb-8 text-gray-500">
                    <Link href="/store" className="hover:text-emerald-600 transition-colors">
                        Properties
                    </Link>
                    <ChevronRight size={14} />
                    <span className="font-medium text-gray-900 truncate max-w-xs">
                        {property.title}
                    </span>
                </nav>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
                    {/* Left Column - Image */}
                    <div className="space-y-6">
                        <div className="relative aspect-[16/9] lg:aspect-[4/3] bg-gray-100 rounded-3xl overflow-hidden shadow-sm">
                            {property.image_url ? (
                                <img
                                    src={property.image_url}
                                    alt={property.title}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Building size={64} className="text-gray-300" />
                                </div>
                            )}
                            <div className="absolute top-4 left-4 px-3 py-1 bg-black/50 backdrop-blur text-white text-xs font-bold uppercase rounded-full">
                                {property.status.replace('_', ' ')}
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Details */}
                    <div className="space-y-8">
                        <div>
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h1 className="text-3xl font-bold text-gray-900 mb-2 leading-tight">
                                        {property.title}
                                    </h1>
                                    <div className="flex items-center text-gray-500">
                                        <MapPin size={18} className="mr-1 text-emerald-500" />
                                        {property.address || 'Location upon request'}
                                    </div>
                                </div>
                                <div className="text-right">
                                    {property.property_type && (
                                        <div className="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold mb-2">
                                            {property.property_type}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <p className="text-4xl font-bold text-emerald-600 mb-6">
                                {formatPrice(property.price)}
                            </p>

                            <p className="text-gray-600 leading-relaxed text-lg mb-8">
                                {property.description || 'No description provided.'}
                            </p>

                            {/* Key Specs Grid */}
                            <div className="grid grid-cols-3 sm:grid-cols-3 gap-4 mb-8">
                                <div className="p-4 bg-gray-50 rounded-2xl text-center border border-gray-100">
                                    <BedDouble size={24} className="mx-auto text-gray-400 mb-2" />
                                    <div className="font-bold text-gray-900 text-lg">{property.bedrooms || '-'}</div>
                                    <div className="text-xs text-gray-500 uppercase tracking-wide">Beds</div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-2xl text-center border border-gray-100">
                                    <Bath size={24} className="mx-auto text-gray-400 mb-2" />
                                    <div className="font-bold text-gray-900 text-lg">{property.bathrooms || '-'}</div>
                                    <div className="text-xs text-gray-500 uppercase tracking-wide">Baths</div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-2xl text-center border border-gray-100">
                                    <Maximize size={24} className="mx-auto text-gray-400 mb-2" />
                                    <div className="font-bold text-gray-900 text-lg">{property.sqft || '-'}</div>
                                    <div className="text-xs text-gray-500 uppercase tracking-wide">Sqft</div>
                                </div>
                            </div>

                            {/* Detailed Specs */}
                            <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-8 shadow-sm">
                                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <Home size={18} className="text-emerald-500" />
                                    Property Features
                                </h3>
                                <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                                    <div className="flex justify-between border-b border-gray-50 pb-2">
                                        <span className="text-gray-500">Lot Area</span>
                                        <span className="font-medium text-gray-900">{property.lot_area ? `${property.lot_area} sqm` : '-'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-50 pb-2">
                                        <span className="text-gray-500">Floor Area</span>
                                        <span className="font-medium text-gray-900">{property.sqft ? `${property.sqft} sqft` : '-'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-50 pb-2">
                                        <span className="text-gray-500">Garage</span>
                                        <span className="font-medium text-gray-900">{property.garage_spaces ? `${property.garage_spaces} Cars` : '-'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-50 pb-2">
                                        <span className="text-gray-500">Year Built</span>
                                        <span className="font-medium text-gray-900">{property.year_built || '-'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-50 pb-2">
                                        <span className="text-gray-500">Type</span>
                                        <span className="font-medium text-gray-900">{property.property_type || '-'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-50 pb-2">
                                        <span className="text-gray-500">Status</span>
                                        <span className="font-medium text-gray-900 capitalize">{property.status.replace('_', ' ')}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Financials */}
                            {(property.down_payment || property.monthly_amortization || property.payment_terms) && (
                                <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-6 mb-8">
                                    <h3 className="font-bold text-emerald-900 mb-4 flex items-center gap-2">
                                        <Banknote size={18} className="text-emerald-600" />
                                        Financial Details
                                    </h3>
                                    <div className="space-y-3 text-sm">
                                        {property.down_payment && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-emerald-700">Down Payment</span>
                                                <span className="font-bold text-emerald-900 text-lg">{formatPrice(property.down_payment)}</span>
                                            </div>
                                        )}
                                        {property.monthly_amortization && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-emerald-700">Est. Monthly Amortization</span>
                                                <span className="font-bold text-emerald-900 text-lg">{formatPrice(property.monthly_amortization)}</span>
                                            </div>
                                        )}
                                        {property.payment_terms && (
                                            <div className="pt-3 mt-3 border-t border-emerald-200/50">
                                                <span className="block text-xs uppercase tracking-wide text-emerald-600 mb-1">Payment Terms</span>
                                                <p className="text-emerald-800">{property.payment_terms}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Action Button */}
                            <button
                                onClick={handleChatToInquire}
                                className="w-full bg-[#0084FF] hover:bg-[#0078E7] text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-blue-500/20 hover:shadow-xl transform hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 text-lg"
                            >
                                <MessageCircle size={24} />
                                Chat to Inquire
                            </button>
                            <p className="text-center text-xs text-gray-400 mt-3">
                                Redirects to Messenger to chat with an agent
                            </p>
                        </div>
                    </div>
                </div>

                {/* Related Properties */}
                {relatedProperties.length > 0 && (
                    <div className="mt-16 pt-16 border-t border-gray-100">
                        <h2 className="text-2xl font-bold text-gray-900 mb-8">Similar Properties</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {relatedProperties.map((related) => (
                                <Link key={related.id} href={`/property/${related.id}`} className="group block">
                                    <div className="relative aspect-[4/3] bg-gray-100 rounded-2xl overflow-hidden mb-4">
                                        {related.image_url ?
                                            <img src={related.image_url} alt={related.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                            : <div className="w-full h-full flex items-center justify-center"><Building className="text-gray-300" size={32} /></div>
                                        }
                                        <div className="absolute bottom-3 left-3 px-3 py-1 bg-white/90 backdrop-blur rounded-lg text-sm font-bold text-gray-900 shadow-sm">
                                            {formatPrice(related.price)}
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-gray-900 text-lg mb-1 truncate group-hover:text-emerald-600 transition-colors">{related.title}</h3>
                                    <div className="flex items-center text-gray-500 text-sm">
                                        <MapPin size={14} className="mr-1" />
                                        <span className="truncate">{related.address}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
