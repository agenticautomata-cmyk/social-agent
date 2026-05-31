DO $$ BEGIN
  ALTER TYPE source_type ADD VALUE 'first_fridays';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
