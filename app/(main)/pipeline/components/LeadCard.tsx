'use client';

import { useState } from 'react';
import { MessageCircle, Clock, MoreHorizontal, Phone, Mail, Globe, GripVertical } from 'lucide-react';
import { Draggable } from '@hello-pangea/dnd';

interface Lead {
    id: string;
    sender_id: string;
    name: string | null;
    phone: string | null;
    message_count: number;
    last_message_at: string | null;
    ai_classification_reason: string | null;
}

interface LeadCardProps {
    lead: Lead;
    index: number;
    onMoveClick: (leadId: string) => void;
    moveMenuOpen: boolean;
    onClick?: (lead: Lead) => void;
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
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
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

export default function LeadCard({ lead, index, onMoveClick, moveMenuOpen, onClick }: LeadCardProps) {
    // Extract potential tags from AI classification or use defaults
    const getTags = () => {
        const tags = [];
        // Add a mock "Source" tag if we don't have real sources yet
        tags.push({ label: 'Facebook', color: 'bg-blue-100 text-blue-700' });

        if (lead.message_count > 5) {
            tags.push({ label: 'High Intent', color: 'bg-orange-100 text-orange-700' });
        } else if (lead.message_count > 2) {
            tags.push({ label: 'Active', color: 'bg-green-100 text-green-700' });
        }

        return tags;
    };

    return (
        <Draggable draggableId={lead.id} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    onClick={() => onClick?.(lead)}
                    className={`bg-white rounded-xl p-4 transition-all group relative border cursor-pointer ${snapshot.isDragging
                        ? 'shadow-xl border-blue-400 rotate-2 z-50'
                        : 'border-gray-100 hover:border-gray-200 shadow-sm hover:shadow-md'
                        }`}
                >
                    {/* Header Row: Initials/Avatar + Name + Actions */}
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                            {/* Drag Handle (visible on hover) */}
                            <div
                                {...provided.dragHandleProps}
                                className="opacity-0 group-hover:opacity-100 absolute left-2 top-1/2 -translate-y-1/2 -ml-2 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing p-1"
                            >
                                <GripVertical size={14} />
                            </div>

                            <div
                                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm ring-2 ring-white"
                                style={{ backgroundColor: stringToColor(lead.sender_id) }}
                            >
                                {(lead.name || lead.sender_id)?.[0]?.toUpperCase() || '?'}
                            </div>

                            <div>
                                <h4 className="text-sm font-bold text-gray-900 leading-tight">
                                    {lead.name || `User ${lead.sender_id.slice(-4)}`}
                                </h4>
                                {lead.phone ? (
                                    <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                                        <Phone size={10} />
                                        {lead.phone}
                                    </div>
                                ) : (
                                    <span className="text-xs text-gray-400 font-medium">
                                        ID: {lead.sender_id.slice(0, 8)}
                                    </span>
                                )}
                            </div>
                        </div>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onMoveClick(lead.id);
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${moveMenuOpen
                                ? 'bg-gray-100 text-gray-900'
                                : 'text-gray-400 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <MoreHorizontal size={16} />
                        </button>
                    </div>

                    {/* Tags Row */}
                    <div className="flex flex-wrap gap-2 mb-3">
                        {getTags().map((tag, i) => (
                            <span
                                key={i}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${tag.color}`}
                            >
                                {tag.label}
                            </span>
                        ))}
                    </div>

                    {/* AI Insight / Description */}
                    {lead.ai_classification_reason && (
                        <div className="mb-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                            <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                                {lead.ai_classification_reason}
                            </p>
                        </div>
                    )}

                    {/* Footer: Date, Messages, Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                        <div className="flex items-center gap-3 text-gray-400">
                            <div className="flex items-center gap-1.5 text-xs font-medium" title="Last message">
                                <Clock size={12} />
                                {formatTimeAgo(lead.last_message_at)}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-medium" title="Message count">
                                <MessageCircle size={12} />
                                {lead.message_count}
                            </div>
                        </div>

                        {/* Quick Actions (Visual Only for now) */}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                                <MessageCircle size={14} />
                            </button>
                            <button className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors">
                                <Phone size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Draggable>
    );
}
