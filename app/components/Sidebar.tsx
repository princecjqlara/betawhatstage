'use client';

import { useState } from 'react';
import {
    LayoutGrid,
    Settings,
    HelpCircle,
    LogOut,
    Kanban,
    Workflow,
    Store,
    ShoppingBag,
    ChevronLeft,
    ChevronRight,
    Calendar
} from 'lucide-react';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabaseClient';

export default function Sidebar() {
    const [isCollapsed, setIsCollapsed] = useState(true);
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    const navItems = [
        { icon: LayoutGrid, href: '/', label: 'Dashboard' },
        { icon: Kanban, href: '/pipeline', label: 'Pipeline' },
        { icon: Store, href: '/store', label: 'Store' },
        { icon: ShoppingBag, href: '/orders', label: 'Orders' },
        { icon: Calendar, href: '/appointments', label: 'Appointments' },
        { icon: Workflow, href: '/workflows', label: 'Workflows' },
        { icon: Settings, href: '/settings', label: 'Settings' },
    ];

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
    };

    return (
        <div
            className={`${isCollapsed ? 'w-16' : 'w-56'} bg-[#0d2116] h-screen flex flex-col py-6 text-gray-400 border-r border-[#1a3828] flex-shrink-0 transition-all duration-300 ease-in-out`}
        >
            {/* Logo and App Name */}
            <div className={`mb-8 flex items-center ${isCollapsed ? 'justify-center' : 'px-4'}`}>
                <Link href="/" className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold cursor-pointer flex-shrink-0">
                        W
                    </div>
                    {!isCollapsed && (
                        <span className="text-white font-semibold text-lg whitespace-nowrap overflow-hidden">
                            WhatStage
                        </span>
                    )}
                </Link>
            </div>

            {/* Navigation */}
            <nav className={`flex-1 flex flex-col gap-2 w-full ${isCollapsed ? 'items-center' : 'px-3'}`}>
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${isActive
                                ? 'text-white bg-white/10'
                                : 'hover:text-white hover:bg-white/10'
                                } ${isCollapsed ? 'justify-center' : ''}`}
                            title={isCollapsed ? item.label : undefined}
                        >
                            <item.icon size={20} className="flex-shrink-0" />
                            {!isCollapsed && (
                                <span className="whitespace-nowrap overflow-hidden">
                                    {item.label}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Actions */}
            <div className={`flex flex-col gap-2 w-full mt-auto ${isCollapsed ? 'items-center' : 'px-3'}`}>
                <button
                    className={`flex items-center gap-3 p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors ${isCollapsed ? 'justify-center' : ''}`}
                    title={isCollapsed ? "Help" : undefined}
                >
                    <HelpCircle size={20} className="flex-shrink-0" />
                    {!isCollapsed && <span className="whitespace-nowrap">Help</span>}
                </button>
                <button
                    onClick={handleLogout}
                    className={`flex items-center gap-3 p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors ${isCollapsed ? 'justify-center' : ''}`}
                    title={isCollapsed ? "Logout" : undefined}
                >
                    <LogOut size={20} className="flex-shrink-0" />
                    {!isCollapsed && <span className="whitespace-nowrap">Logout</span>}
                </button>

                {/* Toggle Button */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="flex items-center justify-center p-2 mt-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors border border-[#1a3828]"
                    title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                </button>
            </div>
        </div>
    );
}

