-- Analytics ingestion — daily metrics snapshots per publication.

CREATE TABLE post_metrics (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  publication_id      UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,

  -- Snapshot point
  fetched_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  hours_since_post    INT NOT NULL,

  -- Standardized metrics across platforms
  views               INT NOT NULL DEFAULT 0,
  likes               INT NOT NULL DEFAULT 0,
  comments            INT NOT NULL DEFAULT 0,
  shares              INT NOT NULL DEFAULT 0,
  saves               INT NOT NULL DEFAULT 0,
  reach               INT NOT NULL DEFAULT 0,
  watch_time_seconds  INT NOT NULL DEFAULT 0,

  -- Computed
  engagement_rate     NUMERIC(6,4) NOT NULL DEFAULT 0, -- (likes+comments+shares+saves)/views

  raw                 JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_post_metrics_publication ON post_metrics(publication_id, hours_since_post);
CREATE INDEX idx_post_metrics_fetched     ON post_metrics(fetched_at DESC);

-- Topic-level performance — used by the planner to bias future content selection.
-- Row exists per (campaign, industry, content_type) and is updated incrementally
-- as new posts and metrics arrive.

CREATE TABLE topic_performance (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id              UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  industry_id              UUID REFERENCES industries(id) ON DELETE CASCADE,
  content_type             content_type NOT NULL,
  language                 language_code NOT NULL DEFAULT 'en',

  posts                    INT NOT NULL DEFAULT 0,
  total_views              BIGINT NOT NULL DEFAULT 0,
  total_engagement         BIGINT NOT NULL DEFAULT 0,
  avg_engagement_rate      NUMERIC(6,4) NOT NULL DEFAULT 0,

  -- Multiplier the planner applies to the industry's base weight when picking
  -- next-week slots. Recomputed when metrics roll in.
  planner_weight_modifier  NUMERIC(4,2) NOT NULL DEFAULT 1.00,

  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (campaign_id, industry_id, content_type, language)
);

CREATE INDEX idx_topic_perf_lookup ON topic_performance(campaign_id, industry_id);
