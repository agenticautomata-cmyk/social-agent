-- Closed-loop outcome engine, shoot sessions, worker heartbeats

CREATE TABLE IF NOT EXISTS benson_recommendation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  planner_item_id uuid REFERENCES planner_items(id) ON DELETE SET NULL,
  operator_recommendation_id uuid,
  confidence numeric(5, 4),
  rationale text,
  category text,
  user_response text,
  response_reason text,
  responded_at timestamptz,
  shoot_session_id uuid,
  outcome_link_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_benson_recommendation_events_created
  ON benson_recommendation_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_benson_recommendation_events_content
  ON benson_recommendation_events (content_item_id);
CREATE INDEX IF NOT EXISTS idx_benson_recommendation_events_response
  ON benson_recommendation_events (user_response, created_at DESC);

CREATE TABLE IF NOT EXISTS shoot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  completion_reason text,
  content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  sponsor_contact_id uuid REFERENCES sponsor_contacts(id) ON DELETE SET NULL,
  location_label text,
  location_lat numeric(10, 7),
  location_lng numeric(10, 7),
  content_format text,
  shot_index integer NOT NULL DEFAULT 0,
  shots jsonb NOT NULL DEFAULT '[]'::jsonb,
  talking_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  voice_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  media_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  sponsor_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  disclosure_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome_link_id uuid
);

CREATE INDEX IF NOT EXISTS idx_shoot_sessions_status_started
  ON shoot_sessions (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_shoot_sessions_content
  ON shoot_sessions (content_item_id);

CREATE TABLE IF NOT EXISTS content_outcome_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  recommendation_event_id uuid REFERENCES benson_recommendation_events(id) ON DELETE SET NULL,
  shoot_session_id uuid REFERENCES shoot_sessions(id) ON DELETE SET NULL,
  intake_submission_id uuid REFERENCES share_intake_submissions(id) ON DELETE SET NULL,
  draft_asset_id uuid REFERENCES creator_draft_assets(id) ON DELETE SET NULL,
  creator_video_id uuid REFERENCES creator_videos(id) ON DELETE SET NULL,
  sponsor_contact_id uuid REFERENCES sponsor_contacts(id) ON DELETE SET NULL,
  outreach_email_id uuid,
  pipeline_opportunity_id uuid,
  link_confidence numeric(5, 4) NOT NULL DEFAULT 1.0,
  link_source text NOT NULL DEFAULT 'auto',
  outcome_score numeric(8, 4),
  outcome_classification text,
  revenue_recognized numeric(12, 2),
  deal_value numeric(12, 2),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_content_outcome_links_created
  ON content_outcome_links (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_outcome_links_content
  ON content_outcome_links (content_item_id);
CREATE INDEX IF NOT EXISTS idx_content_outcome_links_classification
  ON content_outcome_links (outcome_classification);

CREATE TABLE IF NOT EXISTS content_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  outcome_link_id uuid NOT NULL REFERENCES content_outcome_links(id) ON DELETE CASCADE,
  creator_video_id uuid REFERENCES creator_videos(id) ON DELETE SET NULL,
  snapshot_kind text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  views integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  saves integer,
  followers_gained integer,
  engagement_rate numeric(8, 6),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_content_performance_snapshots_outcome_kind
  ON content_performance_snapshots (outcome_link_id, snapshot_kind);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id text PRIMARY KEY,
  display_name text NOT NULL,
  schedule_label text,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'unknown',
  last_heartbeat_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_summary text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_duration_ms integer,
  queue_depth integer,
  retry_count integer NOT NULL DEFAULT 0,
  current_job text,
  next_scheduled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id text NOT NULL REFERENCES worker_heartbeats(worker_id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  duration_ms integer,
  error_summary text,
  retry_count integer NOT NULL DEFAULT 0,
  trigger text NOT NULL DEFAULT 'scheduled',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_worker_job_runs_worker_started
  ON worker_job_runs (worker_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_job_runs_status
  ON worker_job_runs (status, started_at DESC);

INSERT INTO worker_heartbeats (worker_id, display_name, schedule_label, enabled, status)
VALUES
  ('benson-pulse', 'Benson Pulse', 'every 4h', true, 'unknown'),
  ('tiktok-token-refresh', 'TikTok token refresh', 'every 15m', true, 'unknown'),
  ('milestone-watch', 'Milestone watch', 'every 15m', true, 'unknown'),
  ('opportunity-refresh', 'Opportunity refresh', 'every 6h', true, 'unknown'),
  ('source-health', 'Source health', 'every 24h', true, 'unknown'),
  ('expired-event-sweep', 'Expired event sweep', 'every 24h', true, 'unknown'),
  ('benson-learning', 'Benson Learning', 'every 6h', true, 'unknown'),
  ('benson-discovery', 'Benson Discovery', 'every 12h', true, 'unknown'),
  ('outreach-dispatch', 'Outreach dispatch', 'poll', true, 'unknown'),
  ('benson-outreach-drafting', 'Outreach drafting', 'poll', true, 'unknown'),
  ('outreach-follow-up', 'Outreach follow-up', 'poll', true, 'unknown'),
  ('gmail-inbox-sync', 'Gmail inbox sync', 'poll', true, 'unknown'),
  ('gmail-inbox-digest', 'Gmail digest', 'poll', true, 'unknown'),
  ('gmail-discovery-sync', 'Gmail discovery sync', 'poll', true, 'unknown'),
  ('share-intake-media', 'Share intake media', 'poll', true, 'unknown'),
  ('unposted-draft-intelligence', 'Unposted draft intelligence', 'poll', true, 'unknown')
ON CONFLICT (worker_id) DO NOTHING;
