'use client';

import React, { useState } from 'react';

interface ConversationFilesStepProps {
    initialData: {
        flowDescription?: string;
        style?: string;
    };
    onNext: (data: { flowDescription: string; style: string }) => void;
    isLoading: boolean;
}

export default function ConversationFilesStep({ initialData, onNext, isLoading }: ConversationFilesStepProps) {
    const [flow, setFlow] = useState(initialData.flowDescription || '');
    const [style, setStyle] = useState(initialData.style || '');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onNext({ flowDescription: flow, style: style });
    };

    return (
        <div className="flex flex-col h-full justify-between">
            <div className="space-y-6">
                <div>
                    <h3 className="text-xl font-bold text-gray-900">Bot Personality</h3>
                    <p className="text-gray-500 text-sm mt-1">Define how your assistant interacts.</p>
                </div>

                <form id="step3-form" onSubmit={handleSubmit} className="space-y-6">
                    <div className="group">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                            Ideal Conversation Flow
                        </label>
                        <textarea
                            required
                            value={flow}
                            onChange={(e) => setFlow(e.target.value)}
                            rows={3}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none resize-none"
                            placeholder="e.g. Greet, ask what they need, then check schedule..."
                        />
                    </div>

                    <div className="group">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                            Tone of Voice
                        </label>
                        <input
                            type="text"
                            required
                            value={style}
                            onChange={(e) => setStyle(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none font-medium"
                            placeholder="e.g. Enthusiastic and Emoji-heavy"
                        />
                    </div>
                </form>
            </div>

            <div className="pt-6">
                <button
                    form="step3-form"
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 bg-[#112D29] text-white rounded-xl font-bold hover:bg-emerald-900 hover:translate-y-px transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            Optimizing Config...
                        </span>
                    ) : 'Optimize & Continue'}
                </button>
            </div>
        </div>
    );
}
