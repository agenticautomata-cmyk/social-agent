DO $$ BEGIN
  ALTER TYPE source_type ADD VALUE 'kc_library';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
