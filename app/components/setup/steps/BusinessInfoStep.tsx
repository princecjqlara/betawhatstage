'use client';

import React, { useState } from 'react';

interface BusinessInfoStepProps {
    initialData: {
        businessName?: string;
        businessDescription?: string;
    };
    onNext: (data: { businessName: string; businessDescription: string }) => void;
    isLoading: boolean;
}

export default function BusinessInfoStep({ initialData, onNext, isLoading }: BusinessInfoStepProps) {
    const [name, setName] = useState(initialData.businessName || '');
    const [description, setDescription] = useState(initialData.businessDescription || '');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onNext({ businessName: name, businessDescription: description });
    };

    return (
        <div className="flex flex-col h-full justify-between">
            <div className="space-y-8">
                <div className="text-center md:text-left">
                    <h3 className="text-xl font-bold text-gray-900">Business Details</h3>
                    <p className="text-gray-500 text-sm mt-1">Let&apos;s set up your business identity.</p>
                </div>

                <form id="step1-form" onSubmit={handleSubmit} className="space-y-6">
                    <div className="group">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Business Name</label>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none font-medium"
                            placeholder="e.g. Galaxy Coffee"
                        />
                    </div>

                    <div className="group">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                            What do you do?
                        </label>
                        <textarea
                            required
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={4}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none resize-none"
                            placeholder="Briefly describe your business activities..."
                        />
                        <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            AI will use this to learn about you.
                        </p>
                    </div>
                </form>
            </div>

            <div className="pt-8">
                <button
                    form="step1-form"
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 bg-[#112D29] text-white rounded-xl font-bold hover:bg-emerald-900 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {isLoading ? 'Saving...' : 'Continue to Products'}
                    {!isLoading && <span className="text-emerald-400">→</span>}
                </button>
            </div>
        </div>
    );
}
