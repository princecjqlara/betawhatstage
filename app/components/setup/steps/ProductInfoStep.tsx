'use client';

import React, { useState } from 'react';

interface ProductInfoStepProps {
    initialData: {
        productType?: string;
        productDetails?: string;
    };
    onNext: (data: { productType: string; productDetails: string }) => void;
    isLoading: boolean;
}

export default function ProductInfoStep({ initialData, onNext, isLoading }: ProductInfoStepProps) {
    const [type, setType] = useState(initialData.productType || 'Services');
    const [details, setDetails] = useState(initialData.productDetails || '');

    const types = [
        { id: 'Services', icon: '🛠️', label: 'Services', sub: 'Consulting, Labor, etc.' },
        { id: 'Physical Products', icon: '📦', label: 'Products', sub: 'Retail, E-commerce' },
        { id: 'Properties', icon: '🏠', label: 'Real Estate', sub: 'Rentals, Selling' },
        { id: 'Digital Products', icon: '💻', label: 'Digital', sub: 'Courses, E-books' },
    ];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onNext({ productType: type, productDetails: details });
    };

    return (
        <div className="flex flex-col h-full justify-between">
            <div className="space-y-6">
                <div>
                    <h3 className="text-xl font-bold text-gray-900">What do you sell?</h3>
                    <p className="text-gray-500 text-sm mt-1">Select your primary offering type.</p>
                </div>

                {/* Card Selection Grid */}
                <div className="grid grid-cols-2 gap-3">
                    {types.map((t) => (
                        <div
                            key={t.id}
                            onClick={() => setType(t.id)}
                            className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 flex flex-col items-center text-center ${type === t.id
                                ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500'
                                : 'border-gray-50 bg-white hover:border-emerald-200 hover:bg-gray-50'
                                }`}
                        >
                            <span className="text-2xl mb-2">{t.icon}</span>
                            <span className={`text-sm font-bold ${type === t.id ? 'text-emerald-900' : 'text-gray-700'}`}>
                                {t.label}
                            </span>
                            <span className="text-[10px] text-gray-400 font-medium">
                                {t.sub}
                            </span>
                        </div>
                    ))}
                </div>

                <div className="group">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                        Product Details
                    </label>
                    <textarea
                        required
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        rows={4}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none resize-none"
                        placeholder="List your main products and prices..."
                    />
                </div>
            </div>

            <div className="pt-6">
                <button
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="w-full py-4 bg-[#112D29] text-white rounded-xl font-bold hover:bg-emerald-900 hover:translate-y-px transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            Generating Knowledge...
                        </span>
                    ) : 'Generate & Continue'}
                </button>
            </div>
        </div>
    );
}
