-- Phase 2B: Crossroads source type — additive enum value
DO $$ BEGIN
  ALTER TYPE source_type ADD VALUE 'crossroads';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
