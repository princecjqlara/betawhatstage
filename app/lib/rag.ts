import { supabase } from './supabase';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const EMBEDDING_MODEL = 'nvidia/nv-embedqa-e5-v5';

async function getEmbedding(text: string, inputType: 'query' | 'passage'): Promise<number[]> {
    const response = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: [text],
            input_type: inputType,
            encoding_format: 'float',
            truncate: 'END',
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Embedding error:', errorText);
        throw new Error(`Embedding API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addDocument(content: string, metadata: any = {}) {
    try {
        const categoryId = metadata.categoryId;

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const chunks = await splitter.createDocuments([content]);

        console.log(`[RAG] Adding document with ${chunks.length} chunks`);

        for (const chunk of chunks) {
            const embedding = await getEmbedding(chunk.pageContent, 'passage');

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const insertData: any = {
                content: chunk.pageContent,
                metadata: { ...metadata, ...chunk.metadata },
                embedding: embedding,
            };

            if (categoryId) {
                insertData.category_id = categoryId;
            }

            let { error } = await supabase.from('documents').insert(insertData);

            // Retry without category_id if column doesn't exist
            if (error && error.message?.includes('category_id')) {
                delete insertData.category_id;
                const retryResult = await supabase.from('documents').insert(insertData);
                error = retryResult.error;
            }

            if (error) {
                console.error('Error inserting chunk:', error);
                throw error;
            }

            console.log(`[RAG] Inserted: "${chunk.pageContent.substring(0, 50)}..."`);
        }

        return true;
    } catch (error) {
        console.error('Error adding document:', error);
        return false;
    }
}

// ... (add definition at the top or here if possible) 
// Actually I need to add the interface definition.
// I'll add it before searchDocuments

interface StoredDocument {
    id: number;
    content: string;
    metadata: Record<string, unknown>;
    embedding?: number[];
    source?: string;
}

/**
 * Simplified but RELIABLE retrieval
 * Strategy: 
 * 1. Always fetch recent documents (ensures FAQ data is always available)
 * 2. Also do semantic search
 * 3. Combine both for best coverage
 */
export async function searchDocuments(query: string, limit: number = 5) {
    try {
        console.log(`[RAG] Searching for: "${query}"`);

        // STRATEGY 1: Always get recent documents (ensures we have FAQ data)
        const { data: recentDocs, error: recentError } = await supabase
            .from('documents')
            .select('id, content, metadata')
            .order('id', { ascending: false })
            .limit(5);

        if (recentError) {
            console.error('Recent docs error:', recentError);
        }

        // STRATEGY 2: Semantic search with embedding
        let semanticDocs: StoredDocument[] = [];
        try {
            const queryEmbedding = await getEmbedding(query, 'query');

            const { data: matchedDocs, error: matchError } = await supabase.rpc('match_documents', {
                query_embedding: queryEmbedding,
                match_threshold: 0.20, // Very low threshold for maximum recall
                match_count: limit,
            });

            if (!matchError && matchedDocs) {
                semanticDocs = matchedDocs as StoredDocument[];
            }
        } catch (embError) {
            console.error('Embedding search failed:', embError);
        }

        // STRATEGY 3: Keyword search for price-related queries
        let keywordDocs: StoredDocument[] = [];
        const lowerQuery = query.toLowerCase();
        const isPriceQuery = lowerQuery.includes('price') ||
            lowerQuery.includes('cost') ||
            lowerQuery.includes('magkano') ||
            lowerQuery.includes('how much') ||
            lowerQuery.includes('hm') ||
            lowerQuery.includes('presyo');

        if (isPriceQuery) {
            const { data: priceDocs, error: priceError } = await supabase
                .from('documents')
                .select('id, content, metadata')
                .or('content.ilike,content.ilike.%price%,content.ilike.%payment%')
                .limit(5);

            if (!priceError && priceDocs) {
                keywordDocs = priceDocs as StoredDocument[];
            }
        }

        // Combine all results and deduplicate
        const allDocs: StoredDocument[] = [];
        const seenIds = new Set<number>();

        // Add semantic results first (highest relevance)
        for (const doc of semanticDocs) {
            if (!seenIds.has(doc.id)) {
                seenIds.add(doc.id);
                allDocs.push({ ...doc, source: 'semantic' });
            }
        }

        // Add keyword results for price queries
        for (const doc of keywordDocs) {
            if (!seenIds.has(doc.id)) {
                seenIds.add(doc.id);
                allDocs.push({ ...doc, source: 'keyword' });
            }
        }

        // Add recent docs as fallback
        for (const doc of (recentDocs || [])) {
            if (!seenIds.has(doc.id)) {
                seenIds.add(doc.id);
                allDocs.push({ ...doc, source: 'recent' });
            }
        }

        // Log results
        console.log(`[RAG] Found ${allDocs.length} documents`);
        allDocs.slice(0, 5).forEach((doc, i) => {
            console.log(`[RAG] Doc ${i + 1} [${doc.source}]: ${doc.content?.substring(0, 80)}...`);
        });

        if (allDocs.length === 0) {
            console.log('[RAG] No documents found');
            return '';
        }

        // Return combined content
        return allDocs
            .slice(0, limit)
            .map(doc => doc.content)
            .join('\n\n');

    } catch (error) {
        console.error('Error in RAG search:', error);
        // Last resort: just get any documents we have
        try {
            const { data: fallbackDocs } = await supabase
                .from('documents')
                .select('content')
                .limit(3);

            if (fallbackDocs && fallbackDocs.length > 0) {
                console.log('[RAG] Using fallback - returning all docs');
                return fallbackDocs.map(d => d.content).join('\n\n');
            }
        } catch (e) {
            console.error('Fallback also failed:', e);
        }
        return '';
    }
}
