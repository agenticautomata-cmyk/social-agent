-- Media kit device uploads — file metadata columns

ALTER TABLE media_kits ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE media_kits ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE media_kits ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE media_kits ADD COLUMN IF NOT EXISTS storage_filename TEXT;
