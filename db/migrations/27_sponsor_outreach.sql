-- Phase A: Sponsor outreach — CRM, media kits, templates, demo simulated sends

DO $$ BEGIN
  CREATE TYPE sponsor_contact_status AS ENUM (
    'lead',
    'ready_to_contact',
    'scheduled',
    'sent',
    'replied',
    'follow_up_needed',
    'not_interested',
    'converted'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE outreach_email_status AS ENUM (
    'draft',
    'needs_approval',
    'scheduled',
    'simulated_sent',
    'failed',
    'canceled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE outreach_send_attempt_status AS ENUM (
    'simulated',
    'failed',
    'canceled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS sponsor_contacts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name         TEXT NOT NULL,
  contact_name          TEXT,
  email                 TEXT,
  phone                 TEXT,
  website               TEXT,
  instagram             TEXT,
  tiktok                TEXT,
  category              TEXT,
  notes                 TEXT,
  sponsor_fit_score     NUMERIC(4, 3),
  source_opportunity_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  status                sponsor_contact_status NOT NULL DEFAULT 'lead',
  last_contacted_at     TIMESTAMPTZ,
  next_follow_up_at     TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_contacts_status ON sponsor_contacts (status);
CREATE INDEX IF NOT EXISTS idx_sponsor_contacts_source ON sponsor_contacts (source_opportunity_id)
  WHERE source_opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sponsor_contacts_business ON sponsor_contacts (business_name);

CREATE TABLE IF NOT EXISTS media_kits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT,
  target_audience  TEXT,
  file_url         TEXT,
  version          TEXT NOT NULL DEFAULT '1.0',
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_kits_active ON media_kits (active);

CREATE TABLE IF NOT EXISTS email_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  type       TEXT NOT NULL UNIQUE,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outreach_emails (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_contact_id UUID NOT NULL REFERENCES sponsor_contacts(id) ON DELETE CASCADE,
  media_kit_id       UUID REFERENCES media_kits(id) ON DELETE SET NULL,
  template_id        UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  subject            TEXT NOT NULL DEFAULT '',
  body               TEXT NOT NULL DEFAULT '',
  scheduled_send_at  TIMESTAMPTZ,
  status             outreach_email_status NOT NULL DEFAULT 'draft',
  approval_required  BOOLEAN NOT NULL DEFAULT TRUE,
  approved_at        TIMESTAMPTZ,
  previewed_at       TIMESTAMPTZ,
  sent_at            TIMESTAMPTZ,
  failure_reason     TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_emails_status ON outreach_emails (status);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_scheduled ON outreach_emails (scheduled_send_at)
  WHERE scheduled_send_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_emails_contact ON outreach_emails (sponsor_contact_id);

CREATE TABLE IF NOT EXISTS outreach_send_attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_email_id UUID NOT NULL REFERENCES outreach_emails(id) ON DELETE CASCADE,
  attempted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status            outreach_send_attempt_status NOT NULL,
  provider          TEXT NOT NULL DEFAULT 'demo',
  error_message     TEXT
);

CREATE INDEX IF NOT EXISTS idx_outreach_send_attempts_email ON outreach_send_attempts (outreach_email_id);

-- Default email templates
INSERT INTO email_templates (name, type, subject, body) VALUES
(
  'Introduction',
  'introduction',
  'Kansas City content partnership — {{business_name}}',
  E'Hi {{contact_name}},\n\nI''m {{kellie_name}}, a Kansas City creator sharing local dining, events, and lifestyle with an engaged KC audience.\n\nI came across {{business_name}} and think there''s a natural fit for a content partnership. {{benson_recommendation}}\n\nWould you be open to a quick conversation about how we might collaborate?\n\nBest,\n{{kellie_name}}'
),
(
  'Media Kit Send',
  'media_kit_send',
  'Media kit — {{business_name}} × {{kellie_name}} KC',
  E'Hi {{contact_name}},\n\nThanks for your time! As promised, here''s my media kit for {{business_name}}.\n\n{{media_kit_name}}\n{{media_kit_url}}\n\nMy audience loves {{category}} content in Kansas City, and I''d love to explore a partnership.\n\n{{benson_recommendation}}\n\nBest,\n{{kellie_name}}'
),
(
  'Follow Up',
  'follow_up',
  'Following up — {{business_name}}',
  E'Hi {{contact_name}},\n\nI wanted to follow up on my note about partnering with {{business_name}}.\n\n{{benson_recommendation}}\n\nHappy to jump on a quick call if helpful.\n\nBest,\n{{kellie_name}}'
),
(
  'World Cup Pitch',
  'world_cup',
  'World Cup in KC — {{business_name}}',
  E'Hi {{contact_name}},\n\nWith the World Cup coming to Kansas City, local businesses like {{business_name}} have a huge moment to capture soccer fans and visitors.\n\n{{benson_recommendation}}\n\nI''d love to pitch a World Cup-themed content angle for your {{category}} brand.\n\nBest,\n{{kellie_name}}'
),
(
  'Luxury / Date Night Pitch',
  'luxury_date_night',
  'Date night audience in KC — {{business_name}}',
  E'Hi {{contact_name}},\n\nI create date-night and luxury lifestyle content for Kansas City couples — and {{business_name}} looks like a perfect fit.\n\n{{benson_recommendation}}\n\nWould you be interested in exploring a sponsored feature or experience collaboration?\n\nBest,\n{{kellie_name}}'
),
(
  'Restaurant Opening Pitch',
  'restaurant_opening',
  'Grand opening coverage — {{business_name}}',
  E'Hi {{contact_name}},\n\nCongratulations on {{business_name}}! I cover restaurant openings and dining discoveries across KC for an engaged local food audience.\n\n{{benson_recommendation}}\n\nI''d love to discuss opening-week coverage or a partnership.\n\nBest,\n{{kellie_name}}'
),
(
  'Shopping / Retail Pitch',
  'shopping_retail',
  'Local shopping audience — {{business_name}}',
  E'Hi {{contact_name}},\n\nI highlight shopping, retail, and local finds for Kansas City viewers — and {{business_name}} caught my eye.\n\n{{benson_recommendation}}\n\nOpen to chatting about a retail feature or market-day collaboration?\n\nBest,\n{{kellie_name}}'
)
ON CONFLICT (type) DO NOTHING;
