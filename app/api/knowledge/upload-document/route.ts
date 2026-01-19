import { NextResponse } from 'next/server';
import { parseDocument, chunkDocument, isFileTypeSupported, ChunkedDocument } from '@/app/lib/documentParserService';
import { addDocument } from '@/app/lib/rag';
import { createClient, getCurrentUserId } from '@/app/lib/supabaseServer';

/**
 * POST /api/knowledge/upload-document
 * 
 * Handles document file uploads (PDF, TXT, MD)
 * Parses content, chunks it, and stores in knowledge base
 */
export async function POST(req: Request) {
    try {
        // Get current user for authentication
        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const supabase = await createClient();

        const formData = await req.formData();
        const file = formData.get('file') as File;
        const categoryId = formData.get('categoryId') as string | null;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        // Validate file type
        if (!isFileTypeSupported(file.name)) {
            return NextResponse.json(
                { error: 'Unsupported file type. Supported: PDF, TXT, MD' },
                { status: 400 }
            );
        }

        // Create document source record for tracking
        const { data: sourceRecord, error: sourceError } = await supabase
            .from('document_sources')
            .insert({
                original_filename: file.name,
                file_type: file.name.split('.').pop()?.toLowerCase(),
                file_size_bytes: file.size,
                status: 'processing',
                category_id: categoryId || null,
                user_id: userId,
            })
            .select()
            .single();

        if (sourceError) {
            console.error('[DocumentUpload] Error creating source record:', sourceError);
            // Continue without tracking if table doesn't exist yet
        }

        const sourceId = sourceRecord?.id;


        try {
            // Convert file to buffer
            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);

            // Parse the document
            const parsedDoc = await parseDocument(buffer, file.name);

            // Chunk the document
            const chunkedDoc: ChunkedDocument = chunkDocument(parsedDoc);

            console.log(`[DocumentUpload] Parsed ${file.name}: ${chunkedDoc.chunks.length} chunks`);

            // Store each chunk in the knowledge base
            let successCount = 0;
            for (let i = 0; i < chunkedDoc.chunks.length; i++) {
                const chunk = chunkedDoc.chunks[i];

                const success = await addDocument(chunk, {
                    categoryId: categoryId || undefined,
                    sourceType: 'file_upload',
                    userId: userId,
                });

                if (success) {
                    successCount++;
                }
            }

            // Update source record with success
            if (sourceId) {
                await supabase
                    .from('document_sources')
                    .update({
                        status: 'completed',
                        chunk_count: chunkedDoc.chunks.length,
                        page_count: chunkedDoc.metadata.pageCount,
                    })
                    .eq('id', sourceId);
            }

            return NextResponse.json({
                success: true,
                filename: file.name,
                pageCount: chunkedDoc.metadata.pageCount,
                chunkCount: chunkedDoc.chunks.length,
                chunksStored: successCount,
                sourceId,
            });

        } catch (parseError) {
            console.error('[DocumentUpload] Parse error:', parseError);

            // Update source record with error
            if (sourceId) {
                await supabase
                    .from('document_sources')
                    .update({
                        status: 'failed',
                        error_message: parseError instanceof Error ? parseError.message : 'Unknown error',
                    })
                    .eq('id', sourceId);
            }

            return NextResponse.json(
                { error: parseError instanceof Error ? parseError.message : 'Failed to parse document' },
                { status: 500 }
            );
        }

    } catch (error) {
        console.error('[DocumentUpload] Request error:', error);
        return NextResponse.json(
            { error: 'Failed to process upload request' },
            { status: 500 }
        );
    }
}
