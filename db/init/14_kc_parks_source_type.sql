DO $$ BEGIN
  ALTER TYPE source_type ADD VALUE 'kc_parks';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
