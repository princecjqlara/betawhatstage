'use client';

import { MessageCircle, Clock, MoreHorizontal, Phone } from 'lucide-react';

interface Lead {
    id: string;
    sender_id: string;
    name: string | null;
    phone: string | null;
    message_count: number;
    last_message_at: string | null;
    ai_classification_reason: string | null;
    profile_pic: string | null;
}

interface Stage {
    id: string;
    name: string;
    display_order: number;
    color: string;
    leads: Lead[];
}

interface ListViewProps {
    stages: Stage[];
    onMoveLead: (leadId: string, stageId: string) => void;
}

function formatTimeAgo(dateString: string | null): string {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}

// Generate a consistent random color from a string
function stringToColor(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}

export default function ListView({ stages, onMoveLead }: ListViewProps) {
    // Flatten leads to display in a single list, adding stage info to each lead
    const allLeads = stages.flatMap(stage =>
        stage.leads.map(lead => ({
            ...lead,
            stageId: stage.id,
            stageName: stage.name,
            stageColor: stage.color
        }))
    );

    return (
        <div className="w-full bg-white rounded-lg border border-gray-100 overflow-hidden">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="px-6 py-4">Lead</th>
                        <th className="px-6 py-4">Phone</th>
                        <th className="px-6 py-4">Stage</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Last Active</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {allLeads.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">
                                No leads found matching your criteria.
                            </td>
                        </tr>
                    ) : (
                        allLeads.map((lead) => (
                            <tr key={lead.id} className="hover:bg-gray-50/50 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        {lead.profile_pic ? (
                                            <img
                                                src={lead.profile_pic}
                                                alt={lead.name || 'User'}
                                                className="w-8 h-8 rounded-full object-cover shadow-sm"
                                            />
                                        ) : (
                                            <div
                                                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                                                style={{ backgroundColor: stringToColor(lead.sender_id) }}
                                            >
                                                {(lead.name || lead.sender_id)?.[0]?.toUpperCase() || '?'}
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">
                                                {lead.name || `User ${lead.sender_id.slice(-4)}`}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                ID: {lead.sender_id.slice(0, 8)}
                                            </p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    {lead.phone ? (
                                        <div className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                                            <Phone size={14} />
                                            {lead.phone}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <select
                                        className="bg-gray-100 text-gray-700 text-xs font-medium px-2 py-1 rounded border-none focus:ring-2 focus:ring-black/5 cursor-pointer outline-none"
                                        value={lead.stageId}
                                        onChange={(e) => onMoveLead(lead.id, e.target.value)}
                                        style={{ borderLeft: `3px solid ${lead.stageColor}` }}
                                    >
                                        {stages.map(s => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                                <td className="px-6 py-4">
                                    {/* Mock Tags/Status from AI Reason or Message Count */}
                                    <div className="flex flex-wrap gap-2">
                                        {lead.message_count > 5 ? (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-100">
                                                High Intent
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <Clock size={12} />
                                        <span>{formatTimeAgo(lead.last_message_at)}</span>
                                        <span className="text-gray-300">|</span>
                                        <MessageCircle size={12} />
                                        <span>{lead.message_count} msgs</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-white rounded-lg transition-all opacity-0 group-hover:opacity-100">
                                        <MoreHorizontal size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
