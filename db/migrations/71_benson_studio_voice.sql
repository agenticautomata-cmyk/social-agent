-- Benson Studio Voice (Voicebox) — Ask Benson speech playback

CREATE TABLE IF NOT EXISTS voice_settings (
  creator_id uuid PRIMARY KEY REFERENCES creator_accounts(id) ON DELETE CASCADE,
  voice_mode text NOT NULL DEFAULT 'studio'
    CHECK (voice_mode IN ('studio', 'device', 'text_only')),
  voicebox_profile_id text,
  auto_play text NOT NULL DEFAULT 'off'
    CHECK (auto_play IN ('off', 'short_only', 'all')),
  playback_speed numeric(4, 2) NOT NULL DEFAULT 1.0
    CHECK (playback_speed IN (0.75, 1.0, 1.25, 1.5)),
  long_answer_mode text NOT NULL DEFAULT 'ask'
    CHECK (long_answer_mode IN ('full', 'summary', 'ask')),
  fallback_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS voice_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  message_id uuid REFERENCES benson_chat_messages(id) ON DELETE SET NULL,
  creator_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  voice_profile text NOT NULL,
  engine text NOT NULL,
  text_hash text NOT NULL,
  spoken_text text NOT NULL,
  speech_transform_version integer NOT NULL DEFAULT 1,
  playback_speed numeric(4, 2) NOT NULL DEFAULT 1.0,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued', 'preparing', 'generating', 'normalizing', 'complete',
      'failed', 'cancelled', 'expired'
    )),
  queue_timestamp timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  sanitized_error text,
  generated_audio_id uuid,
  duration_seconds numeric(10, 3),
  model_version text,
  chunk_index integer NOT NULL DEFAULT 0,
  chunk_total integer NOT NULL DEFAULT 1,
  voicebox_generation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_jobs_dedup
  ON voice_generation_jobs (message_id, text_hash, voice_profile, engine, playback_speed, speech_transform_version, chunk_index)
  WHERE status NOT IN ('failed', 'cancelled', 'expired');

CREATE INDEX IF NOT EXISTS idx_voice_jobs_status_queue
  ON voice_generation_jobs (status, queue_timestamp);

CREATE INDEX IF NOT EXISTS idx_voice_jobs_creator_message
  ON voice_generation_jobs (creator_id, message_id, created_at DESC);

CREATE TABLE IF NOT EXISTS generated_voice_audio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES benson_chat_messages(id) ON DELETE SET NULL,
  creator_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  job_id uuid REFERENCES voice_generation_jobs(id) ON DELETE SET NULL,
  text_hash text NOT NULL,
  voice_profile text NOT NULL,
  engine text NOT NULL,
  model_version text,
  speech_transform_version integer NOT NULL DEFAULT 1,
  playback_speed numeric(4, 2) NOT NULL DEFAULT 1.0,
  duration_seconds numeric(10, 3),
  file_format text NOT NULL,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  original_peak_db numeric(8, 3),
  normalized_peak_db numeric(8, 3),
  chunk_index integer NOT NULL DEFAULT 0,
  chunk_total integer NOT NULL DEFAULT 1,
  generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_played_at timestamptz,
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_voice_audio_cache
  ON generated_voice_audio (message_id, text_hash, voice_profile, engine, speech_transform_version, playback_speed, chunk_index)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_generated_voice_audio_expires
  ON generated_voice_audio (expires_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS voice_service_health (
  id text PRIMARY KEY DEFAULT 'default',
  service_status text NOT NULL DEFAULT 'unavailable'
    CHECK (service_status IN ('healthy', 'warming', 'degraded', 'unavailable', 'restarting')),
  model_status text NOT NULL DEFAULT 'not_installed'
    CHECK (model_status IN ('not_installed', 'downloading', 'loading', 'ready', 'failed')),
  queue_status text NOT NULL DEFAULT 'healthy'
    CHECK (queue_status IN ('healthy', 'delayed', 'blocked')),
  active_engine text,
  model_version text,
  voicebox_profile_id text,
  voicebox_upstream_tag text,
  voicebox_upstream_commit text,
  last_heartbeat timestamptz,
  last_successful_generation timestamptz,
  last_failed_generation timestamptz,
  average_generation_ms integer,
  current_queue_depth integer NOT NULL DEFAULT 0,
  sanitized_latest_error text,
  generation_paused boolean NOT NULL DEFAULT false,
  storage_bytes bigint NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO voice_service_health (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

INSERT INTO benson_data_revisions (domain, revision)
VALUES ('voice', 1)
ON CONFLICT (domain) DO NOTHING;
