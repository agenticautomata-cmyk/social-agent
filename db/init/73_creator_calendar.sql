-- Creator operations calendar + opt-in Google Calendar sync.

DO $$ BEGIN
  CREATE TYPE calendar_item_type AS ENUM (
    'public_event',
    'content_filming',
    'content_posting',
    'sponsor_outreach',
    'creator_task',
    'early_signal',
    'personal_busy'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE calendar_planning_status AS ENUM (
    'suggested',
    'tentative',
    'confirmed',
    'completed',
    'missed',
    'cancelled',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE calendar_sync_status AS ENUM (
    'benson_only',
    'ready_to_export',
    'syncing',
    'synced',
    'update_available',
    'sync_failed',
    'google_auth_required',
    'removed_from_google'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS creator_calendar_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  item_type calendar_item_type NOT NULL DEFAULT 'public_event',
  source_record_type text,
  source_record_id uuid,
  source_url text,
  internal_detail_url text,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'America/Chicago',
  location text,
  latitude numeric,
  longitude numeric,
  status calendar_planning_status NOT NULL DEFAULT 'tentative',
  planning_status calendar_planning_status NOT NULL DEFAULT 'tentative',
  creator_action text,
  reminder_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_format text,
  verified_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  unverified_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  travel_minutes integer,
  created_by text NOT NULL DEFAULT 'kellie',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  missed_at timestamptz,
  expired_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_creator_calendar_items_start
  ON creator_calendar_items (start_at);

CREATE INDEX IF NOT EXISTS idx_creator_calendar_items_status_start
  ON creator_calendar_items (planning_status, start_at);

CREATE INDEX IF NOT EXISTS idx_creator_calendar_items_source
  ON creator_calendar_items (source_record_type, source_record_id);

CREATE TABLE IF NOT EXISTS google_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'disconnected',
  selected_calendar_id text,
  selected_calendar_name text,
  dedicated_calendar_id text,
  dedicated_calendar_name text,
  availability_enabled boolean NOT NULL DEFAULT false,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_successful_sync_at timestamptz,
  last_failed_sync_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_sync_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_item_id uuid NOT NULL REFERENCES creator_calendar_items(id) ON DELETE CASCADE,
  google_calendar_id text NOT NULL,
  google_event_id text,
  payload_hash text,
  sync_status calendar_sync_status NOT NULL DEFAULT 'benson_only',
  auto_update_enabled boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  last_google_modified_at timestamptz,
  last_error text,
  retry_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (calendar_item_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_google_event
  ON calendar_sync_records (google_event_id)
  WHERE google_event_id IS NOT NULL;

INSERT INTO benson_data_revisions (domain, revision)
VALUES ('calendar', 1)
ON CONFLICT (domain) DO NOTHING;
