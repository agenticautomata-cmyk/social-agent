-- Multi-account-per-platform routing.
--
-- Schema already lets a campaign have N publishing_targets; previously the
-- scheduler always fanned out to every active target. These columns let the
-- operator choose a routing strategy.

ALTER TABLE publishing_targets
  ADD COLUMN IF NOT EXISTS weight INT NOT NULL DEFAULT 1 CHECK (weight > 0),
  ADD COLUMN IF NOT EXISTS posts_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- Per-campaign routing strategy. 'all' (default) preserves prior fan-out behavior.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'route_strategy') THEN
    CREATE TYPE route_strategy AS ENUM ('all', 'round_robin', 'weighted');
  END IF;
END $$;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS route_strategy route_strategy NOT NULL DEFAULT 'all';
