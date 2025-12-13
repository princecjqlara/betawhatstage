'use client';

import React, { useState, useEffect } from 'react';
import WelcomeWizard from './setup/WelcomeWizard';

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
    const [needsSetup, setNeedsSetup] = useState(false);
    const [loading, setLoading] = useState(true);
    const [initialStep, setInitialStep] = useState(1);
    const [initialData, setInitialData] = useState({});

    const checkSetupStatus = async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();

            // Assuming the settings API returns the raw rows effectively
            // But wait, the existing API only returns mapped camelCase fields.
            // I need to update the settings API to return 'isSetupCompleted' and 'setupStep'
            // OR I can use the new setup endpoints. But easier to add to GET /api/settings.
            // Let's assume for now I will modify the GET endpoint in a moment.

            // For now, let's assume valid data structure if I patch GET first.
            if (data.isSetupCompleted === false) {
                setNeedsSetup(true);
                setInitialStep(data.setupStep || 1);
                setInitialData({
                    businessName: data.businessName,
                    // map other fields if they were exposed
                });
            } else {
                setNeedsSetup(false);
            }
        } catch (error) {
            console.error('Error checking setup:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkSetupStatus();
    }, []);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <>
            {children}
            {needsSetup && (
                <WelcomeWizard
                    currentStep={initialStep}
                    initialData={initialData}
                    onComplete={() => {
                        setNeedsSetup(false);
                        window.location.reload(); // Refresh to ensure all app state is synced
                    }}
                />
            )}
        </>
    );
}
