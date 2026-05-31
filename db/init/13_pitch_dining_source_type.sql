DO $$ BEGIN
  ALTER TYPE source_type ADD VALUE 'pitch_dining';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
