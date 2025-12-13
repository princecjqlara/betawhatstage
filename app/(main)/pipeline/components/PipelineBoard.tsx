'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Settings2, RefreshCw, Filter, Search, LayoutTemplate, List, Kanban } from 'lucide-react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import StageColumn from './StageColumn';
import ListView from './ListView';
import LeadDetailsModal from './LeadDetailsModal';

interface Lead {
    id: string;
    sender_id: string;
    name: string | null;
    phone: string | null;
    message_count: number;
    last_message_at: string | null;
    ai_classification_reason: string | null;
    stageId?: string; // Augmented for list view filtering
}

interface Stage {
    id: string;
    name: string;
    display_order: number;
    color: string;
    leads: Lead[];
}

export default function PipelineBoard() {
    const [stages, setStages] = useState<Stage[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddingStage, setIsAddingStage] = useState(false);
    const [newStageName, setNewStageName] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    // Feature States
    const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStageId, setFilterStageId] = useState<string | 'all'>('all');

    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Modal State
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

    const handleLeadClick = (lead: Lead) => {
        setSelectedLead(lead);
    };

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/pipeline/leads');
            const data = await res.json();
            if (data.stages) {
                setStages(data.stages);
            }
        } catch (error) {
            console.error('Error fetching pipeline data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        // Poll for updates every 30 seconds
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const handleAddStage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newStageName.trim()) return;

        try {
            const res = await fetch('/api/pipeline/stages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newStageName }),
            });

            if (res.ok) {
                setNewStageName('');
                setIsAddingStage(false);
                fetchData();
            }
        } catch (error) {
            console.error('Error creating stage:', error);
        }
    };

    const handleMoveLead = async (leadId: string, newStageId: string) => {
        try {
            await fetch('/api/pipeline/leads', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leadId, stageId: newStageId }),
            });
            fetchData();
        } catch (error) {
            console.error('Error moving lead:', error);
        }
    };

    const onDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;

        // Dropped outside a valid droppable
        if (!destination) return;

        // Dropped in the same position
        if (
            destination.droppableId === source.droppableId &&
            destination.index === source.index
        ) {
            return;
        }

        // If moving to a different stage, call the API
        if (destination.droppableId !== source.droppableId) {
            // Optimistic UI update
            setStages((prevStages) => {
                const newStages = prevStages.map(stage => ({
                    ...stage,
                    leads: [...stage.leads]
                }));

                const sourceStage = newStages.find(s => s.id === source.droppableId);
                const destStage = newStages.find(s => s.id === destination.droppableId);

                if (sourceStage && destStage) {
                    const [movedLead] = sourceStage.leads.splice(source.index, 1);
                    destStage.leads.splice(destination.index, 0, movedLead);
                }

                return newStages;
            });

            // Call API to persist the change
            handleMoveLead(draggableId, destination.droppableId);
        }
    };

    // Filter and Search Logic
    const filteredStages = useMemo(() => {
        return stages.map(stage => {
            // If stage filter is active and doesn't match, return empty leads (or hide stage entirely if we wanted)
            if (filterStageId !== 'all' && stage.id !== filterStageId) {
                return { ...stage, leads: [] };
            }

            // Filter leads by search query
            const filteredLeads = stage.leads.filter(lead => {
                const query = searchQuery.toLowerCase();
                const nameMatch = (lead.name || '').toLowerCase().includes(query);
                const idMatch = lead.sender_id.toLowerCase().includes(query);
                const reasonMatch = (lead.ai_classification_reason || '').toLowerCase().includes(query);

                return nameMatch || idMatch || reasonMatch;
            });

            return { ...stage, leads: filteredLeads };
        }).filter(stage => {
            // In List View, we might want to hide empty stages if filtering, but for Board it's better to keep columns
            // For now, keep all stages but with filtered leads
            return true;
        });
    }, [stages, searchQuery, filterStageId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full bg-white">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin"></div>
                    <span className="text-sm text-gray-500 font-medium">Loading pipeline...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header Area */}
            <div className="flex-shrink-0 bg-white border-b border-gray-100 z-10 relative">
                {/* Top Bar: Title & Primary Actions */}
                <div className="h-16 px-8 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Pipeline</h1>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search leads..."
                                className="pl-9 pr-4 py-2 bg-gray-50 border-none text-black rounded-lg text-sm font-medium w-64 focus:ring-2 focus:ring-black/5 outline-none transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="h-6 w-[1px] bg-gray-200 mx-2"></div>

                        {/* Filter Toggle */}
                        <div className="relative">
                            <button
                                onClick={() => setIsFilterOpen(!isFilterOpen)}
                                className={`flex items-center gap-2 px-3 py-2 text-sm font-bold text-gray-700 hover:text-gray-900 bg-white border ${isFilterOpen ? 'border-gray-400 bg-gray-50' : 'border-gray-200'} hover:bg-gray-50 rounded-lg transition-colors shadow-sm`}
                            >
                                <Filter size={16} />
                                Filter
                            </button>

                            {isFilterOpen && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                                    <p className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Filter by Stage</p>
                                    <button
                                        onClick={() => { setFilterStageId('all'); setIsFilterOpen(false); }}
                                        className={`w-full px-3 py-2 text-left text-sm rounded-lg transition-colors ${filterStageId === 'all' ? 'bg-black text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                                    >
                                        All Stages
                                    </button>
                                    {stages.map(stage => (
                                        <button
                                            key={stage.id}
                                            onClick={() => { setFilterStageId(stage.id); setIsFilterOpen(false); }}
                                            className={`w-full px-3 py-2 text-left text-sm rounded-lg transition-colors flex items-center gap-2 ${filterStageId === stage.id ? 'bg-gray-100 text-gray-900 font-bold' : 'text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }}></div>
                                            {stage.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Removed "New Lead" Button as per instruction */}
                    </div>
                </div>

                {/* Sub-Header: Stats & View Controls */}
                <div className="px-8 py-3 flex items-center justify-between bg-gray-50/30">
                    <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-500 font-bold">
                            <span className="text-gray-900">{filteredStages.reduce((acc, s) => acc + s.leads.length, 0)}</span> leads
                        </span>
                    </div>

                    <div className="flex bg-gray-200 p-1 rounded-lg gap-1">
                        <button
                            onClick={() => setViewMode('board')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'board' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Kanban size={14} />
                            Board
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <List size={14} />
                            List
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden bg-gray-50/30 p-8 h-full">
                {viewMode === 'board' ? (
                    <DragDropContext onDragEnd={onDragEnd}>
                        <div className="h-full flex gap-6 min-w-max pb-2">
                            {filteredStages.map((stage) => (
                                <StageColumn
                                    key={stage.id}
                                    stage={stage}
                                    onMoveLead={handleMoveLead}
                                    allStages={stages}
                                    onLeadClick={handleLeadClick}
                                />
                            ))}

                            {/* Add Stage Button (Only in Board View) */}
                            <div className="min-w-[320px] w-[320px]">
                                {isAddingStage ? (
                                    <form onSubmit={handleAddStage} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                                        <h4 className="text-sm font-bold text-gray-900 mb-3">Add New Stage</h4>
                                        <input
                                            autoFocus
                                            type="text"
                                            placeholder="Stage Name e.g. 'Negotiation'"
                                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium mb-3 focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                                            value={newStageName}
                                            onChange={(e) => setNewStageName(e.target.value)}
                                        />
                                        <div className="flex items-center gap-2 justify-end">
                                            <button
                                                type="button"
                                                onClick={() => setIsAddingStage(false)}
                                                className="px-3 py-1.5 text-gray-500 text-xs font-bold hover:text-gray-900 transition-colors hover:bg-gray-50 rounded-md"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                className="px-3 py-1.5 bg-black text-white text-xs font-bold rounded-md hover:bg-gray-800 transition-colors shadow-sm"
                                            >
                                                Create Stage
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <button
                                        onClick={() => setIsAddingStage(true)}
                                        className="w-full h-[50px] flex items-center justify-center gap-2 border border-dashed border-gray-300 hover:border-gray-400 rounded-xl text-gray-500 hover:text-gray-700 transition-all font-bold bg-gray-50/50 hover:bg-gray-100/50"
                                    >
                                        <Plus size={18} />
                                        Add New Pipeline
                                    </button>
                                )}
                            </div>
                        </div>
                    </DragDropContext>
                ) : (
                    <ListView stages={filteredStages} onMoveLead={handleMoveLead} />
                )}
            </div>

            {/* Detailed Lead Modal */}
            <LeadDetailsModal
                isOpen={!!selectedLead}
                onClose={() => setSelectedLead(null)}
                leadId={selectedLead?.id || null}
                initialLeadData={selectedLead}
            />
        </div>
    );
}
