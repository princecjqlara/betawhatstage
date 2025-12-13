'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShoppingCart, ArrowRight, Loader2, MapPin, Phone, User, Check, Trash2, CreditCard, Package } from 'lucide-react';
import Link from 'next/link';

interface OrderItem {
    id: string;
    product_id: string;
    product_name: string;
    products: { name: string; image_url: string | null };
    quantity: number;
    unit_price: number;
    total_price: number;
    variations: Record<string, string> | null;
}

interface Cart {
    id: string;
    total_amount: number;
    status: string;
}

function CheckoutContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const psid = searchParams.get('psid');
    const pageId = searchParams.get('pageId');

    const [cart, setCart] = useState<Cart | null>(null);
    const [items, setItems] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [orderComplete, setOrderComplete] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        customer_name: '',
        customer_phone: '',
        customer_email: '', // Optional
        shipping_address: '',
        payment_method: 'GCash', // Default
        notes: ''
    });

    useEffect(() => {
        if (psid) {
            fetchCart();
        } else {
            setLoading(false);
        }
    }, [psid]);

    const fetchCart = async () => {
        try {
            const res = await fetch(`/api/store/cart?sender_id=${psid}`);
            const data = await res.json();
            if (res.ok && data.cart) {
                setCart(data.cart);
                setItems(data.items || []);
            }
        } catch (error) {
            console.error('Error fetching cart:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cart) return;

        setSubmitting(true);

        try {
            const res = await fetch('/api/store/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_id: cart.id,
                    ...formData
                }),
            });

            if (res.ok) {
                setOrderComplete(true);
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to place order');
            }
        } catch (error) {
            console.error('Error checking out:', error);
            alert('Failed to checkout. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemoveItem = async (itemId: string, productName: string) => {
        if (!confirm(`Remove "${productName}" from your cart?`)) return;

        try {
            const res = await fetch(`/api/store/cart?sender_id=${psid}&item_id=${itemId}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                // Refresh cart
                await fetchCart();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to remove item');
            }
        } catch (error) {
            console.error('Error removing item:', error);
            alert('Failed to remove item. Please try again.');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
        );
    }

    if (!psid) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
                <div className="text-center">
                    <ShoppingCart className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
                    <p className="text-gray-500">Please access your cart through our Facebook Messenger chat.</p>
                </div>
            </div>
        );
    }

    if (orderComplete) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-emerald-50 px-4">
                <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl text-center">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Check className="w-10 h-10 text-emerald-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-4">Order Confirmed!</h1>
                    <p className="text-gray-600 mb-8">
                        Thank you for your order, {formData.customer_name}. We will process it shortly and update you via Messenger.
                    </p>
                    <button
                        onClick={() => window.close()}
                        className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition-colors"
                    >
                        Close Window
                    </button>
                    <p className="mt-4 text-xs text-gray-400">You can close this page now.</p>
                </div>
            </div>
        );
    }

    if (!cart || items.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
                <div className="text-center">
                    <ShoppingCart className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Your Cart is Empty</h1>
                    <p className="text-gray-500 mb-8">Looks like you haven't added anything yet.</p>
                </div>
            </div>
        );
    }

    const totalAmount = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-900 mb-8 flex items-center gap-3">
                    <ShoppingCart className="text-emerald-600" />
                    Checkout
                </h1>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Form */}
                    <div className="lg:col-span-2 space-y-6">
                        <form id="checkout-form" onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                    <User size={20} className="text-gray-400" />
                                    Contact Details
                                </h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="col-span-2 sm:col-span-1">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                        <input
                                            type="text"
                                            name="customer_name"
                                            required
                                            value={formData.customer_name}
                                            onChange={handleInputChange}
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                                            placeholder="Juan Dela Cruz"
                                        />
                                    </div>
                                    <div className="col-span-2 sm:col-span-1">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                                        <input
                                            type="tel"
                                            name="customer_phone"
                                            required
                                            value={formData.customer_phone}
                                            onChange={handleInputChange}
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                                            placeholder="0912 345 6789"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
                                        <input
                                            type="email"
                                            name="customer_email"
                                            value={formData.customer_email}
                                            onChange={handleInputChange}
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                                            placeholder="juan@example.com"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100">
                                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                    <MapPin size={20} className="text-gray-400" />
                                    Shipping Details
                                </h2>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Complete Address</label>
                                    <textarea
                                        name="shipping_address"
                                        required
                                        rows={3}
                                        value={formData.shipping_address}
                                        onChange={handleInputChange}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all resize-none"
                                        placeholder="House No., Street Name, Barangay, City, Province, Zip Code"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100">
                                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                    <CreditCard size={20} className="text-gray-400" />
                                    Payment Method
                                </h2>
                                <div>
                                    <select
                                        name="payment_method"
                                        value={formData.payment_method}
                                        onChange={handleInputChange}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all bg-white"
                                    >
                                        <option value="GCash">GCash</option>
                                        <option value="Maya">Maya</option>
                                        <option value="Bank Transfer (BDO)">Bank Transfer (BDO)</option>
                                        <option value="Bank Transfer (BPI)">Bank Transfer (BPI)</option>
                                        <option value="COD">Cash on Delivery (COD)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                                <textarea
                                    name="notes"
                                    rows={2}
                                    value={formData.notes}
                                    onChange={handleInputChange}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all resize-none"
                                    placeholder="Special instructions for delivery"
                                />
                            </div>
                        </form>
                    </div>

                    {/* Right Column: Order Summary */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-2xl shadow-sm p-6 sticky top-8">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>

                            <div className="space-y-4 mb-6 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {items.map((item) => (
                                    <div key={item.id} className="flex gap-3 group">
                                        <div className="w-16 h-16 bg-gray-50 rounded-lg flex-shrink-0 overflow-hidden border border-gray-100">
                                            {item.products?.image_url ? (
                                                <img src={item.products.image_url} alt={item.product_name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                    <Package size={20} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{item.product_name}</p>
                                            {item.variations && (
                                                <p className="text-xs text-gray-500 truncate">
                                                    {Object.values(item.variations).join(', ')}
                                                </p>
                                            )}
                                            <div className="flex justify-between items-center mt-1">
                                                <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                                                <p className="text-sm font-semibold text-gray-900">₱{(item.unit_price * item.quantity).toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveItem(item.id, item.product_name)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                            title="Remove item"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-4 border-t border-gray-100 space-y-2 mb-6">
                                <div className="flex justify-between text-sm text-gray-600">
                                    <span>Subtotal</span>
                                    <span>₱{totalAmount.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm text-gray-600">
                                    <span>Shipping</span>
                                    <span>To be calc.</span>
                                </div>
                                <div className="flex justify-between text-lg font-bold text-gray-900 pt-2">
                                    <span>Total</span>
                                    <span>₱{totalAmount.toLocaleString()}</span>
                                </div>
                            </div>

                            <button
                                type="submit"
                                form="checkout-form"
                                disabled={submitting}
                                className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 size={20} className="animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        Place Order
                                        <ArrowRight size={20} />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function CheckoutPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
        }>
            <CheckoutContent />
        </Suspense>
    );
}
