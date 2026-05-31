DO $$ BEGIN
  ALTER TYPE source_type ADD VALUE 'restaurant_week';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
