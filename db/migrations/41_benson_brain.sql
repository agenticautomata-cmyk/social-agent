-- Benson brain — creator preferences (learned from chat), TikTok progress briefs,
-- and source proposals (web-research suggested feeds / replacement URLs).

-- Single-row global preferences (single-creator pre-alpha).
CREATE TABLE IF NOT EXISTS creator_preferences (
  id                  TEXT PRIMARY KEY DEFAULT 'global',
  excluded_categories TEXT[] NOT NULL DEFAULT '{}',
  category_notes      JSONB NOT NULL DEFAULT '{}'::jsonb,
  preference_log      JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO creator_preferences (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;

-- TikTok pulse: progress briefs generated when fresh sync shows meaningful change.
CREATE TABLE IF NOT EXISTS benson_progress_briefs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id     UUID NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot_hash  TEXT NOT NULL,
  snapshot       JSONB NOT NULL DEFAULT '{}'::jsonb,
  delta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  brief          JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_usage    JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_cost NUMERIC(12, 6) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_benson_progress_briefs_creator_created
  ON benson_progress_briefs (creator_id, created_at DESC);

-- Source proposals: new sources discovered via upload enrichment, or
-- replacement URLs suggested for broken feeds. Operator approves manually.
CREATE TABLE IF NOT EXISTS source_proposals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT NOT NULL CHECK (kind IN ('new_source', 'replacement_url')),
  source_id  UUID REFERENCES sources(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  url        TEXT NOT NULL,
  rationale  TEXT,
  status     TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'dismissed')),
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_proposals_url_kind
  ON source_proposals (kind, url);

CREATE INDEX IF NOT EXISTS idx_source_proposals_status
  ON source_proposals (status, created_at DESC);
