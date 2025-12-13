'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, ShoppingCart, Activity, Phone, Mail, MessageCircle, Clock, CheckCircle, AlertCircle, User, CreditCard, ShoppingBag } from 'lucide-react';

interface LeadDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    leadId: string | null;
    initialLeadData?: any;
}

interface LeadDetails {
    lead: any;
    appointments: any[];
    orders: any[];
    activity: any[];
}

export default function LeadDetailsModal({ isOpen, onClose, leadId, initialLeadData }: LeadDetailsModalProps) {
    const [activeTab, setActiveTab] = useState<'activity' | 'appointments' | 'orders'>('activity');
    const [data, setData] = useState<LeadDetails | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && leadId) {
            fetchDetails();
        } else {
            setData(null);
        }
    }, [isOpen, leadId]);

    const fetchDetails = async () => {
        if (!leadId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/pipeline/leads/${leadId}/details`);
            if (res.ok) {
                const details = await res.json();
                setData(details);

                // Auto-switch tab based on content priority
                if (details.orders && details.orders.some((o: any) => o.status?.toLowerCase() === 'pending')) {
                    setActiveTab('orders');
                } else if (details.appointments && details.appointments.length > 0) {
                    setActiveTab('appointments');
                } else {
                    setActiveTab('activity');
                }
            }
        } catch (error) {
            console.error('Failed to fetch lead details', error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    // Use initial data while loading real data if available, or fallback to loaded data
    const displayLead = data?.lead || initialLeadData || {};

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
                    >
                        {/* Modal Container */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex overflow-hidden flex-col md:flex-row relative"
                        >
                            {/* Close Button */}
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 z-10 p-2 bg-white/50 hover:bg-white rounded-full text-gray-500 hover:text-gray-900 transition-colors"
                            >
                                <X size={20} />
                            </button>

                            {/* LEFT PANEL: Profile Summary */}
                            <div className="w-full md:w-1/3 bg-gray-50 border-r border-gray-100 flex flex-col">
                                <div className="p-8 flex flex-col items-center text-center border-b border-gray-100">
                                    {/* Avatar */}
                                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 p-1 mb-4 shadow-sm relative">
                                        <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                                            {displayLead.profile_pic ? (
                                                <img src={displayLead.profile_pic} alt="Profile" className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={40} className="text-emerald-600/50" />
                                            )}
                                        </div>
                                        {/* Status Badge */}
                                        <div className="absolute bottom-0 right-0 bg-emerald-500 w-6 h-6 rounded-full border-4 border-white flex items-center justify-center">
                                            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                        </div>
                                    </div>

                                    <h2 className="text-xl font-bold text-gray-900 mb-1">
                                        {displayLead.name || 'Unknown Lead'}
                                    </h2>
                                    <p className="text-xs text-gray-400 font-mono mb-4">
                                        ID: {displayLead.sender_id?.slice(0, 12)}...
                                    </p>

                                    {/* Stage Badge */}
                                    <div
                                        className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-6"
                                        style={{
                                            backgroundColor: displayLead.stage?.color ? `${displayLead.stage.color}20` : '#f3f4f6',
                                            color: displayLead.stage?.color || '#6b7280'
                                        }}
                                    >
                                        {displayLead.stage?.name || 'Unassigned'}
                                    </div>

                                    {/* Contact Actions */}
                                    <div className="flex w-full gap-2">
                                        <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
                                            <MessageCircle size={16} className="text-blue-500" />
                                            Chat
                                        </button>
                                        <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
                                            <Phone size={16} className="text-green-500" />
                                            Call
                                        </button>
                                    </div>
                                </div>

                                {/* Details List */}
                                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Contact Info</h3>

                                        <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                                <Phone size={16} />
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="text-xs text-gray-500">Phone</p>
                                                <p className="text-sm font-medium text-gray-900 truncate">
                                                    {displayLead.phone || 'Not provided'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                                            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                                                <Mail size={16} />
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="text-xs text-gray-500">Email</p>
                                                <p className="text-sm font-medium text-gray-900 truncate">
                                                    {displayLead.email || 'Not provided'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-4">
                                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Stats</h3>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="p-3 bg-white rounded-xl border border-gray-100 text-center">
                                                <p className="text-2xl font-bold text-gray-900">{displayLead.message_count || 0}</p>
                                                <p className="text-xs text-gray-500">Messages</p>
                                            </div>
                                            <div className="p-3 bg-white rounded-xl border border-gray-100 text-center">
                                                <p className="text-xs font-medium text-gray-900 mt-1">
                                                    {new Date(displayLead.last_message_at).toLocaleDateString()}
                                                </p>
                                                <p className="text-[10px] text-gray-400">Last Active</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT PANEL: Dynamic Content (Tabs) */}
                            <div className="w-full md:w-2/3 flex flex-col bg-white">
                                {/* Tabs Header */}
                                <div className="flex items-center gap-1 p-2 border-b border-gray-100 bg-white sticky top-0 z-10">
                                    {[
                                        { id: 'activity', label: 'Activity', icon: Activity },
                                        { id: 'appointments', label: 'Appointments', icon: Calendar },
                                        { id: 'orders', label: 'Orders', icon: ShoppingCart },
                                    ].map((tab) => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id as any)}
                                            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all flex-1 justify-center ${activeTab === tab.id
                                                ? 'bg-gray-900 text-white shadow-md'
                                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                                                }`}
                                        >
                                            <tab.icon size={16} />
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Tab Content Area */}
                                <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30 relative">
                                    {loading && !data ? (
                                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                                            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                                        </div>
                                    ) : null}

                                    {activeTab === 'appointments' && (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className="text-lg font-bold text-gray-900">Appointments</h3>
                                                <button className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                                                    + New Appointment
                                                </button>
                                            </div>

                                            {!data?.appointments || data.appointments.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-300">
                                                        <Calendar size={32} />
                                                    </div>
                                                    <h4 className="text-gray-900 font-medium">No appointments yet</h4>
                                                    <p className="text-sm text-gray-500 mt-1 max-w-xs">
                                                        This lead hasn't booked any appointments yet.
                                                    </p>
                                                </div>
                                            ) : (
                                                data.appointments.map((appt: any) => (
                                                    <div key={appt.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
                                                        <div className={`p-3 rounded-xl flex flex-col items-center justify-center w-16 text-center ${new Date(appt.appointment_date) < new Date() ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-700'
                                                            }`}>
                                                            <span className="text-xs font-bold uppercase">{new Date(appt.appointment_date).toLocaleString('default', { month: 'short' })}</span>
                                                            <span className="text-xl font-bold">{new Date(appt.appointment_date).getDate()}</span>
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <h4 className="font-bold text-gray-900">
                                                                        {appt.start_time.slice(0, 5)} - {appt.end_time.slice(0, 5)}
                                                                    </h4>
                                                                    <p className="text-sm text-emerald-600 font-medium capitalize">{appt.status}</p>
                                                                </div>
                                                                {appt.status === 'confirmed' && <CheckCircle size={16} className="text-emerald-500" />}
                                                            </div>
                                                            {appt.notes && (
                                                                <p className="text-xs text-gray-500 mt-2 p-2 bg-gray-50 rounded-lg">
                                                                    "{appt.notes}"
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}

                                    {activeTab === 'orders' && (
                                        <div className="space-y-8">
                                            {/* Section: Pending Order (Cart) */}
                                            {data?.orders?.filter((o: any) => o.status?.toLowerCase() === 'pending').map((cart: any) => (
                                                <div key={cart.id} className="space-y-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Active Cart</h3>
                                                    </div>

                                                    <div className="bg-white rounded-xl border border-emerald-100 shadow-sm overflow-hidden ring-1 ring-emerald-50">
                                                        <div className="p-4 border-b border-gray-100 bg-emerald-50/30 flex justify-between items-center">
                                                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                                ID: {cart.id.slice(0, 8)}
                                                            </span>
                                                            <span className="px-2 py-1 rounded-md bg-yellow-100 text-yellow-700 text-xs font-bold uppercase">
                                                                Pending
                                                            </span>
                                                        </div>
                                                        <div className="divide-y divide-gray-100">
                                                            {cart.order_items?.map((item: any) => (
                                                                <div key={item.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                                                            <ShoppingCart size={16} className="text-gray-400" />
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm font-bold text-gray-900">{item.name}</p>
                                                                            <p className="text-xs text-gray-500">
                                                                                {item.variations ? Object.values(item.variations).join(', ') : 'Standard'}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <p className="text-sm font-bold text-gray-900">₱{(item.price * item.quantity).toLocaleString()}</p>
                                                                        <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                                                            <span className="font-bold text-gray-700">Total Amount</span>
                                                            <span className="text-xl font-extrabold text-emerald-600">
                                                                ₱{cart.total_amount?.toLocaleString()}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-end">
                                                        <button className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200">
                                                            Checkout Session
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Section: Past Orders */}
                                            <div className="space-y-4">
                                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Order History</h3>

                                                {!data?.orders || data.orders.filter((o: any) => o.status?.toLowerCase() !== 'pending').length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-8 text-center bg-white rounded-xl border border-gray-100 border-dashed">
                                                        <p className="text-sm text-gray-400">No past orders found.</p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {data.orders.filter((o: any) => o.status?.toLowerCase() !== 'pending').map((order: any) => (
                                                            <div key={order.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                                                                <div className="p-4 flex items-center justify-between cursor-pointer">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className={`p-2 rounded-lg ${order.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                                            order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                                                                'bg-blue-100 text-blue-700'
                                                                            }`}>
                                                                            <ShoppingBag size={18} />
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm font-bold text-gray-900">
                                                                                Order #{order.id.slice(0, 8)}
                                                                            </p>
                                                                            <p className="text-xs text-gray-500">
                                                                                {new Date(order.created_at).toLocaleDateString()} • {order.order_items?.length || 0} items
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-4">
                                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${order.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                                            order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                                                                'bg-blue-100 text-blue-700'
                                                                            }`}>
                                                                            {order.status}
                                                                        </span>
                                                                        <p className="text-sm font-bold text-gray-900">
                                                                            ₱{order.total_amount?.toLocaleString()}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                {/* Example of items preview - could be collapsible */}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {activeTab === 'activity' && (
                                        <div className="relative">
                                            <h3 className="text-lg font-bold text-gray-900 mb-6">Activity Timeline</h3>

                                            <div className="absolute top-12 bottom-0 left-[19px] w-0.5 bg-gray-100 -z-10" />

                                            <div className="space-y-6">
                                                {/* Start Item: Lead Created */}
                                                <div className="flex gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-blue-50 border-4 border-white shadow-sm flex items-center justify-center flex-shrink-0 text-blue-500 z-10">
                                                        <User size={16} />
                                                    </div>
                                                    <div className="pt-2">
                                                        <p className="text-sm font-bold text-gray-900">Lead Created</p>
                                                        <p className="text-xs text-gray-500">
                                                            First interaction with the bot
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Historical items */}
                                                {data?.activity?.map((act: any) => (
                                                    <div key={act.id} className="flex gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-white border-4 border-white shadow-sm ring-1 ring-gray-100 flex items-center justify-center flex-shrink-0 z-10">
                                                            <Activity size={16} className="text-gray-400" />
                                                        </div>
                                                        <div className="pt-1 pb-4 flex-1">
                                                            <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                                                <div className="flex justify-between items-start mb-1">
                                                                    <p className="text-sm font-bold text-gray-800">
                                                                        Moved to <span className="text-emerald-600">{act.to_stage?.name}</span>
                                                                    </p>
                                                                    <span className="text-[10px] text-gray-400">
                                                                        {new Date(act.created_at).toLocaleDateString()}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs text-gray-500">
                                                                    From: {act.from_stage?.name || 'Start'}
                                                                </p>
                                                                {act.reason && (
                                                                    <div className="mt-2 text-xs bg-gray-50 p-2 rounded-lg text-gray-600 italic">
                                                                        "{act.reason}"
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
