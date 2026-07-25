-- Phase 1A: opportunity location resolution fields on content_items
-- Reuses existing location_name, location_lat, location_lng for display name and coordinates.

ALTER TABLE content_items ADD COLUMN IF NOT EXISTS location_status TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS google_place_id TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS formatted_address TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS google_maps_url TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS location_website_url TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS location_confidence NUMERIC(4, 3);
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS location_source TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS location_candidates JSONB;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS location_verified_at TIMESTAMPTZ;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS location_resolution_error TEXT;

CREATE INDEX IF NOT EXISTS idx_content_location_status ON content_items (location_status);
