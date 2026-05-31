-- Phase 2C: Union Station source type — additive enum value
DO $$ BEGIN
  ALTER TYPE source_type ADD VALUE 'union_station';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
