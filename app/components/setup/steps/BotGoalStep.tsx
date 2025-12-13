'use client';

import React, { useState } from 'react';

interface BotGoalStepProps {
    initialData: {
        botGoal?: string;
    };
    onNext: (data: { botGoal: string }) => void;
    isLoading: boolean;
}

export default function BotGoalStep({ initialData, onNext, isLoading }: BotGoalStepProps) {
    const [goal, setGoal] = useState(initialData.botGoal || 'Lead Generation');

    const goals = [
        { id: 'Lead Generation', icon: '🎯', title: 'Get Leads', desc: 'Collect contact details' },
        { id: 'Appointment Booking', icon: '📅', title: 'Bookings', desc: 'Schedule appointments' },
        { id: 'Customer Support', icon: '💬', title: 'Support', desc: 'Answer FAQs 24/7' },
        { id: 'Sales', icon: '💰', title: 'Sales', desc: 'Direct purchases' },
    ];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onNext({ botGoal: goal });
    };

    return (
        <div className="flex flex-col h-full justify-between">
            <div className="space-y-6">
                <div>
                    <h3 className="text-xl font-bold text-gray-900">Primary Goal</h3>
                    <p className="text-gray-500 text-sm mt-1">What is success for this bot?</p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                    {goals.map((g) => (
                        <div
                            key={g.id}
                            onClick={() => setGoal(g.id)}
                            className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex items-center gap-4 ${goal === g.id
                                ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 shadow-sm'
                                : 'border-gray-100 bg-white hover:border-emerald-200 hover:bg-gray-50'
                                }`}
                        >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 ${goal === g.id ? 'bg-emerald-100' : 'bg-gray-100'
                                }`}>
                                {g.icon}
                            </div>
                            <div>
                                <h4 className={`font-bold text-sm ${goal === g.id ? 'text-emerald-900' : 'text-gray-900'}`}>
                                    {g.title}
                                </h4>
                                <p className="text-xs text-gray-500 font-medium">
                                    {g.desc}
                                </p>
                            </div>
                            <div className="ml-auto">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${goal === g.id ? 'border-emerald-500' : 'border-gray-300'
                                    }`}>
                                    {goal === g.id && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="pt-6">
                <button
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="w-full py-4 bg-[#112D29] text-white rounded-xl font-bold hover:bg-emerald-900 hover:translate-y-px transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isLoading ? 'Saving...' : 'Continue'}
                </button>
            </div>
        </div>
    );
}
