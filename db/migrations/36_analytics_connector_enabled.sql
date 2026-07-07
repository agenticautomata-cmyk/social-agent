-- Operator toggles for analytics connectors (e.g. Meta off until business accounts exist)

ALTER TABLE analytics_connectors
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;

UPDATE analytics_connectors
SET enabled = false
WHERE provider IN ('facebook', 'instagram', 'youtube');
