import { supabase } from './supabase';

// Cache configuration
let cachedCatalogContext: string | null = null;
let catalogCacheTimestamp = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

interface ProductWithVariations {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    currency: string;
    image_url: string | null;
    is_active: boolean;
    category: { id: string; name: string; color: string } | null;
    variations?: {
        id: string;
        value: string;
        price: number;
        variation_type: { id: string; name: string } | null;
    }[];
}

interface Property {
    id: string;
    title: string;
    description: string | null;
    price: number | null;
    currency: string;
    address: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    sqft: number | null;
    status: string;
    property_type: string | null;
    year_built: number | null;
    lot_area: number | null;
    garage_spaces: number | null;
    down_payment: number | null;
    monthly_amortization: number | null;
    payment_terms: string | null;
    is_active: boolean;
}

interface PaymentMethod {
    id: string;
    name: string;
    account_name: string | null;
    account_number: string | null;
    instructions: string | null;
    is_active: boolean;
}

/**
 * Fetch products with their variations and format as text context
 */
async function getProductContext(): Promise<string> {
    try {
        // Fetch products with category
        const { data: products, error: productsError } = await supabase
            .from('products')
            .select(`
                id, name, description, price, currency, image_url, is_active,
                category:product_categories(id, name, color)
            `)
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (productsError || !products || products.length === 0) {
            console.log('[ProductRAG] No products found');
            return '';
        }

        // Fetch all variations for these products
        const productIds = products.map(p => p.id);
        const { data: variations, error: variationsError } = await supabase
            .from('product_variations')
            .select(`
                id, product_id, value, price, is_active,
                variation_type:product_variation_types(id, name)
            `)
            .in('product_id', productIds)
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (variationsError) {
            console.error('[ProductRAG] Error fetching variations:', variationsError);
        }

        // Group variations by product
        const variationsByProduct: Record<string, typeof variations> = {};
        if (variations) {
            for (const v of variations) {
                const pid = v.product_id;
                if (!variationsByProduct[pid]) {
                    variationsByProduct[pid] = [];
                }
                variationsByProduct[pid].push(v);
            }
        }

        // Build formatted text
        let context = 'PRODUCT CATALOG:\n';

        products.forEach((product, index: number) => {
            const priceStr = product.price
                ? `₱${product.price.toLocaleString('en-PH')}`
                : 'Price varies';

            context += `\n${index + 1}. ${product.name} - ${priceStr}`;

            const category = Array.isArray(product.category) ? product.category[0] : product.category;
            if (category?.name) {
                context += `\n   Category: ${category.name}`;
            }

            if (product.description) {
                context += `\n   Description: ${product.description}`;
            }

            // Add variations
            const productVariations = variationsByProduct[product.id];
            if (productVariations && productVariations.length > 0) {
                context += `\n   Available Options:`;

                // Group by variation type
                const byType: Record<string, { value: string; price: number }[]> = {};
                for (const v of productVariations) {
                    const varType = Array.isArray(v.variation_type) ? v.variation_type[0] : v.variation_type;
                    const typeName = varType?.name || 'Option';
                    if (!byType[typeName]) {
                        byType[typeName] = [];
                    }
                    byType[typeName].push({ value: v.value, price: v.price });
                }

                for (const [typeName, options] of Object.entries(byType)) {
                    const optionsStr = options
                        .map(o => `${o.value}: ₱${o.price.toLocaleString('en-PH')}`)
                        .join(', ');
                    context += `\n   - ${typeName}: ${optionsStr}`;
                }
            }
        });

        console.log(`[ProductRAG] Built context for ${products.length} products`);
        return context;
    } catch (error) {
        console.error('[ProductRAG] Error building product context:', error);
        return '';
    }
}

/**
 * Fetch properties and format as text context
 */
