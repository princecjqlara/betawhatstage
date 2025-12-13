'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Heart,
    Share2,
    MessageCircle,
    ChevronLeft,
    ChevronRight,
    Package,
    ShoppingCart,
    Check,
    Loader2,
} from 'lucide-react';
import Link from 'next/link';

interface ProductCategory {
    id: string;
    name: string;
    color: string;
}

interface Product {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    currency: string;
    image_url: string | null;
    category_id: string | null;
    category: ProductCategory | null;
    is_active: boolean;
}

interface Variation {
    id: string;
    variation_type: { name: string };
    value: string;
    price: number;
}

interface ProductDetailClientProps {
    product: Product;
    variations: Variation[];
    relatedProducts: Product[];
    facebookPageId: string | null;
}

export default function ProductDetailClient({
    product,
    variations,
    relatedProducts,
    facebookPageId,
}: ProductDetailClientProps) {
    const searchParams = useSearchParams();
    const senderPsid = searchParams.get('psid') || '';
    const pageId = searchParams.get('pageId') || '';

    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [isWishlisted, setIsWishlisted] = useState(false);
    const [selectedVariations, setSelectedVariations] = useState<Record<string, string>>({});
    const [currentPrice, setCurrentPrice] = useState<number | null>(product.price);

    // Cart state
    const [addingToCart, setAddingToCart] = useState(false);
    const [showAddedToast, setShowAddedToast] = useState(false);

    const productImages = product.image_url ? [product.image_url] : [];

    // Initialize default variations
    useEffect(() => {
        if (variations.length > 0) {
            const defaults: Record<string, string> = {};
            let defaultPrice = product.price;

            const types = new Set(variations.map((v) => v.variation_type.name));

            types.forEach(typeName => {
                const firstVar = variations.find((v) => v.variation_type.name === typeName);
                if (firstVar) {
                    defaults[typeName] = firstVar.value;
                    if (firstVar.price > 0) {
                        defaultPrice = firstVar.price;
                    }
                }
            });

            setSelectedVariations(defaults);
            if (defaultPrice) setCurrentPrice(defaultPrice);
        }
    }, [variations, product.price]);

    const formatPrice = (price: number | null) => {
        if (price === null) return 'Price not set';
        return `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
    };

    // Group variations by type
    const groupedVariations = variations.reduce((acc, variation) => {
        const typeName = variation.variation_type.name;
        if (!acc[typeName]) {
            acc[typeName] = [];
        }
        acc[typeName].push(variation);
        return acc;
    }, {} as Record<string, Variation[]>);

    const handleVariationSelect = (typeName: string, variation: Variation) => {
        setSelectedVariations(prev => ({
            ...prev,
            [typeName]: variation.value
        }));

        if (variation.price > 0) {
            setCurrentPrice(variation.price);
        }
    };

    const handleAddToCart = async () => {
        // Check if all variations are selected
        const unselectedTypes = Object.keys(groupedVariations).filter(type => !selectedVariations[type]);
        if (unselectedTypes.length > 0) {
            alert(`Please select ${unselectedTypes.join(', ')} before adding to cart.`);
            return;
        }

        // Require PSID for cart functionality (user must come from chat or have cookie in future)
        if (!senderPsid) {
            alert('Please access this page through our Messenger chat to add items to cart.');
            return;
        }

        setAddingToCart(true);

        try {
            const res = await fetch('/api/store/cart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender_id: senderPsid,
                    product_id: product.id,
                    quantity: 1,
                    unit_price: currentPrice || 0,
                    variations: Object.keys(selectedVariations).length > 0 ? selectedVariations : undefined,
                    page_id: pageId || undefined, // Include pageId for Messenger notifications
                }),
            });

            if (res.ok) {
                setShowAddedToast(true);
                setTimeout(() => setShowAddedToast(false), 3000);
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to add to cart');
            }
        } catch (error) {
            console.error('Error adding to cart:', error);
            alert('Failed to add to cart. Please try again.');
        } finally {
            setAddingToCart(false);
        }
    };

    const handleChatToBuy = () => {
        if (!facebookPageId) {
            alert('Store messaging is not configured. Please contact the administrator.');
            return;
        }

        const unselectedTypes = Object.keys(groupedVariations).filter(type => !selectedVariations[type]);
        if (unselectedTypes.length > 0) {
            alert(`Please select ${unselectedTypes.join(', ')} before chatting to buy.`);
            return;
        }

        const variationString = Object.entries(selectedVariations)
            .map(([key, value]) => `${key}-${value}`)
            .join(',');

        const refPayload = `p_id:${product.id}|vars:${variationString}`;
        const mmeUrl = `https://m.me/${facebookPageId}?ref=${encodeURIComponent(refPayload)}`;
        window.open(mmeUrl, '_blank');
    };


    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Breadcrumb */}
                <nav className="flex items-center gap-2 text-sm mb-8">
                    <Link href="/store" className="text-gray-500 hover:text-emerald-600 transition-colors">
                        Store
                    </Link>
                    <span className="text-gray-400">/</span>
                    {product.category && (
                        <>
                            <span className="text-gray-500">
                                {product.category.name}
                            </span>
                            <span className="text-gray-400">/</span>
                        </>
                    )}
                    <span className="text-gray-900 font-medium truncate max-w-xs">
                        {product.name}
                    </span>
                </nav>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
                    {/* Left Column - Product Images */}
                    <div className="space-y-4">
                        <div className="relative aspect-square bg-gray-50 rounded-3xl overflow-hidden group border border-gray-100">
                            {productImages.length > 0 ? (
                                <img
                                    src={productImages[selectedImageIndex]}
                                    alt={product.name}
                                    className="w-full h-full object-contain p-4"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Package size={80} className="text-gray-300" />
                                </div>
                            )}

                            {productImages.length > 1 && (
                                <>
                                    <button
                                        onClick={() => setSelectedImageIndex(prev =>
                                            prev === 0 ? productImages.length - 1 : prev - 1
                                        )}
                                        className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
                                    >
                                        <ChevronLeft size={20} className="text-gray-700" />
                                    </button>
                                    <button
                                        onClick={() => setSelectedImageIndex(prev =>
                                            prev === productImages.length - 1 ? 0 : prev + 1
                                        )}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
                                    >
                                        <ChevronRight size={20} className="text-gray-700" />
                                    </button>
                                </>
                            )}
                        </div>

                        {productImages.length > 1 && (
                            <div className="flex gap-3">
                                {productImages.map((img, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setSelectedImageIndex(index)}
                                        className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 transition-all ${selectedImageIndex === index
                                            ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                                            : 'border-transparent hover:border-gray-300'
                                            }`}
                                    >
                                        <img
                                            src={img}
                                            alt={`${product.name} view ${index + 1}`}
                                            className="w-full h-full object-cover"
                                        />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right Column - Product Info */}
                    <div className="space-y-8">
                        <div>
                            <div className="flex items-start justify-between">
                                <h1 className="text-3xl font-bold text-gray-900 mb-3 leading-tight">
                                    {product.name}
                                </h1>
                            </div>
                            {product.category && (
                                <div className="inline-block px-3 py-1 rounded-full text-xs font-medium mb-4" style={{ backgroundColor: `${product.category.color}20`, color: product.category.color }}>
                                    {product.category.name}
                                </div>
                            )}
                            {product.description && (
                                <p className="text-gray-600 leading-relaxed text-lg">
                                    {product.description}
                                </p>
                            )}
                        </div>

                        <div className="flex items-baseline gap-3 pb-6 border-b border-gray-100">
                            <span className="text-4xl font-bold text-emerald-600">
                                {formatPrice(currentPrice)}
                            </span>
                        </div>

                        {Object.keys(groupedVariations).length > 0 && (
                            <div className="space-y-6">
                                {Object.entries(groupedVariations).map(([typeName, vars]) => (
                                    <div key={typeName}>
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-sm font-semibold text-gray-900">{typeName}:</span>
                                            <span className="text-sm text-gray-500">{selectedVariations[typeName]}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {vars.map((variation) => {
                                                const isSelected = selectedVariations[typeName] === variation.value;
                                                return (
                                                    <button
                                                        key={variation.id}
                                                        onClick={() => handleVariationSelect(typeName, variation)}
                                                        className={`min-w-[48px] px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${isSelected
                                                            ? 'bg-gray-900 text-white border-gray-900 shadow-md transform scale-105'
                                                            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                            }`}
                                                    >
                                                        {variation.value}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-4 pt-4">
                            {/* Add to Cart button - shown when user has PSID */}
                            {senderPsid && (
                                <button
                                    onClick={handleAddToCart}
                                    disabled={addingToCart}
                                    className="flex-1 bg-emerald-600 text-white px-8 py-4 rounded-full font-semibold hover:bg-emerald-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:translate-y-0 text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {addingToCart ? (
                                        <>
                                            <Loader2 size={20} className="animate-spin" />
                                            Adding...
                                        </>
                                    ) : (
                                        <>
                                            <ShoppingCart size={20} />
                                            Add to Cart
                                        </>
                                    )}
                                </button>
                            )}
                            <button
                                onClick={handleChatToBuy}
                                className={`${senderPsid ? '' : 'flex-1'} bg-gray-900 text-white px-8 py-4 rounded-full font-semibold hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:translate-y-0 text-lg flex items-center justify-center gap-2`}
                            >
                                <MessageCircle size={20} />
                                Chat to Buy
                            </button>
                            <button
                                onClick={() => setIsWishlisted(!isWishlisted)}
                                className={`p-4 rounded-full border transition-all ${isWishlisted
                                    ? 'border-red-200 bg-red-50 text-red-500'
                                    : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                <Heart size={24} className={isWishlisted ? 'fill-current' : ''} />
                            </button>
                            <button className="p-4 rounded-full border border-gray-200 hover:border-gray-300 text-gray-600 hover:bg-gray-50 transition-all">
                                <Share2 size={24} />
                            </button>
                        </div>

                        {/* Toast notification */}
                        {showAddedToast && (
                            <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4 z-50">
                                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                                    <Check size={18} />
                                </div>
                                <div>
                                    <p className="font-semibold">Added to Cart!</p>
                                    <p className="text-sm text-emerald-100">{product.name}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Related Products */}
                {relatedProducts.length > 0 && (
                    <div className="mt-16 pt-16 border-t border-gray-100">
                        <h2 className="text-2xl font-bold text-gray-900 mb-8">You May Also Like</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {relatedProducts.map((relatedProduct) => (
                                <Link
                                    key={relatedProduct.id}
                                    href={`/product/${relatedProduct.id}`}
                                    className="group"
                                >
                                    <div className="relative aspect-[3/4] bg-gray-50 rounded-2xl overflow-hidden mb-3 border border-gray-100">
                                        {relatedProduct.image_url ? (
                                            <img
                                                src={relatedProduct.image_url}
                                                alt={relatedProduct.name}
                                                className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Package size={32} className="text-gray-300" />
                                            </div>
                                        )}
                                        {relatedProduct.category && (
                                            <div className="absolute top-3 left-3 px-2 py-1 bg-white/90 backdrop-blur text-xs font-medium rounded-md shadow-sm text-gray-900">
                                                {relatedProduct.category.name}
                                            </div>
                                        )}
                                    </div>
                                    <h3 className="font-medium text-gray-900 truncate group-hover:text-emerald-600 transition-colors">
                                        {relatedProduct.name}
                                    </h3>
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <span className="font-bold text-gray-900">
                                            {formatPrice(relatedProduct.price)}
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
