-- ============================================================================
-- FIX: Add 'video_link' to digital_product_media media_type constraint
-- This allows external video links (YouTube, Loom, Vimeo) to be stored
-- ============================================================================

-- Drop the existing constraint
ALTER TABLE digital_product_media 
DROP CONSTRAINT IF EXISTS digital_product_media_media_type_check;

-- Add the updated constraint with video_link option
ALTER TABLE digital_product_media 
ADD CONSTRAINT digital_product_media_media_type_check 
CHECK (media_type IN ('image', 'video', 'video_link'));

-- Add comment for documentation
COMMENT ON COLUMN digital_product_media.media_type IS 'Media type: image (uploaded image), video (uploaded video), or video_link (external URL like YouTube, Loom, Vimeo)';

SELECT 'video_link media type added successfully!' as result;
