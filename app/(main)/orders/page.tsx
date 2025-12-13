
'use client';

import { useState, useEffect } from 'react';
import {
    Search,
    Filter,
    ChevronDown,
    ArrowUpDown,
    Package,
    Calendar,
    MoreHorizontal,
    Eye,
    RefreshCw,
    Loader2
} from 'lucide-react';
import { Order } from '@/app/lib/orderService';
import OrderDetailsModal from './OrderDetailsModal';

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Modal state
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/orders');
            const data = await res.json();
            if (Array.isArray(data)) {
                setOrders(data);
            }
        } catch (error) {
            console.error('Failed to fetch orders:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (orderId: string, status: string) => {
        try {
            const res = await fetch('/api/orders', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: orderId, status }),
            });

            if (res.ok) {
                const updatedOrder = await res.json();

                // Update local state
                setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: updatedOrder.status } : o));

                // Update selected order if open
                if (selectedOrder && selectedOrder.id === orderId) {
                    setSelectedOrder(prev => prev ? { ...prev, status: updatedOrder.status } : null);
                }
            }
        } catch (error) {
            console.error('Failed to update status:', error);
        }
    };

    const handleViewOrder = (order: Order) => {
        setSelectedOrder(order);
        setIsModalOpen(true);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatCurrency = (amount: number, currency: string) => {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: currency || 'PHP'
        }).format(amount);
    };

    const getStatusBadge = (status: string) => {
        const styles = {
            pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
            confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
            processing: 'bg-purple-100 text-purple-800 border-purple-200',
            shipped: 'bg-indigo-100 text-indigo-800 border-indigo-200',
            delivered: 'bg-green-100 text-green-800 border-green-200',
            cancelled: 'bg-red-100 text-red-800 border-red-200',
        }[status] || 'bg-gray-100 text-gray-800 border-gray-200';

        return (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles} capitalize`}>
                {status}
            </span>
        );
    };

    // Filtering
    const filteredOrders = orders.filter(order => {
        const matchesSearch =
            order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.leads?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.leads?.email?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="animate-spin text-teal-500" size={40} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Orders</h1>
                        <p className="text-gray-500 mt-1">Manage and track your customer orders</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={fetchOrders}
                            className="p-2.5 bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                            title="Refresh Orders"
                        >
                            <RefreshCw size={18} />
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm mb-6 flex flex-col sm:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search by Order ID, Customer..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
                        />
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Filter size={16} className="text-gray-400" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-xl focus:ring-teal-500 focus:border-teal-500 block w-full sm:w-auto p-2.5 px-4 cursor-pointer outline-none"
                        >
                            <option value="all">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="processing">Processing</option>
                            <option value="shipped">Shipped</option>
                            <option value="delivered">Delivered</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                    {filteredOrders.length === 0 ? (
                        <div className="text-center py-24">
                            <div className="bg-gray-50 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                                <Package size={32} className="text-gray-400" />
                            </div>
                            <h3 className="text-gray-900 font-medium text-lg">No orders found</h3>
                            <p className="text-gray-500 text-sm mt-1">Try adjusting your search or filters</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                        <th className="px-6 py-4">Order ID</th>
                                        <th className="px-6 py-4">Customer</th>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4 text-right">Total</th>
                                        <th className="px-6 py-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredOrders.map((order) => (
                                        <tr key={order.id} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <span className="font-mono text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                                                    #{order.id.slice(0, 8)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-gray-900">{order.leads?.name || 'Guest'}</div>
                                                <div className="text-xs text-gray-500">{order.leads?.email}</div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                                                {formatDate(order.created_at)}
                                            </td>
                                            <td className="px-6 py-4">
                                                {getStatusBadge(order.status)}
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium text-gray-900">
                                                {formatCurrency(order.total_amount, order.currency)}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    onClick={() => handleViewOrder(order)}
                                                    className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all"
                                                    title="View Details"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <OrderDetailsModal
                isOpen={isModalOpen}
                order={selectedOrder}
                onClose={() => setIsModalOpen(false)}
                onUpdateStatus={handleUpdateStatus}
            />
        </div>
    );
}
