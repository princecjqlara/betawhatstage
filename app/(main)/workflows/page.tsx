'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Plus, Search, Filter, MoreHorizontal, Edit, Trash2, ArrowRight, Loader2 } from 'lucide-react';

interface Workflow {
    id: string;
    name: string;
    is_published: boolean;
    created_at: string;
    trigger_stage_id: string | null;
}

export default function WorkflowsPage() {
    const router = useRouter();
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
    const [newWorkflowName, setNewWorkflowName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        fetchWorkflows();
    }, []);

    const fetchWorkflows = async () => {
        try {
            const res = await fetch('/api/workflows');
            const data = await res.json();
            setWorkflows(data);
        } catch (error) {
            console.error('Error fetching workflows:', error);
        } finally {
            setLoading(false);
        }
    };

    const deleteWorkflow = async (id: string) => {
        if (!confirm('Are you sure you want to delete this workflow?')) return;

        try {
            await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
            setWorkflows(workflows.filter(w => w.id !== id));
        } catch (error) {
            console.error('Error deleting workflow:', error);
        }
    };

    const createWorkflow = async () => {
        const prompt = newWorkflowName.trim();
        // if (!prompt) return; // Allow empty prompts for "create from scratch"

        setIsCreating(true);
        try {
            // Default trigger node for all new workflows
            const defaultTriggerNode = {
                id: '1',
                type: 'custom',
                position: { x: 100, y: 100 },
                data: { label: 'Pipeline Stage Changed', description: 'Trigger when lead enters this stage', type: 'trigger' },
            };

            const res = await fetch('/api/workflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt, // Send as prompt for AI generation (empty string if scratching)
                    name: prompt || 'New Workflow', // Fallback name if prompt is empty
                    workflow_data: { nodes: [defaultTriggerNode], edges: [] }
                }),
            });
            const data = await res.json();
            if (data.id) {
                router.push(`/automation?id=${data.id}`);
            } else {
                console.error('Failed to create workflow:', data);
                setIsCreating(false);
            }
        } catch (error) {
            console.error('Error creating workflow:', error);
            setIsCreating(false);
        }
    };

    const filteredWorkflows = workflows.filter(workflow => {
        const matchesSearch = workflow.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter =
            filter === 'all'
                ? true
                : filter === 'published'
                    ? workflow.is_published
                    : !workflow.is_published;
        return matchesSearch && matchesFilter;
    });

    const getStatusColor = (isPublished: boolean) => {
        return isPublished
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700';
    };

    return (
        <div className="flex flex-col h-full bg-[#FAFAFA] text-gray-900 font-sans">
            {/* Top Navigation Bar Placeholder (if global nav isn't handling this visual space) */}
            <div className="h-16 px-8 flex items-center justify-between bg-white border-b border-gray-100/50 sticky top-0 z-10">
                <div className="flex items-center gap-4 text-gray-400">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search..."
                        className="bg-transparent border-none outline-none text-sm w-64 text-gray-700 placeholder-gray-400"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <main className="flex-1 overflow-auto p-8 max-w-7xl mx-auto w-full">
                {/* Welcome Section */}
                <section className="mb-12">
                    <h1 className="text-3xl font-semibold mb-2">Welcome Back 👋</h1>
                    <h2 className="text-3xl font-bold mb-8">What do you want to automate?</h2>

                    <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-200 flex items-center gap-2 max-w-2xl">
                        <input
                            type="text"
                            placeholder="Describe a new workflow..."
                            className="flex-1 px-4 py-3 bg-transparent outline-none text-gray-700"
                            value={newWorkflowName}
                            onChange={(e) => setNewWorkflowName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isCreating) {
                                    createWorkflow();
                                }
                            }}
                        />
                        <button
                            onClick={createWorkflow}
                            disabled={isCreating}
                            className="bg-teal-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-teal-700 transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isCreating ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    Create
                                    <Plus size={16} />
                                </>
                            )}
                        </button>
                    </div>
                </section>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
                    {(['all', 'published', 'draft'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setFilter(tab)}
                            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${filter === tab
                                ? 'border-green-600 text-green-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                    <div className="ml-auto flex items-center gap-2 text-sm text-gray-500">
                        <span>Last Modified</span>
                        <Filter size={14} />
                    </div>
                </div>

                {/* Workflow Filters/Grid */}
                {loading ? (
                    <div className="flex items-center justify-center p-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    </div>
                ) : filteredWorkflows.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
                        <p className="text-gray-500 mb-4">No workflows found matching your criteria.</p>
                        <Link
                            href="/automation"
                            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                        >
                            Create a new workflow <ArrowRight size={16} />
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredWorkflows.map((workflow) => (
                            <div
                                key={workflow.id}
                                className="group bg-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col items-start min-h-[200px]"
                            >
                                <div className="w-full flex items-start justify-between mb-4">
                                    <div className={`p-2 rounded-lg ${getStatusColor(workflow.is_published)}`}>
                                        <div className={`w-2 h-2 rounded-full ${workflow.is_published ? 'bg-green-600' : 'bg-red-600'}`} />
                                    </div>
                                    <div className="relative">
                                        <button className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-50 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <MoreHorizontal size={20} />
                                        </button>
                                        {/* Simple dropdown for actions could go here, for now putting direct actions below */}
                                    </div>
                                </div>

                                <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2">
                                    {workflow.name}
                                </h3>

                                <p className="text-sm text-gray-500 mb-auto line-clamp-3">
                                    {workflow.trigger_stage_id
                                        ? 'Triggered based on pipeline stage changes.'
                                        : 'Manual trigger or custom implementation.'}
                                </p>

                                <div className="w-full pt-4 mt-4 border-t border-gray-50 flex items-center justify-between text-xs font-medium text-gray-400">
                                    <span>
                                        {workflow.is_published ? 'Published' : 'Draft'}
                                    </span>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Link
                                            href={`/automation?id=${workflow.id}`}
                                            className="p-2 hover:bg-gray-100 rounded text-gray-600"
                                            title="Edit"
                                        >
                                            <Edit size={16} />
                                        </Link>
                                        <button
                                            onClick={() => deleteWorkflow(workflow.id)}
                                            className="p-2 hover:bg-red-50 rounded text-red-500"
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
