-- Phase 2D: Kauffman Center source type — additive enum value
DO $$ BEGIN
  ALTER TYPE source_type ADD VALUE 'kauffman';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
