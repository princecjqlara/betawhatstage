'use client';

import { useState, useEffect } from 'react';
import { Save, Bot, Plus, Trash2, ToggleLeft, ToggleRight, Clock, MessageSquare } from 'lucide-react';

interface Rule {
    id: string;
    rule: string;
    category: string;
    priority: number;
    enabled: boolean;
}

export default function RulesEditor() {
    const [botName, setBotName] = useState('');
    const [botTone, setBotTone] = useState('');
    const [aiModel, setAiModel] = useState('qwen/qwen3-235b-a22b');
    const [humanTakeoverTimeout, setHumanTakeoverTimeout] = useState(5);
    const [splitMessages, setSplitMessages] = useState(false);
    const [instructions, setInstructions] = useState('');
    const [rules, setRules] = useState<Rule[]>([]);
    const [newRule, setNewRule] = useState('');
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        fetchSettings();
        fetchRules();
        fetchInstructions();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.botName) setBotName(data.botName);
            if (data.botTone) setBotTone(data.botTone);
            if (data.aiModel) setAiModel(data.aiModel);
            if (data.humanTakeoverTimeoutMinutes !== undefined) {
                setHumanTakeoverTimeout(data.humanTakeoverTimeoutMinutes);
            }
            if (data.splitMessages !== undefined) {
                setSplitMessages(data.splitMessages);
            }
        } catch (error) {
            console.error('Failed to fetch settings:', error);
        }
    };

    const fetchRules = async () => {
        try {
            const res = await fetch('/api/rules');
            const data = await res.json();
            setRules(data.rules || []);
        } catch (error) {
            console.error('Failed to fetch rules:', error);
        }
    };

    const fetchInstructions = async () => {
        try {
            const res = await fetch('/api/instructions');
            const data = await res.json();
            setInstructions(data.instructions || '');
        } catch (error) {
            console.error('Failed to fetch instructions:', error);
        }
    };

    const handleSaveSettings = async () => {
        setLoading(true);
        try {
            await Promise.all([
                fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ botName, botTone, aiModel, humanTakeoverTimeoutMinutes: humanTakeoverTimeout, splitMessages }),
                }),
                fetch('/api/instructions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instructions }),
                }),
            ]);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (error) {
            console.error('Failed to save:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddRule = async () => {
        if (!newRule.trim()) return;
        try {
            const res = await fetch('/api/rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rule: newRule, priority: rules.length }),
            });
            const data = await res.json();
            if (data.success) {
                setRules([...rules, data.rule]);
                setNewRule('');
            }
        } catch (error) {
            console.error('Failed to add rule:', error);
        }
    };

    const handleDeleteRule = async (id: string) => {
        try {
            await fetch(`/api/rules?id=${id}`, { method: 'DELETE' });
            setRules(rules.filter(r => r.id !== id));
        } catch (error) {
            console.error('Failed to delete rule:', error);
        }
    };

    const handleToggleRule = async (id: string, enabled: boolean) => {
        try {
            await fetch('/api/rules', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, enabled: !enabled }),
            });
            setRules(rules.map(r => r.id === id ? { ...r, enabled: !enabled } : r));
        } catch (error) {
            console.error('Failed to toggle rule:', error);
        }
    };

    return (
        <div className="flex-1 bg-white flex flex-col h-full overflow-hidden font-sans">
            {/* Header */}
            <div className="h-16 border-b border-gray-100 flex items-center justify-between px-8 bg-white flex-shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
                        <Bot size={20} />
                    </div>
                    <span className="text-lg font-medium text-gray-900 tracking-tight">Bot Configuration</span>
                </div>
                <button
                    onClick={handleSaveSettings}
                    disabled={loading}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium transition-all active:scale-95 shadow-sm ${saved
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-900 text-white hover:bg-black'
                        }`}
                >
                    <Save size={18} />
                    {saved ? 'Saved Successfully' : loading ? 'Saving...' : 'Save Changes'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-white p-6 md:p-8 flex justify-center">
                <div className="w-full max-w-4xl space-y-8 pb-12">

                    {/* Bot Identity Card */}
                    <div className="bg-white rounded-[24px] p-8 border border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                        <h3 className="text-xl font-normal text-gray-900 mb-6 flex items-center gap-2">
                            Bot Identity
                        </h3>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700 ml-1">Bot Name</label>
                                <input
                                    type="text"
                                    value={botName}
                                    onChange={(e) => setBotName(e.target.value)}
                                    placeholder="e.g., WebNegosyo Assistant"
                                    className="w-full px-4 py-3 bg-gray-50 border-gray-100 border focus:bg-white rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all placeholder:text-gray-400"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700 ml-1">Tone & Personality</label>
                                <input
                                    type="text"
                                    value={botName}
                                    onChange={(e) => setBotTone(e.target.value)}
                                    placeholder="e.g., Friendly, professional"
                                    className="w-full px-4 py-3 bg-gray-50 border-gray-100 border focus:bg-white rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all placeholder:text-gray-400"
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 ml-1">AI Model</label>
                                <select
                                    value={aiModel}
                                    onChange={(e) => setAiModel(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border-gray-100 border focus:bg-white rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all appearance-none"
                                >
                                    <option value="qwen/qwen3-235b-a22b">Qwen (Current) - qwen/qwen3-235b-a22b</option>
                                    <option value="deepseek-ai/deepseek-v3.1">DeepSeek v3.1 - deepseek-ai/deepseek-v3.1</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Human Takeover Settings */}
                    <div className="bg-white rounded-[24px] p-8 border border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                                <Clock size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-medium text-gray-900">Human Takeover</h3>
                                <p className="text-gray-500 text-sm mt-1">
                                    When you manually reply, the AI pauses for a set duration.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100 max-w-md">
                            <input
                                type="number"
                                min="1"
                                max="60"
                                value={humanTakeoverTimeout}
                                onChange={(e) => setHumanTakeoverTimeout(Math.max(1, Math.min(60, parseInt(e.target.value) || 5)))}
                                className="w-20 px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900 text-center font-medium bg-white"
                            />
                            <span className="text-gray-700 font-medium">minutes before AI resumes</span>
                        </div>
                    </div>

                    {/* Split Messages Settings */}
                    <div className="bg-white rounded-[24px] p-8 border border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                                <MessageSquare size={24} />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-medium text-gray-900">Split Messages</h3>
                                <p className="text-gray-500 text-sm mt-1">
                                    Send each sentence as a separate message for a more natural chat feel.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-100">
                            <div>
                                <p className="text-gray-800 font-medium">Enable sentence splitting</p>
                                <p className="text-gray-500 text-xs mt-1">
                                    Instead of: &quot;Hello, kamusta po? Ano po ang name nyo?&quot;<br />
                                    Sends: &quot;Hello, kamusta po?&quot; then &quot;Ano po ang name nyo?&quot;
                                </p>
                            </div>
                            <button
                                onClick={() => setSplitMessages(!splitMessages)}
                                className={`p-2 rounded-lg transition-colors ${splitMessages
                                    ? 'text-purple-600 bg-purple-100 hover:bg-purple-200'
                                    : 'text-gray-400 bg-gray-200 hover:bg-gray-300'
                                    }`}
                                title={splitMessages ? 'Disable split messages' : 'Enable split messages'}
                            >
                                {splitMessages ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                            </button>
                        </div>
                    </div>

                    {/* Conversation Style Instructions */}
                    <div className="bg-white rounded-[24px] p-8 border border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                        <div className="mb-6">
                            <h3 className="text-xl font-normal text-gray-900 mb-2">Conversation Style Instructions</h3>
                            <p className="text-gray-500 text-sm">Define how the bot should converse, including tone and specific dos/don&apos;ts.</p>
                        </div>
                        <div className="relative">
                            <textarea
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                placeholder="E.g., Talk like a real Filipino salesperson texting, not a script. NO multiple choice questions..."
                                className="w-full p-6 bg-yellow-50/30 border border-yellow-200/50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-yellow-400/20 focus:border-yellow-400 transition-all text-gray-800 font-mono text-sm leading-relaxed resize-y min-h-[200px]"
                            />
                            <div className="absolute top-4 right-4 text-xs font-medium text-yellow-600/50 bg-yellow-100/50 px-2 py-1 rounded">
                                SYSTEM PROMPT
                            </div>
                        </div>
                    </div>

                    {/* Rules Table */}
                    <div className="bg-white rounded-[24px] border border-gray-200/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                        <div className="p-6 border-b border-gray-100 bg-white flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-normal text-gray-900">Bot Rules</h3>
                                <p className="text-sm text-gray-400 mt-1">Specific rules checked before every response</p>
                            </div>
                            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-semibold tracking-wide">
                                {rules.filter(r => r.enabled).length} ACTIVE
                            </span>
                        </div>

                        {/* Add New Rule */}
                        <div className="p-6 bg-gray-50/50 border-b border-gray-100">
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={newRule}
                                    onChange={(e) => setNewRule(e.target.value)}
                                    placeholder="Type a new rule... (e.g., Never mention competitors)"
                                    className="flex-1 px-5 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-gray-900 bg-white shadow-sm transition-all"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddRule()}
                                />
                                <button
                                    onClick={handleAddRule}
                                    className="px-6 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 hover:shadow-lg transition-all active:scale-95 flex items-center gap-2 font-medium"
                                >
                                    <Plus size={20} />
                                    Add
                                </button>
                            </div>
                        </div>

                        {/* Rules List */}
                        <div className="divide-y divide-gray-50">
                            {rules.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Bot size={24} className="text-gray-300" />
                                    </div>
                                    <p className="text-gray-500 font-medium">No rules added yet</p>
                                    <p className="text-sm text-gray-400 mt-1">Add rules above to guide your bot&apos;s behavior.</p>
                                </div>
                            ) : (
                                rules.map((rule, index) => (
                                    <div
                                        key={rule.id}
                                        className={`group flex items-center gap-4 p-5 hover:bg-gray-50 transition-colors ${!rule.enabled ? 'opacity-60 bg-gray-50/50' : 'bg-white'
                                            }`}
                                    >
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-400 text-xs font-bold">
                                            {index + 1}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <p className={`text-base ${rule.enabled ? 'text-gray-900' : 'text-gray-500 line-through'}`}>
                                                {rule.rule}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleToggleRule(rule.id, rule.enabled)}
                                                className={`p-2 rounded-lg transition-colors ${rule.enabled
                                                    ? 'text-teal-600 bg-teal-50 hover:bg-teal-100'
                                                    : 'text-gray-400 bg-gray-100 hover:bg-gray-200'
                                                    }`}
                                                title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                                            >
                                                {rule.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteRule(rule.id)}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
