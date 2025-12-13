'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BusinessInfoStep from './steps/BusinessInfoStep';
import ProductInfoStep from './steps/ProductInfoStep';
import ConversationFilesStep from './steps/ConversationFilesStep';
import BotGoalStep from './steps/BotGoalStep';
import ConnectPageStep from './steps/ConnectPageStep';

interface WizardData {
    businessName: string;
    businessDescription: string;
    productType: string;
    productDetails: string;
    flowDescription: string;
    style: string;
    botGoal: string;
    [key: string]: string | undefined;
}

interface WelcomeWizardProps {
    currentStep?: number;
    initialData?: Partial<WizardData>;
    onComplete: () => void;
}

export default function WelcomeWizard({ currentStep = 1, initialData, onComplete }: WelcomeWizardProps) {
    const [step, setStep] = useState(currentStep);
    const [isLoading, setIsLoading] = useState(false);
    const [wizardData, setWizardData] = useState<WizardData>({
        businessName: '',
        businessDescription: '',
        productType: 'Services',
        productDetails: '',
        flowDescription: '',
        style: '',
        botGoal: '',
        ...initialData
    });

    const totalSteps = 5;

    // Step labels for the stepper
    const stepLabels = [
        "Business Info",
        "Products",
        "Personality",
        "Goals",
        "Connect"
    ];

    const saveProgress = async (newStep: number, dataToSave?: Partial<WizardData>) => {
        try {
            await fetch('/api/setup/update-step', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    step: newStep,
                    data: { ...wizardData, ...dataToSave }
                })
            });
        } catch (e) {
            console.error('Failed to save progress', e);
        }
    };

    const handleNext = async (stepData: Partial<WizardData>) => {
        setIsLoading(true);
        const newData = { ...wizardData, ...stepData };
        setWizardData(newData);

        try {
            if (step === 1) await saveProgress(1, stepData);

            else if (step === 2) {
                fetch('/api/setup/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'knowledge',
                        data: {
                            business: { name: newData.businessName, description: newData.businessDescription },
                            products: { type: newData.productType, details: newData.productDetails }
                        }
                    })
                });
                await saveProgress(2);
            }

            else if (step === 3) {
                fetch('/api/setup/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'config',
                        data: {
                            business: { name: newData.businessName, description: newData.businessDescription },
                            preferences: { flowDescription: newData.flowDescription, style: newData.style }
                        }
                    })
                });
                await saveProgress(3);
            }

            else if (step === 4) await saveProgress(4, stepData);

            if (step < totalSteps) {
                setStep(step + 1);
            } else {
                await fetch('/api/setup/complete', { method: 'POST' });
                onComplete();
            }
        } catch (error) {
            console.error('Error moving next:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex bg-white font-sans text-slate-800">
            {/* Left Panel - Form Area */}
            <div className="w-full lg:w-1/2 flex flex-col pt-12 text-slate-900 bg-white overflow-y-auto">
                <div className="w-full max-w-lg mx-auto px-8 pb-12 flex flex-col h-full">

                    {/* Header / Logo Area */}
                    <div className="mb-10">
                        <h2 className="text-2xl font-extrabold text-[#112D29] tracking-tight">
                            Create your Assistant
                        </h2>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center justify-between mb-12 relative">
                        {/* Connecting Line */}
                        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-100 -z-10 transform -translate-y-1/2" />

                        {stepLabels.map((label, idx) => {
                            const stepNum = idx + 1;
                            const isActive = step === stepNum;
                            const isCompleted = step > stepNum;

                            return (
                                <div key={idx} className="flex flex-col items-center">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 border-2 ${isActive
                                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200'
                                        : isCompleted
                                            ? 'bg-emerald-100 border-emerald-600 text-emerald-700'
                                            : 'bg-white border-gray-200 text-gray-400'
                                        }`}>
                                        {isCompleted ? (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        ) : stepNum}
                                    </div>
                                    <span className={`mt-2 text-[10px] font-medium uppercase tracking-wider ${isActive ? 'text-emerald-700' : 'text-gray-400'
                                        }`}>
                                        {/* Setup Step 3... displayed as "DETAILS" etc? 
                                            Keeping simplified "Step X" might work or just hiding labels on mobile
                                         */}
                                        {/* {label} - Hiding labels for cleaner look like reference, showing active only? 
                                             Reference shows "Project Type", "Details", "Step 3". 
                                             Let's show labels.
                                         */}
                                        {label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Content Container */}
                    <div className="flex-1">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={step}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.3 }}
                                className="h-full"
                            >
                                {step === 1 && <BusinessInfoStep initialData={wizardData} onNext={handleNext} isLoading={isLoading} />}
                                {step === 2 && <ProductInfoStep initialData={wizardData} onNext={handleNext} isLoading={isLoading} />}
                                {step === 3 && <ConversationFilesStep initialData={wizardData} onNext={handleNext} isLoading={isLoading} />}
                                {step === 4 && <BotGoalStep initialData={wizardData} onNext={handleNext} isLoading={isLoading} />}
                                {step === 5 && <ConnectPageStep initialData={wizardData} onNext={handleNext} isLoading={isLoading} />}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Right Panel - Branding / Visuals */}
            <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-[#6366f1] to-[#a855f7] relative overflow-hidden items-center justify-center p-12 text-white">

                {/* Override Gradient to match green user request */}
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 z-0"></div>

                {/* Decorative Objects (Blobs) */}
                <div className="absolute top-20 right-20 w-32 h-32 bg-yellow-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
                <div className="absolute top-40 left-20 w-32 h-32 bg-green-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>

                <div className="relative z-10 text-center max-w-lg">
                    <motion.div
                        key={step} // Animate text on step change
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        <h1 className="text-4xl lg:text-5xl font-bold mb-6 leading-tight drop-shadow-sm">
                            {step === 1 && "Start Your Automation Journey"}
                            {step === 2 && "Teach Us About Your Products"}
                            {step === 3 && "Define Your Bot's Personality"}
                            {step === 4 && "What's Your Main Goal?"}
                            {step === 5 && "Ready to Launch!"}
                        </h1>
                        <p className="text-lg text-emerald-50 opacity-90 font-light leading-relaxed">
                            {step === 1 && "Tell us about your business so we can build a personalized AI assistant just for you."}
                            {step === 2 && "Our AI will generate a complete knowledge base from your product details automatically."}
                            {step === 3 && "Make your assistant sound exactly like your best employee."}
                            {step === 4 && "Choose what matters most: Leads, Sales, or Support."}
                            {step === 5 && "Connect your Facebook page and watch your assistant start working immediately."}
                        </p>

                        {/* Visual Mockup Placeholder */}
                        <div className="mt-12 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 shadow-2xl transform rotate-1 hover:rotate-0 transition-transform duration-500">
                            {/* Simple "Dashboard" looking mocks */}
                            <div className="flex gap-4 mb-4">
                                <div className="w-1/4 h-20 bg-white/20 rounded-lg animate-pulse" />
                                <div className="w-1/4 h-20 bg-white/20 rounded-lg animate-pulse delay-75" />
                                <div className="w-1/4 h-20 bg-white/20 rounded-lg animate-pulse delay-150" />
                                <div className="w-1/4 h-20 bg-white/20 rounded-lg animate-pulse delay-200" />
                            </div>
                            <div className="space-y-3">
                                <div className="h-4 bg-white/20 rounded w-3/4" />
                                <div className="h-4 bg-white/10 rounded w-full" />
                                <div className="h-4 bg-white/10 rounded w-5/6" />
                            </div>
                        </div>

                    </motion.div>
                </div>
            </div>
        </div>
    );
}
