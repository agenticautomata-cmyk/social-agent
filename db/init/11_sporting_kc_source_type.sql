-- Phase 2E: Sporting KC source type — additive enum value
DO $$ BEGIN
  ALTER TYPE source_type ADD VALUE 'sporting_kc';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
