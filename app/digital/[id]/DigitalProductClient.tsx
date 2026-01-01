'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Loader2,
    CheckCircle2,
    Play,
    ChevronLeft,
    ChevronRight,
    Share2,
    Clock,
    BookOpen,
    Users,
    Globe,
    Tag,
    ChevronDown,
    Lock,
    ExternalLink,
    Upload,
    CreditCard,
    X,
    Image as ImageIcon,
    Link
} from 'lucide-react';

interface Media {
    id: string;
    media_type: 'image' | 'video' | 'video_link';
    media_url: string;
    thumbnail_url: string | null;
    display_order: number;
}

interface Field {
    id: string;
    label: string;
    field_type: string;
    is_required: boolean;
    options?: string[];
    placeholder?: string;
    use_separator?: boolean;
    step_number: number;
}

interface Step {
    label: string;
}

interface DigitalProduct {
    id: string;
    title: string;
    description: string | null;
    short_description: string | null;
    price: number | null;
    currency: string;
    is_active: boolean;
    access_type: string;
    access_duration_days: number | null;
    payment_type: 'one_time' | 'recurring';
    billing_interval: 'monthly' | 'yearly';
    thumbnail_url: string | null;
    creator_name: string | null;
    category: { id: string; name: string; color: string } | null;
    checkout_form: {
        id: string;
        title: string;
        description: string | null;
        settings: {
            steps?: Step[];
            payment_instructions?: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            [key: string]: any;
        };
    } | null;
    media: Media[];
}

interface DigitalProductClientProps {
    product: DigitalProduct;
    initialFormFields: Field[];
}

