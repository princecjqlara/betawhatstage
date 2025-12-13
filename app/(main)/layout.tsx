import type { Metadata } from "next";
import Sidebar from "../components/Sidebar";
import ClientLayoutWrapper from "../components/ClientLayoutWrapper";

export const metadata: Metadata = {
    title: "WhatStage? AI Chat & Pipeline",
    description: "AI Chat & Pipeline",
};

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <div className="flex h-screen overflow-hidden bg-gray-50">
            <Sidebar />
            <div className="flex-1 flex flex-col h-screen overflow-hidden">
                <ClientLayoutWrapper>
                    {children}
                </ClientLayoutWrapper>
            </div>
        </div>
    );
}

