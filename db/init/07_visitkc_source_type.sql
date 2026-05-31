-- Phase 2B: Visit KC source type — additive enum value
DO $$ BEGIN
  ALTER TYPE source_type ADD VALUE 'visitkc';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