async function getPropertyContext(): Promise<string> {
    try {
        const { data: properties, error } = await supabase
            .from('properties')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error || !properties || properties.length === 0) {
            console.log('[ProductRAG] No properties found');
            return '';
        }

        let context = 'PROPERTY LISTINGS:\n';

        properties.forEach((prop: Property, index: number) => {
            const priceStr = prop.price
                ? `₱${prop.price.toLocaleString('en-PH')}`
                : 'Price on request';

            context += `\n${index + 1}. ${prop.title} - ${priceStr}`;

            if (prop.property_type) {
                context += `\n   Type: ${prop.property_type}`;
            }

            if (prop.address) {
                context += `\n   Location: ${prop.address}`;
            }

            // Build details string
            const details: string[] = [];
            if (prop.bedrooms) details.push(`${prop.bedrooms} Bedroom${prop.bedrooms > 1 ? 's' : ''}`);
            if (prop.bathrooms) details.push(`${prop.bathrooms} Bathroom${prop.bathrooms > 1 ? 's' : ''}`);
            if (prop.sqft) details.push(`${prop.sqft.toLocaleString()} sqm`);
            if (prop.lot_area) details.push(`Lot: ${prop.lot_area.toLocaleString()} sqm`);
            if (prop.garage_spaces) details.push(`${prop.garage_spaces} Garage`);
            if (prop.year_built) details.push(`Built: ${prop.year_built}`);

            if (details.length > 0) {
                context += `\n   Details: ${details.join(', ')}`;
            }

            if (prop.status) {
                const statusDisplay = prop.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                context += `\n   Status: ${statusDisplay}`;
            }

            // Payment terms
            if (prop.down_payment || prop.monthly_amortization) {
                context += `\n   Payment Terms:`;
                if (prop.down_payment) {
                    context += ` Down Payment: ₱${prop.down_payment.toLocaleString('en-PH')}`;
                }
                if (prop.monthly_amortization) {
                    context += ` Monthly: ₱${prop.monthly_amortization.toLocaleString('en-PH')}`;
                }
                if (prop.payment_terms) {
                    context += ` (${prop.payment_terms})`;
                }
            }

            if (prop.description) {
                // Truncate long descriptions
                const desc = prop.description.length > 150
                    ? prop.description.substring(0, 150) + '...'
                    : prop.description;
                context += `\n   About: ${desc}`;
            }
        });

        console.log(`[ProductRAG] Built context for ${properties.length} properties`);
        return context;
    } catch (error) {
        console.error('[ProductRAG] Error building property context:', error);
        return '';
    }
}

/**
 * Fetch payment methods and format as text context
 */
async function getPaymentMethodContext(): Promise<string> {
    try {
        const { data: methods, error } = await supabase
            .from('payment_methods')
            .select('id, name, account_name, account_number, instructions, is_active')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (error || !methods || methods.length === 0) {
            console.log('[ProductRAG] No payment methods found');
            return '';
        }

        let context = 'PAYMENT METHODS:\n';

        methods.forEach((pm: PaymentMethod, index: number) => {
            context += `\n${index + 1}. ${pm.name}`;
            if (pm.account_name) {
                context += `\n   Account Name: ${pm.account_name}`;
            }
            if (pm.account_number) {
                context += `\n   Account/Number: ${pm.account_number}`;
            }
            if (pm.instructions) {
                context += `\n   Instructions: ${pm.instructions}`;
            }
        });

        console.log(`[ProductRAG] Built context for ${methods.length} payment methods`);
        return context;
    } catch (error) {
        console.error('[ProductRAG] Error building payment method context:', error);
        return '';
    }
}

/**
 * Get combined catalog context for AI with caching
 * Includes products, properties, and payment methods
 */
export async function getCatalogContext(): Promise<string> {
    const now = Date.now();

    // Return cached version if still valid
    if (cachedCatalogContext && (now - catalogCacheTimestamp) < CACHE_DURATION_MS) {
        console.log('[ProductRAG] Using cached catalog context');
        return cachedCatalogContext;
    }

    console.log('[ProductRAG] Building fresh catalog context...');

    // Fetch all contexts in parallel
    const [productContext, propertyContext, paymentContext] = await Promise.all([
        getProductContext(),
        getPropertyContext(),
        getPaymentMethodContext(),
    ]);

    // Combine contexts
    const parts: string[] = [];

    if (productContext) {
        parts.push(productContext);
    }

    if (propertyContext) {
        parts.push(propertyContext);
    }

    if (paymentContext) {
        parts.push(paymentContext);
    }

    if (parts.length === 0) {
        return '';
    }

    const combinedContext = parts.join('\n\n');

    // Cache the result
    cachedCatalogContext = combinedContext;
    catalogCacheTimestamp = now;

    console.log(`[ProductRAG] Catalog context built (${combinedContext.length} chars)`);
    return combinedContext;
}

/**
 * Invalidate the catalog cache (call when products/properties are updated)
 */
export function invalidateCatalogCache(): void {
    cachedCatalogContext = null;
    catalogCacheTimestamp = 0;
    console.log('[ProductRAG] Cache invalidated');
}
