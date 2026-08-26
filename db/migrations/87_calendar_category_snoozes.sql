-- Calendar operator attention filter: snooze an entire event category
-- (e.g. estate sales) without dismissing individual events or writing
-- Discover taste preferences. `until` NULL means until the operator wakes it.

CREATE TABLE IF NOT EXISTS calendar_category_snoozes (
  category_key text PRIMARY KEY,
  label text NOT NULL,
  until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
