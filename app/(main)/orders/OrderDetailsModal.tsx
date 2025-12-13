
'use client';

import { X, Package, User, Phone, Mail, FileText, Calendar, DollarSign } from 'lucide-react';
import { Order } from '@/app/lib/orderService';
import { useEffect, useState } from 'react';

interface OrderDetailsModalProps {
    isOpen: boolean;
    order: Order | null;
    onClose: () => void;
    onUpdateStatus: (orderId: string, status: string) => Promise<void>;
}

export default function OrderDetailsModal({ isOpen, order, onClose, onUpdateStatus }: OrderDetailsModalProps) {
    const [status, setStatus] = useState<string>('');
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        if (order) {
            setStatus(order.status);
        }
    }, [order]);

    if (!isOpen || !order) return null;

    const handleStatusChange = async (newStatus: string) => {
        setStatus(newStatus);
        setUpdating(true);
        await onUpdateStatus(order.id, newStatus);
        setUpdating(false);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatCurrency = (amount: number, currency: string) => {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: currency || 'PHP'
        }).format(amount);
    };

    const getStatusColor = (s: string) => {
        switch (s) {
            case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'confirmed': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'processing': return 'bg-purple-100 text-purple-800 border-purple-200';
            case 'shipped': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
            case 'delivered': return 'bg-green-100 text-green-800 border-green-200';
            case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

            <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl relative z-10 flex flex-col animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-2xl font-bold text-gray-900">Order Details</h2>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(order.status)} uppercase tracking-wide`}>
                                {order.status}
                            </span>
                        </div>
                        <p className="text-gray-500 text-sm flex items-center gap-2">
                            <span className="font-mono">#{order.id.slice(0, 8)}</span>
                            <span>•</span>
                            <Calendar size={14} />
                            <span>{formatDate(order.created_at)}</span>
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-900"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto p-6 space-y-8">

                    {/* Customer Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <User size={16} className="text-teal-600" />
                                Customer Information
                            </h3>
                            <div className="space-y-2">
                                <p className="font-medium text-gray-900">{order.leads?.name || 'Guest Customer'}</p>
                                {order.leads?.email && (
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <Mail size={14} className="text-gray-400" />
                                        {order.leads.email}
                                    </div>
                                )}
                                {order.leads?.phone && (
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <Phone size={14} className="text-gray-400" />
                                        {order.leads.phone}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <FileText size={16} className="text-teal-600" />
                                Order Status
                            </h3>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Update Status</label>
                                <div className="flex gap-2 flex-wrap">
                                    {['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => handleStatusChange(s)}
                                            disabled={updating}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all border
                                                ${status === s
                                                    ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-500/20'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                }
                                            `}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Order Items */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Package size={16} className="text-teal-600" />
                            Order Items
                        </h3>
                        <div className="border border-gray-100 rounded-2xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-gray-500 font-medium">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Product</th>
                                        <th className="px-4 py-3 text-right">Price</th>
                                        <th className="px-4 py-3 text-center">Qty</th>
                                        <th className="px-4 py-3 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {order.order_items?.map((item) => (
                                        <tr key={item.id} className="hover:bg-gray-50/50">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-gray-900">{item.product_name}</div>
                                                {item.variations && (
                                                    <div className="text-xs text-gray-500 mt-0.5">
                                                        {Object.entries(item.variations).map(([key, val]) => `${key}: ${val}`).join(', ')}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(item.unit_price, order.currency)}</td>
                                            <td className="px-4 py-3 text-center text-gray-600">{item.quantity}</td>
                                            <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(item.total_price, order.currency)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-gray-50/50 font-semibold text-gray-900">
                                    <tr>
                                        <td colSpan={3} className="px-4 py-3 text-right">Total Amount</td>
                                        <td className="px-4 py-3 text-right text-base text-teal-600">{formatCurrency(order.total_amount, order.currency)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {order.notes && (
                        <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 text-sm text-yellow-800">
                            <strong>Note:</strong> {order.notes}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