export default function DigitalProductClient({ product: initialProduct, initialFormFields }: DigitalProductClientProps) {
    const searchParams = useSearchParams();

    // Extract tracking parameters from URL
    const userId = searchParams.get('user_id') || searchParams.get('psid') || null;
    const pageId = searchParams.get('pageId') || null;

    const [product, setProduct] = useState<DigitalProduct>(initialProduct);
    const [formFields, setFormFields] = useState<Field[]>(initialFormFields);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');
    const [showCheckoutModal, setShowCheckoutModal] = useState(false);

    // Multi-step form state
    const [currentStep, setCurrentStep] = useState(1);
    const [fileUploads, setFileUploads] = useState<Record<string, { url: string; name: string; preview?: string }>>({});
    const [uploadingField, setUploadingField] = useState<string | null>(null);
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    // Get steps from form settings
    const steps: Step[] = product?.checkout_form?.settings?.steps || [{ label: 'Step 1' }];
    const totalSteps = steps.length;

    // Media carousel state
    const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);

    // Redirect to Messenger after successful submission
    useEffect(() => {
        if (submitted && pageId) {
            console.log('[Digital Product] Redirecting to Messenger:', `https://m.me/${pageId}`);
            const timer = setTimeout(() => {
                window.location.href = `https://m.me/${pageId}`;
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [submitted, pageId]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleChange = (fieldId: string, value: any) => {
        setFormData(prev => ({ ...prev, [fieldId]: value }));
    };

    // Get fields for current step
    const getCurrentStepFields = () => {
        return formFields.filter(f => (f.step_number || 1) === currentStep);
    };

    // Validate current step before proceeding
    const validateCurrentStep = () => {
        const currentFields = getCurrentStepFields();
        for (const field of currentFields) {
            if (field.is_required) {
                if (field.field_type === 'file' && !fileUploads[field.id]) {
                    setError(`Please upload a file for "${field.label}"`);
                    return false;
                }
                if (field.field_type === 'payment_section' && !fileUploads[`${field.id}_receipt`]) {
                    setError(`Please upload a payment receipt for "${field.label}"`);
                    return false;
                }
                if (!['file', 'payment_section'].includes(field.field_type) && !formData[field.id]) {
                    setError(`Please fill in "${field.label}"`);
                    return false;
                }
            }
        }
        setError('');
        return true;
    };

    const handleNext = () => {
        if (validateCurrentStep() && currentStep < totalSteps) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
            setError('');
        }
    };

    const handleFileUpload = async (fieldId: string, file: File) => {
        setUploadingField(fieldId);
        setError('');

        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('field_id', fieldId);

            const res = await fetch('/api/forms/upload', {
                method: 'POST',
                body: fd
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Upload failed');
            }

            const data = await res.json();
            const preview = URL.createObjectURL(file);

            setFileUploads(prev => ({
                ...prev,
                [fieldId]: { url: data.url, name: file.name, preview }
            }));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.message);
        } finally {
            setUploadingField(null);
        }
    };

    const removeFile = (fieldId: string) => {
        setFileUploads(prev => {
            const newUploads = { ...prev };
            if (newUploads[fieldId]?.preview) {
                URL.revokeObjectURL(newUploads[fieldId].preview!);
            }
            delete newUploads[fieldId];
            return newUploads;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!product?.checkout_form?.id) return;
        if (!validateCurrentStep()) return;

        setSubmitting(true);
        setError('');

        try {
            // Prepare submission data including file URLs
            const submissionData = { ...formData };
            Object.entries(fileUploads).forEach(([fieldId, fileInfo]) => {
                submissionData[fieldId] = fileInfo.url;
            });

            const res = await fetch('/api/forms/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    form_id: product.checkout_form.id,
                    digital_product_id: product.id,
                    user_id: userId,
                    data: Object.entries(submissionData).reduce((acc, [key, value]) => {
                        const field = formFields.find(f => f.id === key);
                        if (field?.field_type === 'number' && field?.use_separator && typeof value === 'string') {
                            acc[key] = value.replace(/,/g, '');
                        } else {
                            acc[key] = value;
                        }
                        return acc;
                    }, {} as Record<string, any>)
                })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Submission failed');
            }

            setSubmitted(true);
            setShowCheckoutModal(false);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const formatPrice = (price: number | null) => {
        if (price === null || price === 0) return 'Free';
        return `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
    };

    // Helper function to get embed URL for video links
    const getEmbedUrl = (url: string): string | null => {
        // YouTube patterns
        const youtubePatterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
        ];
        for (const pattern of youtubePatterns) {
            const match = url.match(pattern);
            if (match) {
                return `https://www.youtube.com/embed/${match[1]}?autoplay=1`;
            }
        }

        // Vimeo pattern
        const vimeoPattern = /vimeo\.com\/(\d+)/;
        const vimeoMatch = url.match(vimeoPattern);
        if (vimeoMatch) {
            return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;
        }

        // Loom pattern
        const loomPattern = /loom\.com\/share\/([a-zA-Z0-9]+)/;
        const loomMatch = url.match(loomPattern);
        if (loomMatch) {
            return `https://www.loom.com/embed/${loomMatch[1]}?autoplay=1`;
        }

        return null;
    };

    const nextMedia = () => {
        if (product?.media) {
            setCurrentMediaIndex((prev) =>
                prev === product?.media.length - 1 ? 0 : prev + 1
            );
            setIsVideoPlaying(false);
        }
    };

    const prevMedia = () => {
        if (product?.media) {
            setCurrentMediaIndex((prev) =>
                prev === 0 ? product.media.length - 1 : prev - 1
            );
            setIsVideoPlaying(false);
        }
    };

    if (submitted) {
        return (
            <div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center p-6">
                <div className="max-w-lg w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-10 h-10 text-green-600" />
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">You're In! 🎉</h2>
                    <p className="text-gray-600 text-lg mb-2">
                        Thank you for your purchase of <strong className="text-gray-900">{product?.title}</strong>
                    </p>
                    <p className="text-gray-500 mb-8">
                        Check your email for access instructions and next steps.
                    </p>
                    {pageId ? (
                        <p className="text-sm text-gray-500">Redirecting you back to Messenger...</p>
                    ) : (
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-black transition-colors"
                        >
                            Back to Product
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const currentMedia = product.media[currentMediaIndex];

    return (
        <div className="min-h-screen bg-[#F7F7F7] text-gray-900 font-sans">
            <main className="max-w-[1100px] mx-auto p-4 md:p-6 lg:p-8">
                <div className="flex flex-col lg:flex-row gap-8">

                    {/* LEFT COLUMN: Main Content */}
                    <div className="flex-1 min-w-0">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                            {/* Hero Media Carousel */}
                            {product.media.length > 0 ? (
                                <div className="space-y-4 p-4">
                                    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden group">
                                        {/* Current Media */}
                                        <div className="w-full h-full flex items-center justify-center">
                                            {currentMedia?.media_type === 'video_link' ? (
                                                <div className="relative w-full h-full">
                                                    {isVideoPlaying ? (
                                                        <iframe
                                                            src={getEmbedUrl(currentMedia.media_url) || currentMedia.media_url}
                                                            className="w-full h-full"
                                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                            allowFullScreen
                                                        />
                                                    ) : (
                                                        <div className="relative w-full h-full cursor-pointer" onClick={() => setIsVideoPlaying(true)}>
                                                            {currentMedia.thumbnail_url ? (
                                                                <img
                                                                    src={currentMedia.thumbnail_url}
                                                                    alt=""
                                                                    className="w-full h-full object-cover opacity-90 transition-opacity hover:opacity-100"
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                                                                    <Link className="w-12 h-12 text-white/40" />
                                                                </div>
                                                            )}
                                                            <div className="absolute inset-0 flex items-center justify-center">
                                                                <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-lg">
                                                                    <Play className="w-8 h-8 text-white ml-1" fill="white" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : currentMedia?.media_type === 'video' ? (
                                                <div className="relative w-full h-full">
                                                    {isVideoPlaying ? (
                                                        <video
                                                            src={currentMedia.media_url}
                                                            className="w-full h-full object-contain"
                                                            controls
                                                            autoPlay
                                                        />
                                                    ) : (
                                                        <div className="relative w-full h-full cursor-pointer" onClick={() => setIsVideoPlaying(true)}>
                                                            <img
                                                                src={currentMedia.thumbnail_url || currentMedia.media_url}
                                                                alt=""
                                                                className="w-full h-full object-cover opacity-90 transition-opacity hover:opacity-100"
                                                            />
                                                            <div className="absolute inset-0 flex items-center justify-center">
                                                                <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-lg">
                                                                    <Play className="w-8 h-8 text-white ml-1" fill="white" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <img
                                                    src={currentMedia?.media_url}
                                                    alt={product.title}
                                                    className="w-full h-full object-contain"
                                                />
                                            )}
                                        </div>

                                        {/* Arrows */}
                                        {product.media.length > 1 && (
                                            <>
                                                <button onClick={prevMedia} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/30 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/50">
                                                    <ChevronLeft size={24} />
                                                </button>
                                                <button onClick={nextMedia} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/30 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/50">
                                                    <ChevronRight size={24} />
                                                </button>
                                            </>
                                        )}
                                    </div>

                                    {/* Thumbnails */}
                                    {product.media.length > 1 && (
                                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                                            {product.media.map((media, index) => (
                                                <button
                                                    key={media.id}
                                                    onClick={() => {
                                                        setCurrentMediaIndex(index);
                                                        setIsVideoPlaying(false);
                                                    }}
                                                    className={`relative w-24 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${index === currentMediaIndex
                                                        ? 'border-gray-800 opacity-100'
                                                        : 'border-transparent opacity-60 hover:opacity-100'
                                                        }`}
                                                >
                                                    {media.thumbnail_url ? (
                                                        <img
                                                            src={media.thumbnail_url}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : media.media_type === 'video_link' ? (
                                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-600 to-gray-800">
                                                            <Link className="w-4 h-4 text-white/60" />
                                                        </div>
                                                    ) : (
                                                        <img
                                                            src={media.media_url}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                        />
                                                    )}
                                                    {(media.media_type === 'video' || media.media_type === 'video_link') && (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                                            <Play className="w-4 h-4 text-white" fill="white" />
                                                        </div>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : null}

                            {/* Product Header Info */}
                            <div className="px-6 pb-6 pt-2">
                                <div className="flex items-center gap-4 text-sm text-gray-500 mb-4 font-medium">
                                    <div className="flex items-center gap-1.5">
                                        <Globe size={16} />
                                        <span>Public</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Users size={16} />
                                        <span>2.5k Members</span>
                                    </div>
                                    {product.category && (
                                        <div className="flex items-center gap-1.5">
                                            <Tag size={16} />
                                            <span style={{ color: product.category.color }}>{product.category.name}</span>
                                        </div>
                                    )}
                                </div>

                                <h1 className="text-3xl font-bold text-gray-900 mb-3">{product.title}</h1>
                                {product.short_description && (
                                    <p className="text-lg text-gray-600 leading-relaxed mb-6">
                                        {product.short_description}
                                    </p>
                                )}

                                {/* Mobile-only CTA Button */}
                                <div className="lg:hidden">
                                    <div className="bg-[#FFF8E1] border border-[#FFE082] rounded-xl p-4 text-center">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-sm font-medium text-gray-600">
                                                {product.payment_type === 'recurring'
                                                    ? `${product.billing_interval === 'yearly' ? 'Yearly' : 'Monthly'} subscription`
                                                    : 'One-time payment'}
                                            </span>
                                            <span className="text-2xl font-black text-gray-900">{formatPrice(product.price)}{product.payment_type === 'recurring' && <span className="text-sm font-medium text-gray-500">/{product.billing_interval === 'yearly' ? 'yr' : 'mo'}</span>}</span>
                                        </div>
                                        <button
                                            onClick={() => setShowCheckoutModal(true)}
                                            className="w-full py-3.5 bg-[#FFD000] hover:bg-[#FFC400] text-gray-900 font-bold rounded-xl shadow-sm transition-all text-lg"
                                        >
                                            GET ACCESS
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Description Section */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">About this product</h2>
                            <div className="prose prose-gray max-w-none text-gray-600 leading-relaxed">
                                {product.description ? (
                                    (() => {
                                        const lines = product.description.split('\n');
                                        const elements: React.ReactNode[] = [];
                                        let currentListItems: string[] = [];
                                        let key = 0;

                                        const flushList = () => {
                                            if (currentListItems.length > 0) {
                                                elements.push(
                                                    <ul key={key++} className="list-disc list-inside space-y-1.5 my-3">
                                                        {currentListItems.map((item, idx) => (
                                                            <li key={idx} className="text-gray-600">{item}</li>
                                                        ))}
                                                    </ul>
                                                );
                                                currentListItems = [];
                                            }
                                        };

                                        lines.forEach((line, idx) => {
                                            const trimmedLine = line.trim();
                                            // Check if line starts with bullet point markers
                                            const bulletMatch = trimmedLine.match(/^[-•*]\s*(.+)$/);

                                            if (bulletMatch) {
                                                currentListItems.push(bulletMatch[1]);
                                            } else {
                                                flushList();
                                                if (trimmedLine === '') {
                                                    // Empty line - add spacing
                                                    elements.push(<div key={key++} className="h-3" />);
                                                } else {
                                                    // Regular text line
                                                    elements.push(
                                                        <p key={key++} className="text-gray-600" style={{ whiteSpace: 'pre-wrap' }}>
                                                            {line}
                                                        </p>
                                                    );
                                                }
                                            }
                                        });

                                        flushList(); // Flush any remaining list items
                                        return elements;
                                    })()
                                ) : (
                                    <p className="text-gray-400 italic">No description provided.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Sidebar (Sticky) */}
                    <div className="lg:w-[360px] flex-shrink-0">
                        <div className="sticky top-6">
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                                {/* Banner / Brand Area */}
                                <div className="bg-gray-900 h-32 relative overflow-hidden flex items-center justify-center">
                                    {(product.thumbnail_url || product.media?.[0]) ? (
                                        <div className="absolute inset-0">
                                            <img
                                                src={product.thumbnail_url || product.media[0].thumbnail_url || product.media[0].media_url}
                                                className="w-full h-full object-cover opacity-50 blur-sm scale-110"
                                                alt=""
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent" />
                                        </div>
                                    ) : (
                                        <div className="absolute inset-0 bg-gradient-to-r from-gray-800 to-gray-900" />
                                    )}
                                    <div className="relative z-10 text-center px-4">
                                        <span className="text-2xl font-black text-white tracking-widest uppercase drop-shadow-md">
                                            {product.title.split(' ')[0]}
                                        </span>
                                    </div>
                                </div>

                                <div className="p-6">
                                    <h3 className="text-xl font-bold text-gray-900 mb-1">{product.title}</h3>
                                    <p className="text-xs text-gray-500 mb-6 uppercase tracking-wider font-medium">Digital Product</p>

                                    {/* Action Card */}
                                    <div className="bg-[#FFF8E1] border border-[#FFE082] rounded-xl p-5 mb-6 text-center">
                                        <div className="text-xs font-bold text-gray-500 uppercase mb-2 tracking-wide">
                                            {product.payment_type === 'recurring'
                                                ? `${product.billing_interval === 'yearly' ? 'Yearly' : 'Monthly'} Subscription`
                                                : 'One-time Payment'}
                                        </div>
                                        <div className="text-4xl font-black text-gray-900 mb-4 tracking-tight">
                                            {formatPrice(product.price)}
                                            {product.payment_type === 'recurring' && (
                                                <span className="text-lg font-medium text-gray-500">/{product.billing_interval === 'yearly' ? 'year' : 'month'}</span>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => setShowCheckoutModal(true)}
                                            className="w-full py-4 bg-[#FFD000] hover:bg-[#FFC400] text-gray-900 font-bold rounded-xl shadow-sm hover:shadow-md transition-all transform hover:-translate-y-0.5 text-lg"
                                        >
                                            GET ACCESS
                                        </button>
                                        <div className="flex items-center justify-center gap-2 mt-3 text-xs text-gray-500 font-medium">
                                            <Lock size={12} />
                                            <span>Secure checkout</span>
                                        </div>
                                    </div>

                                    {/* Metadata Links */}
                                    <div className="space-y-4 text-sm font-medium text-gray-600 border-t border-gray-100 pt-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                                                <CheckCircle2 size={16} className="text-green-600" />
                                            </div>
                                            <div>
                                                <div className="text-gray-900 font-bold">In Stock</div>
                                                <div className="text-xs text-gray-400">Instant digital delivery</div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                                <Clock size={16} className="text-blue-600" />
                                            </div>
                                            <div>
                                                <div className="text-gray-900 font-bold">
                                                    {product.access_duration_days ? `${product.access_duration_days} Days` : 'Lifetime'}
                                                </div>
                                                <div className="text-xs text-gray-400">Access duration</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Instructors/Creators */}
                                    <div className="mt-8 pt-6 border-t border-gray-100">
                                        <p className="text-xs font-bold text-gray-400 uppercase mb-3">Created By</p>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-200 border-2 border-white shadow-sm overflow-hidden">
                                                {/* Placeholder Avatar */}
                                                <svg className="w-full h-full text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-900">{product.creator_name || 'WhatStage Team'}</div>
                                                <div className="text-xs text-gray-500">{product.creator_name ? 'Creator' : 'Official Creator'}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="text-center mt-8">
                                <a href="#" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                                    <span className="font-medium">Powered by</span>
                                    <span className="font-bold text-gray-600">WhatStage</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Checkout Modal Overlay */}
            {showCheckoutModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Complete Purchase</h3>
                                <p className="text-xs text-gray-500">{product.title}</p>
                            </div>
                            <button
                                onClick={() => setShowCheckoutModal(false)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                            >
                                <ChevronDown size={24} />
                            </button>
                        </div>

                        <div className="p-6">
                            {product.checkout_form ? (
                                <form onSubmit={handleSubmit} className="space-y-5">
                                    {/* Step Progress */}
                                    {totalSteps > 1 && (
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                                    Step {currentStep} of {totalSteps}
                                                </span>
                                                <span className="text-sm font-medium text-gray-700">
                                                    {steps[currentStep - 1]?.label}
                                                </span>
                                            </div>
                                            <div className="flex gap-1">
                                                {steps.map((_, index) => (
                                                    <div
                                                        key={index}
                                                        className={`flex-1 h-1.5 rounded-full transition-colors ${index < currentStep ? 'bg-[#FFD000]' : 'bg-gray-200'
                                                            }`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {error && (
                                        <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl mb-2 flex items-start gap-2">
                                            <span>⚠️</span>
                                            <span>{error}</span>
                                        </div>
                                    )}

                                    {getCurrentStepFields().map((field) => (
                                        <div key={field.id} className="space-y-1.5">
                                            <label className="block text-sm font-semibold text-gray-700">
                                                {field.label}
                                                {field.is_required && <span className="text-red-500 ml-1">*</span>}
                                            </label>

                                            {/* Payment Section */}
                                            {field.field_type === 'payment_section' ? (
                                                <div className="space-y-4">
                                                    {product.checkout_form?.settings?.payment_instructions && (
                                                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                                            <div className="flex items-center gap-2 mb-2 text-amber-700 font-medium">
                                                                <CreditCard size={16} />
                                                                <span>Payment Instructions</span>
                                                            </div>
                                                            <div className="text-sm text-amber-800 whitespace-pre-wrap">
                                                                {product.checkout_form.settings.payment_instructions}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="space-y-2">
                                                        <label className="block text-sm font-medium text-gray-600">
                                                            Upload Payment Receipt
                                                            {field.is_required && <span className="text-red-500 ml-1">*</span>}
                                                        </label>

                                                        {fileUploads[`${field.id}_receipt`] ? (
                                                            <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                                                                {fileUploads[`${field.id}_receipt`].preview && (
                                                                    <img
                                                                        src={fileUploads[`${field.id}_receipt`].preview}
                                                                        alt="Receipt"
                                                                        className="w-16 h-16 object-cover rounded-lg"
                                                                    />
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-sm font-medium text-green-700 truncate">
                                                                        {fileUploads[`${field.id}_receipt`].name}
                                                                    </p>
                                                                    <p className="text-xs text-green-600">Uploaded successfully</p>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeFile(`${field.id}_receipt`)}
                                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                                >
                                                                    <X size={16} />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div
                                                                onClick={() => fileInputRefs.current[`${field.id}_receipt`]?.click()}
                                                                className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-[#FFD000] hover:bg-yellow-50/50 transition-all"
                                                            >
                                                                {uploadingField === `${field.id}_receipt` ? (
                                                                    <Loader2 className="w-8 h-8 mx-auto text-[#FFD000] animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <ImageIcon className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                                                                        <p className="text-sm font-medium text-gray-600">Click to upload receipt</p>
                                                                        <p className="text-xs text-gray-400 mt-1">JPG, PNG up to 5MB</p>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                        <input
                                                            type="file"
                                                            ref={el => { fileInputRefs.current[`${field.id}_receipt`] = el; }}
                                                            accept="image/jpeg,image/png,image/gif,image/webp"
                                                            onChange={(e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) handleFileUpload(`${field.id}_receipt`, file);
                                                            }}
                                                            className="hidden"
                                                        />
                                                    </div>
                                                </div>
                                            ) : field.field_type === 'file' ? (
                                                /* File Upload Field */
                                                <div>
                                                    {fileUploads[field.id] ? (
                                                        <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                                                            {fileUploads[field.id].preview && (
                                                                <img
                                                                    src={fileUploads[field.id].preview}
                                                                    alt="Upload"
                                                                    className="w-16 h-16 object-cover rounded-lg"
                                                                />
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium text-green-700 truncate">
                                                                    {fileUploads[field.id].name}
                                                                </p>
                                                                <p className="text-xs text-green-600">Uploaded successfully</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeFile(field.id)}
                                                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            onClick={() => fileInputRefs.current[field.id]?.click()}
                                                            className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-[#FFD000] hover:bg-yellow-50/50 transition-all"
                                                        >
                                                            {uploadingField === field.id ? (
                                                                <Loader2 className="w-8 h-8 mx-auto text-[#FFD000] animate-spin" />
                                                            ) : (
                                                                <>
                                                                    <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                                                                    <p className="text-sm font-medium text-gray-600">Click to upload</p>
                                                                    <p className="text-xs text-gray-400 mt-1">JPG, PNG up to 5MB</p>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                    <input
                                                        type="file"
                                                        ref={el => { fileInputRefs.current[field.id] = el; }}
                                                        accept="image/jpeg,image/png,image/gif,image/webp"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) handleFileUpload(field.id, file);
                                                        }}
                                                        className="hidden"
                                                    />
                                                </div>
                                            ) : field.field_type === 'textarea' ? (
                                                <textarea
                                                    placeholder={field.placeholder}
                                                    value={formData[field.id] || ''}
                                                    onChange={e => handleChange(field.id, e.target.value)}
                                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#FFD000] focus:border-transparent outline-none transition-all resize-none bg-gray-50 focus:bg-white"
                                                    rows={3}
                                                />
                                            ) : field.field_type === 'select' ? (
                                                <div className="relative">
                                                    <select
                                                        value={formData[field.id] || ''}
                                                        onChange={e => handleChange(field.id, e.target.value)}
                                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#FFD000] focus:border-transparent outline-none transition-all appearance-none bg-gray-50 focus:bg-white"
                                                    >
                                                        <option value="" disabled>Select an option...</option>
                                                        {field.options?.map(opt => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                                                </div>
                                            ) : field.field_type === 'radio' ? (
                                                <div className="space-y-2 pt-1">
                                                    {field.options?.map(opt => (
                                                        <label key={opt} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                                                            <input
                                                                type="radio"
                                                                name={field.id}
                                                                value={opt}
                                                                checked={formData[field.id] === opt}
                                                                onChange={e => handleChange(field.id, e.target.value)}
                                                                className="w-4 h-4 text-[#FFD000] focus:ring-[#FFD000] border-gray-300"
                                                            />
                                                            <span className="text-gray-700 font-medium">{opt}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            ) : field.field_type === 'number' && field.use_separator ? (
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    placeholder={field.placeholder}
                                                    value={formData[field.id] || ''}
                                                    onChange={e => {
                                                        let raw = e.target.value.replace(/[^0-9.]/g, '');
                                                        const parts = raw.split('.');
                                                        if (parts.length > 2) {
                                                            raw = parts[0] + '.' + parts.slice(1).join('');
                                                        }
                                                        const integerPart = parts[0];
                                                        const decimalPart = parts.length > 1 ? '.' + parts[1] : '';
                                                        const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                                                        handleChange(field.id, formattedInteger + decimalPart);
                                                    }}
                                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#FFD000] focus:border-transparent outline-none transition-all bg-gray-50 focus:bg-white"
                                                />
                                            ) : field.field_type === 'checkbox' ? (
                                                <div className="flex items-center gap-3 pt-1">
                                                    <input
                                                        type="checkbox"
                                                        id={field.id}
                                                        checked={formData[field.id] || false}
                                                        onChange={e => handleChange(field.id, e.target.checked)}
                                                        className="w-5 h-5 rounded text-[#FFD000] focus:ring-[#FFD000] border-gray-300"
                                                    />
                                                    <label htmlFor={field.id} className="text-gray-700 cursor-pointer select-none">
                                                        {field.placeholder || 'I agree'}
                                                    </label>
                                                </div>
                                            ) : (
                                                <input
                                                    type={field.field_type === 'phone' ? 'tel' : field.field_type}
                                                    placeholder={field.placeholder}
                                                    value={formData[field.id] || ''}
                                                    onChange={e => handleChange(field.id, e.target.value)}
                                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#FFD000] focus:border-transparent outline-none transition-all bg-gray-50 focus:bg-white"
                                                />
                                            )}
                                        </div>
                                    ))}

                                    {/* Navigation Buttons */}
                                    <div className="pt-4 flex gap-3">
                                        {currentStep > 1 && (
                                            <button
                                                type="button"
                                                onClick={handleBack}
                                                className="flex-1 py-3.5 px-6 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                                            >
                                                <ChevronLeft size={18} />
                                                Back
                                            </button>
                                        )}

                                        {currentStep < totalSteps ? (
                                            <button
                                                type="button"
                                                onClick={handleNext}
                                                className="flex-1 py-3.5 px-6 text-gray-900 bg-[#FFD000] hover:bg-[#FFC400] rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                                            >
                                                Next
                                                <ChevronRight size={18} />
                                            </button>
                                        ) : (
                                            <button
                                                type="submit"
                                                disabled={submitting}
                                                className="flex-1 py-4 bg-[#FFD000] hover:bg-[#FFC400] text-gray-900 font-bold rounded-xl shadow-sm transition-all text-lg flex items-center justify-center gap-2 transform active:scale-[0.99]"
                                            >
                                                {submitting ? (
                                                    <>
                                                        <Loader2 className="animate-spin" size={20} />
                                                        Processing...
                                                    </>
                                                ) : (
                                                    <>
                                                        Pay {formatPrice(product.price)}
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-center text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
                                        <Lock size={10} />
                                        SSL Encrypted Payment
                                    </p>
                                </form>
                            ) : (
                                <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                    <p>Checkout form not configured.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
