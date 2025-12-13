'use client';

import WorkflowCanvas from './components/WorkflowCanvas';
import { Play, Edit2, Beaker, Wand2, Save } from 'lucide-react';
import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Node, Edge } from '@xyflow/react';

type WorkflowData = {
    nodes: Node[];
    edges: Edge[];
};

function AutomationPageContent() {
    const searchParams = useSearchParams();
    const workflowIdFromUrl = searchParams.get('id');

    const [workflowId, setWorkflowId] = useState<string | null>(null);
    const [workflowName, setWorkflowName] = useState('Follow-up Sequence');
    const [isPublished, setIsPublished] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [initialWorkflowData, setInitialWorkflowData] = useState<WorkflowData | null>(null);
    const [loading, setLoading] = useState(true);
    const [showTestModal, setShowTestModal] = useState(false);
    const [testLeads, setTestLeads] = useState<Array<{ id: string; sender_id: string; name: string | null }>>([]);
    const [selectedTestLead, setSelectedTestLead] = useState('');
    const [testingWorkflow, setTestingWorkflow] = useState(false);

    // AI Generation state
    const [showAiModal, setShowAiModal] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [generating, setGenerating] = useState(false);
    const [generateError, setGenerateError] = useState('');

    // Track current workflow data from canvas
    const currentWorkflowDataRef = useRef<WorkflowData | null>(null);

    // Publish confirmation modal state
    const [showPublishConfirmModal, setShowPublishConfirmModal] = useState(false);
    const [existingLeadsCount, setExistingLeadsCount] = useState(0);
    const [isPublishing, setIsPublishing] = useState(false);

    useEffect(() => {
        // Fetch leads for test dropdown
        fetch('/api/pipeline/leads')
            .then(res => res.json())
            .then(data => {
                // API returns { stages: [...] } where each stage has leads array
                if (data.stages && Array.isArray(data.stages)) {
                    const allLeads: Array<{ id: string; sender_id: string; name: string | null }> = [];
                    data.stages.forEach((stage: { leads: Array<{ id: string; sender_id: string; name: string | null }> }) => {
                        if (stage.leads) {
                            allLeads.push(...stage.leads);
                        }
                    });
                    setTestLeads(allLeads);
                }
            })
            .catch(err => console.error('Error fetching leads:', err));
    }, []);

    useEffect(() => {
        if (workflowIdFromUrl) {
            // Load existing workflow
            fetch(`/api/workflows/${workflowIdFromUrl}`)
                .then(res => res.json())
                .then(data => {
                    setWorkflowId(data.id);
                    setWorkflowName(data.name);
                    setIsPublished(data.is_published);
                    setInitialWorkflowData(data.workflow_data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error('Error loading workflow:', err);
                    setLoading(false);
                });
        } else {
            setLoading(false);
        }
    }, [workflowIdFromUrl]);

    // Save state management
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    // Called whenever workflow data changes (from canvas auto-save)
    const handleWorkflowChange = (workflowData: WorkflowData) => {
        currentWorkflowDataRef.current = workflowData;
        // Reset saved status if user makes changes
        if (saveStatus === 'saved') {
            setSaveStatus('idle');
        }
    };

    // Explicit save button handler
    const handleSaveClick = async () => {
        if (!currentWorkflowDataRef.current) {
            alert('No workflow data to save. Please add some nodes first.');
            return;
        }
        await handleSave(currentWorkflowDataRef.current);
    };

    const handleSave = async (workflowData: WorkflowData) => {
        setSaveStatus('saving');
        setIsSaving(true);
        try {
            // Extract trigger data from trigger node
            const triggerNode = workflowData.nodes.find((n) => n.data.type === 'trigger');
            const triggerData = triggerNode?.data as { triggerStageId?: string; triggerType?: string } | undefined;
            const trigger_stage_id = triggerData?.triggerStageId || null;
            const trigger_type = triggerData?.triggerType || 'stage_change';

            if (workflowId) {
                // Update existing
                const res = await fetch('/api/workflows', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: workflowId,
                        name: workflowName,
                        workflow_data: workflowData,
                        trigger_stage_id,
                        trigger_type
                    }),
                });
                if (!res.ok) {
                    throw new Error('Failed to update workflow');
                }
            } else {
                // Create new
                const res = await fetch('/api/workflows', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: workflowName,
                        workflow_data: workflowData,
                        trigger_stage_id,
                        trigger_type
                    }),
                });
                if (!res.ok) {
                    throw new Error('Failed to create workflow');
                }
                const data = await res.json();
                setWorkflowId(data.id);
            }

            // Show saved status
            setSaveStatus('saved');

            // Reset back to idle after 2 seconds
            setTimeout(() => {
                setSaveStatus(prev => prev === 'saved' ? 'idle' : prev);
            }, 2000);

        } catch (error) {
            console.error('Error saving workflow:', error);
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } finally {
            setIsSaving(false);
        }
    };

    const handlePublish = async () => {
        if (!workflowId) {
            alert('Please save the workflow first');
            return;
        }

        // Check if we're unpublishing
        if (isPublished) {
            // Just unpublish without confirmation
            await doPublish(false, false);
            return;
        }

        // Check if trigger node has applyToExisting enabled
        const triggerNode = currentWorkflowDataRef.current?.nodes?.find((n) => n.data.type === 'trigger');
        const triggerData = triggerNode?.data as { applyToExisting?: boolean; triggerStageId?: string } | undefined;
        const applyToExisting = triggerData?.applyToExisting || false;
        const triggerStageId = triggerData?.triggerStageId;

        if (applyToExisting && triggerStageId) {
            // Fetch count of existing leads in the trigger stage
            try {
                const res = await fetch('/api/pipeline/leads');
                const data = await res.json();
                // Find the stage and count its leads
                const stage = (data.stages as Array<{ id: string; leads?: unknown[] }>)?.find((s) => s.id === triggerStageId);
                const count = stage?.leads?.length || 0;
                setExistingLeadsCount(count);
                setShowPublishConfirmModal(true);
            } catch (error) {
                console.error('Error fetching leads count:', error);
                // Proceed without showing count
                setExistingLeadsCount(0);
                setShowPublishConfirmModal(true);
            }
        } else {
            // No apply_to_existing, just publish normally
            await doPublish(true, false);
        }
    };

    const doPublish = async (publish: boolean, applyToExisting: boolean) => {
        setIsPublishing(true);
        try {
            const res = await fetch(`/api/workflows/${workflowId}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    is_published: publish,
                    apply_to_existing: applyToExisting
                }),
            });
            if (!res.ok) {
                throw new Error('Failed to publish workflow');
            }
            setIsPublished(publish);
            setShowPublishConfirmModal(false);
        } catch (error) {
            console.error('Error publishing workflow:', error);
        } finally {
            setIsPublishing(false);
        }
    };

    const handleTestRun = async () => {
        if (!workflowId) {
            alert('Please save the workflow first');
            return;
        }
        setShowTestModal(true);
    };

    const executeTest = async () => {
        if (!selectedTestLead) {
            alert('Please select a lead');
            return;
        }

        const lead = testLeads.find(l => l.id === selectedTestLead);
        if (!lead) return;

        setTestingWorkflow(true);
        try {
            const res = await fetch('/api/workflows/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workflowId,
                    leadId: lead.id,
                    senderId: lead.sender_id
                }),
            });

            const data = await res.json();

            if (res.ok) {
                alert('✅ Workflow execution started! Check the server logs for details.');
                setShowTestModal(false);
            } else {
                alert(`❌ Error: ${data.error}`);
            }
        } catch (error) {
            console.error('Error testing workflow:', error);
            alert('Failed to test workflow');
        } finally {
            setTestingWorkflow(false);
        }
    };

    const handleGenerateWorkflow = async () => {
        if (!aiPrompt.trim()) {
            setGenerateError('Please enter a prompt describing your workflow');
            return;
        }

        setGenerating(true);
        setGenerateError('');

        try {
            const res = await fetch('/api/workflows/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: aiPrompt }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to generate workflow');
            }

            // Set the generated workflow data
            setWorkflowName(data.name);
            setInitialWorkflowData({ nodes: data.nodes, edges: data.edges });
            setWorkflowId(null); // Reset workflow ID for new workflow
            setIsPublished(false);
            setShowAiModal(false);
            setAiPrompt('');

        } catch (error) {
            console.error('Error generating workflow:', error);
            setGenerateError(error instanceof Error ? error.message : 'Failed to generate workflow');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    {isEditingName ? (
                        <input
                            type="text"
                            value={workflowName}
                            onChange={(e) => setWorkflowName(e.target.value)}
                            onBlur={() => setIsEditingName(false)}
                            onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                            className="text-xl font-bold text-gray-900 border-b-2 border-blue-500 focus:outline-none bg-transparent"
                            autoFocus
                        />
                    ) : (
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-gray-900">{workflowName}</h1>
                            <button onClick={() => setIsEditingName(true)} className="p-1 text-gray-400 hover:text-gray-600">
                                <Edit2 size={14} />
                            </button>
                        </div>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${isPublished ? 'bg-green-50 text-green-600 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {isPublished ? 'Published' : 'Draft'}
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowAiModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors border border-purple-200 bg-purple-50 text-purple-600 hover:bg-purple-100"
                    >
                        <Wand2 size={16} />
                        Generate with AI
                    </button>
                    <button
                        onClick={() => handleTestRun()}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                    >
                        <Beaker size={16} />
                        Test Run
                    </button>
                    <button
                        onClick={handleSaveClick}
                        disabled={saveStatus === 'saving'}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm text-white disabled:opacity-50 ${saveStatus === 'saved'
                            ? 'bg-green-700 hover:bg-green-800'
                            : saveStatus === 'error'
                                ? 'bg-red-600 hover:bg-red-700'
                                : 'bg-green-600 hover:bg-green-700'
                            }`}
                    >
                        <Save size={16} />
                        {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error!' : 'Save'}
                    </button>
                    <button
                        onClick={() => handlePublish()}
                        disabled={!workflowId}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm ${isPublished
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                            } ${!workflowId ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <Play size={16} />
                        {isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                </div>
            </header>

            {/* Main Canvas Area */}
            <main className="flex-1 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        Loading workflow...
                    </div>
                ) : (
                    <WorkflowCanvas
                        onSave={handleWorkflowChange}
                        isSaving={isSaving}
                        initialData={initialWorkflowData}
                    />
                )}
            </main>

            {/* Test Run Modal */}
            {showTestModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">Test Workflow</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            Select a lead to test this workflow with. The workflow will execute immediately.
                        </p>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Select Lead
                            </label>
                            <select
                                value={selectedTestLead}
                                onChange={(e) => setSelectedTestLead(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                            >
                                <option value="">Choose a lead...</option>
                                {testLeads.map((lead) => (
                                    <option key={lead.id} value={lead.id}>
                                        {lead.name || 'Unknown'} ({lead.sender_id.slice(0, 8)}...)
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowTestModal(false)}
                                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeTest}
                                disabled={testingWorkflow || !selectedTestLead}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {testingWorkflow ? 'Running...' : 'Run Test'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Generate Modal */}
            {showAiModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                                <Wand2 size={20} className="text-purple-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Generate with AI</h2>
                                <p className="text-sm text-gray-500">Describe your workflow and let AI create it</p>
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Describe your workflow
                            </label>
                            <textarea
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                placeholder="E.g., Create a follow-up sequence for New Lead Stage. Add 2 messages with waits, and a condition to check if they replied..."
                                rows={5}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                ⏱️ Generation typically takes 30-60 seconds
                            </p>
                        </div>

                        <div className="mb-4">
                            <p className="text-xs text-gray-400 mb-2">Example prompts:</p>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setAiPrompt('Create a simple follow-up sequence with 2 messages for new leads. Wait 1 hour between messages.')}
                                    className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
                                >
                                    Simple follow-up
                                </button>
                                <button
                                    onClick={() => setAiPrompt('Create an advanced follow-up sequence for new leads. Include a condition to check if they replied, with different paths for each outcome.')}
                                    className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
                                >
                                    With conditions
                                </button>
                                <button
                                    onClick={() => setAiPrompt('Create a re-engagement sequence for cold leads. Send 3 friendly messages over 3 days, then stop the bot if no response.')}
                                    className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
                                >
                                    Re-engagement
                                </button>
                                <button
                                    onClick={() => setAiPrompt('Create appointment reminders. Send a reminder 1 day before, 1 hour before, and 10 minutes before the appointment.')}
                                    className="text-xs px-2 py-1 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition-colors"
                                >
                                    📅 Appointment reminders
                                </button>
                            </div>
                        </div>

                        {generateError && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                                {generateError}
                            </div>
                        )}

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowAiModal(false);
                                    setAiPrompt('');
                                    setGenerateError('');
                                }}
                                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleGenerateWorkflow}
                                disabled={generating || !aiPrompt.trim()}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {generating ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Wand2 size={16} />
                                        Generate Workflow
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Publish Confirmation Modal */}
            {showPublishConfirmModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                                <Play size={20} className="text-amber-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Confirm Publish</h2>
                                <p className="text-sm text-gray-500">Apply to existing leads is enabled</p>
                            </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                            <p className="text-sm text-amber-800">
                                <strong>Warning:</strong> This workflow will immediately run for{' '}
                                <span className="font-bold">{existingLeadsCount}</span>{' '}
                                existing lead{existingLeadsCount !== 1 ? 's' : ''} currently in the trigger stage.
                            </p>
                            <p className="text-xs text-amber-600 mt-2">
                                Messages may be sent to these leads right away.
                            </p>
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowPublishConfirmModal(false)}
                                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => doPublish(true, false)}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium text-sm"
                            >
                                Publish (Incoming Only)
                            </button>
                            <button
                                onClick={() => doPublish(true, true)}
                                disabled={isPublishing}
                                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium text-sm disabled:opacity-50"
                            >
                                {isPublishing ? 'Publishing...' : 'Publish & Apply Now'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AutomationPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-500">Loading...</div>}>
            <AutomationPageContent />
        </Suspense>
    );
}
