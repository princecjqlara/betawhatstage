import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Determine resource type based on file mime type
function getResourceType(mimeType: string): 'image' | 'video' | 'raw' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) return 'video';
    return 'raw'; // For documents, PDFs, etc.
}

// Determine attachment type for Messenger
function getAttachmentType(mimeType: string): 'image' | 'video' | 'audio' | 'file' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'file';
}

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const folder = (formData.get('folder') as string) || 'workflow-attachments';

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const mimeType = file.type || 'application/octet-stream';
        const resourceType = getResourceType(mimeType);
        const attachmentType = getAttachmentType(mimeType);

        // Convert file to base64
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = buffer.toString('base64');
        const dataURI = `data:${mimeType};base64,${base64}`;

        // Upload to Cloudinary with appropriate resource type
        const result = await cloudinary.uploader.upload(dataURI, {
            folder: folder,
            resource_type: resourceType,
            // For raw files, preserve the original filename
            ...(resourceType === 'raw' && {
                use_filename: true,
                unique_filename: true,
            }),
        });

        return NextResponse.json({
            success: true,
            url: result.secure_url,
            public_id: result.public_id,
            resource_type: resourceType,
            attachment_type: attachmentType,
            file_name: file.name,
            mime_type: mimeType,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: 'Failed to upload file' },
            { status: 500 }
        );
    }
}
