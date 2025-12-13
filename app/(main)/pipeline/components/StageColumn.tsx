'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import LeadCard from './LeadCard';

interface Lead {
    id: string;
    sender_id: string;
    name: string | null;
    phone: string | null;
    message_count: number;
    last_message_at: string | null;
    ai_classification_reason: string | null;
}

interface Stage {
    id: string;
    name: string;
    display_order: number;
    color: string;
    leads: Lead[];
}

interface StageColumnProps {
    stage: Stage;
    onMoveLead: (leadId: string, stageId: string) => void;
    allStages: Stage[];
    onLeadClick?: (lead: Lead) => void;
}

export default function StageColumn({ stage, onMoveLead, allStages, onLeadClick }: StageColumnProps) {
    const [moveMenuOpen, setMoveMenuOpen] = useState<string | null>(null);

    return (
        <div className="w-[320px] max-w-[320px] flex-shrink-0 flex flex-col h-full bg-gray-50/50 rounded-xl group border border-transparent hover:border-gray-200 transition-colors">
            {/* Stage Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white rounded-t-xl">
                <div className="flex items-center gap-3">
                    <div
                        className="w-3 h-3 rounded-full ring-2 ring-offset-2 ring-transparent group-hover:ring-gray-100 transition-all"
                        style={{ backgroundColor: stage.color }}
                    ></div>
                    <h3 className="font-bold text-gray-900 tracking-tight text-base">{stage.name}</h3>
                    <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200">
                        {stage.leads.length}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button className="p-1.5 text-gray-400 hover:text-gray-900 opacity-0 group-hover:opacity-100 transition-opacity rounded-md hover:bg-gray-100">
                        <MoreHorizontal size={16} />
                    </button>
                    {/* Placeholder for "Add" button if we want one per column */}
                </div>
            </div>

            {/* Leads - Droppable Area */}
            <Droppable droppableId={stage.id}>
                {(provided, snapshot) => (
                    <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 overflow-y-auto p-3 space-y-3 transition-colors ${snapshot.isDraggingOver ? 'bg-blue-50/50' : ''
                            }`}
                    >
                        {stage.leads.length === 0 && !snapshot.isDraggingOver ? (
                            <div className="h-32 border-2 border-dashed border-gray-100 rounded-xl flex flex-col items-center justify-center text-center p-4 gap-2 group/empty">
                                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 group-hover/empty:bg-gray-100 group-hover/empty:text-gray-400 transition-colors">
                                    <MoreHorizontal size={20} />
                                </div>
                                <span className="text-sm font-medium text-gray-400">No leads in this stage</span>
                            </div>
                        ) : (
                            stage.leads.map((lead, index) => (
                                <div key={lead.id} className="relative">
                                    <LeadCard
                                        lead={lead}
                                        index={index}
                                        onMoveClick={(id) => setMoveMenuOpen(moveMenuOpen === id ? null : id)}
                                        moveMenuOpen={moveMenuOpen === lead.id}
                                        onClick={onLeadClick}
                                    />

                                    {/* Context Menu for Moving - Positioned relative to the card wrapper */}
                                    {moveMenuOpen === lead.id && (
                                        <>
                                            {/* Backdrop to close menu */}
                                            <div
                                                className="fixed inset-0 z-40"
                                                onClick={() => setMoveMenuOpen(null)}
                                            ></div>

                                            <div className="absolute right-2 top-10 mt-1 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                                                <div className="px-3 py-2 border-b border-gray-50">
                                                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Move to Stage</p>
                                                </div>
                                                <div className="p-1 max-h-[200px] overflow-y-auto">
                                                    {allStages
                                                        .filter(s => s.id !== stage.id)
                                                        .map(s => (
                                                            <button
                                                                key={s.id}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onMoveLead(lead.id, s.id);
                                                                    setMoveMenuOpen(null);
                                                                }}
                                                                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 rounded-lg flex items-center gap-2 transition-colors"
                                                            >
                                                                <div
                                                                    className="w-2 h-2 rounded-full ring-2 ring-gray-100"
                                                                    style={{ backgroundColor: s.color }}
                                                                ></div>
                                                                <span className="font-medium truncate">{s.name}</span>
                                                            </button>
                                                        ))
                                                    }
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))
                        )}
                        {provided.placeholder}
                    </div>
                )}
            </Droppable>
        </div>
    );
}

