'use client';

import { useState, useEffect, Suspense } from 'react';
import { ArrowLeft, Facebook, Trash2, CheckCircle, AlertCircle, Loader2, Calendar } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageSelector from '@/app/components/PageSelector';

interface ConnectedPage {
    id: string;
    page_id: string;
    page_name: string;
    is_active: boolean;
    webhook_subscribed: boolean;
    profile_pic: string | null;
    created_at: string;
}

interface FacebookPageData {
    id: string;
    name: string;
    access_token: string;
    picture: string | null;
}



function SettingsContent() {
    const searchParams = useSearchParams();

    const [message, setMessage] = useState('');
    const [connectedPages, setConnectedPages] = useState<ConnectedPage[]>([]);
    const [loadingPages, setLoadingPages] = useState(true);

    // Facebook OAuth state
    const [showPageSelector, setShowPageSelector] = useState(false);
    const [availablePages, setAvailablePages] = useState<FacebookPageData[]>([]);

    // Handle OAuth callback results
    useEffect(() => {
        const success = searchParams.get('success');
        const error = searchParams.get('error');
        const fbSession = searchParams.get('fb_session');

        if (error) {
            setMessage(`Error: ${decodeURIComponent(error)}`);
            window.history.replaceState({}, '', '/settings');
        } else if (success && fbSession) {
            // Fetch pages from server-side session
            const fetchPagesFromSession = async () => {
                try {
                    console.log('Fetching pages from session:', fbSession);
                    const res = await fetch(`/api/auth/facebook/temp-pages?session_id=${fbSession}`);
                    const data = await res.json();

                    console.log('Session API response:', data);

                    if (data.pages && data.pages.length > 0) {
                        setAvailablePages(data.pages);
                        setShowPageSelector(true);
                    } else {
                        setMessage('No Facebook pages found. Make sure you have admin access to at least one page.');
                    }
                } catch (e) {
                    console.error('Failed to fetch pages from session:', e);
                    setMessage('Failed to process Facebook pages data');
                }
                // Clear URL params after processing
                window.history.replaceState({}, '', '/settings');
            };

            fetchPagesFromSession();
        }
    }, [searchParams]);



    useEffect(() => {
        fetchConnectedPages();
    }, []);

    const fetchConnectedPages = async () => {
        setLoadingPages(true);
        try {
            const res = await fetch('/api/facebook/pages');
            const data = await res.json();
            setConnectedPages(data.pages || []);
        } catch (error) {
            console.error('Failed to fetch connected pages:', error);
        } finally {
            setLoadingPages(false);
        }
    };

    const handleFacebookLogin = () => {
        // Redirect to Facebook OAuth
        window.location.href = '/api/auth/facebook/login';
    };

    const handleConnectPages = async (pages: FacebookPageData[]) => {
        const results: string[] = [];

        for (const page of pages) {
            try {
                const res = await fetch('/api/facebook/pages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pageId: page.id,
                        pageName: page.name,
                        pageAccessToken: page.access_token,
                        profilePic: page.picture,
                    }),
                });

                const data = await res.json();
                if (data.success) {
                    results.push(`${page.name}: Connected${data.webhookSubscribed ? ' & subscribed' : ''}`);
                } else {
                    results.push(`${page.name}: ${data.error || 'Failed'}`);
                }
            } catch (error) {
                results.push(`${page.name}: Error connecting`);
            }
        }

        setShowPageSelector(false);
        setAvailablePages([]);
        await fetchConnectedPages();
        setMessage(results.join('. '));
        setTimeout(() => setMessage(''), 5000);
    };

    const handleDisconnectPage = async (pageId: string, pageName: string) => {
        if (!confirm(`Are you sure you want to disconnect "${pageName}"?`)) {
            return;
        }

        try {
            const res = await fetch(`/api/facebook/pages?pageId=${pageId}`, {
                method: 'DELETE',
            });

            const data = await res.json();
            if (data.success) {
                setMessage(`"${pageName}" disconnected successfully`);
                await fetchConnectedPages();
            } else {
                setMessage(`Failed to disconnect: ${data.error}`);
            }
        } catch (error) {
            setMessage('Error disconnecting page');
        }
        setTimeout(() => setMessage(''), 3000);
    };

    return (
        <div className="min-h-screen bg-white font-sans">
            <div className="max-w-5xl mx-auto p-8 lg:p-12 space-y-12">
                {/* Header Section */}
                <div className="flex items-center gap-6">
                    <Link
                        href="/"
                        className="p-3 hover:bg-gray-50 rounded-full text-gray-400 hover:text-gray-900 transition-colors"
                        aria-label="Go back"
                    >
                        <ArrowLeft size={24} />
                    </Link>
                    <div>
                        <h1 className="text-4xl font-light text-gray-900 tracking-tight">Settings</h1>
                        <p className="text-gray-500 mt-2 text-lg font-light">Manage your connected accounts</p>
                    </div>
                </div>

                {/* Message Display */}
                {message && (
                    <div className={`p-4 rounded-xl text-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${message.includes('success') || message.includes('Connected')
                        ? 'bg-green-50 text-green-800'
                        : 'bg-red-50 text-red-800'
                        }`}>
                        {message.includes('success') || message.includes('Connected') ? (
                            <CheckCircle size={20} />
                        ) : (
                            <AlertCircle size={20} />
                        )}
                        {message}
                    </div>
                )}

                {/* Facebook Connection Card */}
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-start gap-5">
                            <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
                                <Facebook size={32} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-normal text-gray-900">Facebook Pages</h2>
                                <p className="text-gray-500 mt-1 text-base font-light">
                                    Connect your pages to enable AI messaging automation
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleFacebookLogin}
                            className="flex items-center gap-2 px-8 py-3 bg-teal-600 text-white rounded-full hover:bg-black hover:shadow-lg transition-all font-medium text-sm tracking-wide active:scale-95"
                        >
                            <Facebook size={18} />
                            Connect New Page
                        </button>
                    </div>

                    {/* Connected Pages List */}
                    <div className="space-y-4">
                        {loadingPages ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                <Loader2 className="animate-spin mb-3" size={24} />
                                <span className="font-light text-sm">Loading your pages...</span>
                            </div>
                        ) : connectedPages.length === 0 ? (
                            <div className="text-center py-16 px-4 bg-gray-50/50 rounded-[32px] border border-dashed border-gray-200">
                                <div className="bg-white p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 shadow-sm border border-gray-100">
                                    <Facebook size={24} className="text-gray-300" />
                                </div>
                                <h3 className="text-gray-900 font-medium mb-1">No pages connected</h3>
                                <p className="text-gray-500 text-sm max-w-sm mx-auto font-light">
                                    Link your Facebook pages to start automating replies.
                                </p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {connectedPages.map((page) => (
                                    <div
                                        key={page.id}
                                        className="group flex flex-col sm:flex-row items-start sm:items-center gap-6 p-6 bg-white border border-gray-100 rounded-[24px] hover:shadow-lg transition-all duration-300 hover:border-gray-200"
                                    >
                                        {/* Page Picture */}
                                        <div className="relative">
                                            {page.profile_pic ? (
                                                <img
                                                    src={page.profile_pic}
                                                    alt={page.page_name}
                                                    className="w-16 h-16 rounded-2xl object-cover shadow-sm bg-gray-50"
                                                />
                                            ) : (
                                                <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
                                                    <span className="text-xl font-bold text-gray-400">
                                                        {page.page_name.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                            )}
                                            {page.is_active && (
                                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-4 border-white rounded-full"></div>
                                            )}
                                        </div>

                                        {/* Page Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="font-semibold text-gray-900 text-xl truncate tracking-tight">
                                                    {page.page_name}
                                                </h3>
                                                <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-md font-mono">
                                                    {page.page_id}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3">
                                                {page.webhook_subscribed ? (
                                                    <span className="inline-flex items-center gap-1.5 text-sm text-green-700 font-medium">
                                                        <CheckCircle size={16} className="text-green-600" />
                                                        Active & Synced
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 text-sm text-amber-700 font-medium">
                                                        <AlertCircle size={16} className="text-amber-600" />
                                                        Setup Incomplete
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                                            <button
                                                onClick={() => handleDisconnectPage(page.page_id, page.page_name)}
                                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-all text-sm font-medium"
                                            >
                                                <Trash2 size={18} />
                                                <span className="sm:hidden">Disconnect</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Page Selector Modal */}
            {showPageSelector && (
                <PageSelector
                    pages={availablePages}
                    onConnect={handleConnectPages}
                    onClose={() => {
                        setShowPageSelector(false);
                        setAvailablePages([]);
                        window.history.replaceState({}, '', '/settings');
                    }}
                />
            )}
        </div>
    );
}

export default function SettingsPage() {
    return (
        <Suspense fallback={
            <div className="max-w-4xl mx-auto p-8 flex items-center justify-center">
                <Loader2 className="animate-spin mr-2" size={24} />
                <span>Loading settings...</span>
            </div>
        }>
            <SettingsContent />
        </Suspense>
    );
}
