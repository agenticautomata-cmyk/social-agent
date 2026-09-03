-- Hospitality creator-partnership contracts.
--
-- Purpose: replace inference with explicit, queryable state across the partnership
-- vertical. Before this migration there was no compensation model on a pitch at all,
-- contact quality was a single free-text `contact_verification_status`, the source
-- registry existed only as JSON on `creator_partnerships.metadata`, and every reply
-- ever received had a NULL `outreach_email_id`.
--
-- Entirely additive and idempotent. No column is dropped, no row is deleted. The
-- existing 167 outreach_emails / 152 sponsor_contacts / 114 creator_partnerships stay
-- exactly where they are; they gain a `quarantine_state` so weak and synthetic rows can
-- be kept out of Kellie's workflow without destroying the history.

-- ---------------------------------------------------------------------------
-- 1. CONTACT EVIDENCE MODEL
-- ---------------------------------------------------------------------------
-- Six states, no others. `inferred_unverified` and `unknown` can never be send-ready
-- (enforced in services/core/src/partnership-contracts/contact-evidence.ts).
DO $$ BEGIN
  CREATE TYPE contact_evidence_state AS ENUM (
    'verified_named_decision_maker',
    'verified_role_inbox',
    'official_general_inbox',
    'official_contact_form',
    'inferred_unverified',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The legitimate next path when no verified email exists. Never "nothing".
DO $$ BEGIN
  CREATE TYPE contact_next_path AS ENUM (
    'official_contact_form',
    'official_general_inbox',
    'phone',
    'named_person_needs_research',
    'official_social_account',
    'monitor_only'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE sponsor_contacts
  ADD COLUMN IF NOT EXISTS contact_evidence_state contact_evidence_state NOT NULL DEFAULT 'unknown',
  -- The role the named person actually holds, so Benson never pitches a
  -- restaurant-operations coordinator (e.g. KC Restaurant Week's menu contact) as if
  -- they were a media contact.
  ADD COLUMN IF NOT EXISTS contact_role text,
  -- Which business/property this contact genuinely represents. A brand PR lead assigned
  -- to Kansas City must not be silently reused for an unrelated property, and one
  -- business's generic inbox must never be reused for another.
  ADD COLUMN IF NOT EXISTS represents_business text,
  ADD COLUMN IF NOT EXISTS contact_form_url text,
  ADD COLUMN IF NOT EXISTS contact_phone_public text,
  ADD COLUMN IF NOT EXISTS official_social_url text,
  ADD COLUMN IF NOT EXISTS evidence_url text,
  ADD COLUMN IF NOT EXISTS evidence_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_is_official boolean,
  -- How the value was established: 'published_on_official_page', 'operator_supplied',
  -- 'reply_from_business', 'web_search_unverified'. Never a guessed pattern.
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS last_rechecked_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_conflict_note text,
  ADD COLUMN IF NOT EXISTS evidence_stale_note text,
  ADD COLUMN IF NOT EXISTS next_contact_path contact_next_path,
  ADD COLUMN IF NOT EXISTS next_contact_path_detail text,
  ADD COLUMN IF NOT EXISTS quarantine_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS quarantine_reason text,
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sponsor_contacts_evidence_state
  ON sponsor_contacts (contact_evidence_state);
CREATE INDEX IF NOT EXISTS idx_sponsor_contacts_quarantine
  ON sponsor_contacts (quarantine_state);

-- Append-only evidence log. Lets one contact carry several observations over time so
-- conflicting or stale evidence is visible rather than silently overwritten.
CREATE TABLE IF NOT EXISTS partnership_contact_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_contact_id uuid NOT NULL REFERENCES sponsor_contacts(id) ON DELETE CASCADE,
  evidence_kind text NOT NULL,
  observed_value text,
  person_name text,
  person_role text,
  represents_business text,
  evidence_url text,
  source_is_official boolean NOT NULL DEFAULT false,
  verification_method text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  conflict_note text,
  excerpt text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partnership_contact_evidence_contact
  ON partnership_contact_evidence (sponsor_contact_id);

-- Do-not-contact / wrong-purpose inbox registry. Code carries the permanent entries
-- (breakingnews@hilton.com); this table is for operator additions.
CREATE TABLE IF NOT EXISTS partnership_contact_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL,
  domain text,
  kind text NOT NULL DEFAULT 'do_not_contact',
  reason text NOT NULL,
  added_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partnership_contact_blocklist_address
  ON partnership_contact_blocklist (lower(address));

-- ---------------------------------------------------------------------------
-- 2. HOSPITALITY SOURCE REGISTRY
-- ---------------------------------------------------------------------------
-- Replaces the JSON-only registry in creator-partnership/partnership-sources.ts.
-- `health_state` defaults to 'unchecked': a source does not become healthy just
-- because a row exists.
CREATE TABLE IF NOT EXISTS partnership_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  name text NOT NULL,
  source_type text NOT NULL,
  -- first_party_property | brand_portfolio | management_company | dmo |
  -- state_tourism | trade_association | event_program
  portfolio_relationship text NOT NULL,
  represents_business text,
  extraction_target text NOT NULL,
  -- official_first_party | official_affiliated | third_party
  authority_level text NOT NULL,
  -- research_lead | supports_pitch
  lead_or_pitch text NOT NULL,
  -- kc_metro | kansas_side | missouri_side | national_with_kc_property |
  -- national_no_kc_property
  geographic_relevance text NOT NULL,
  -- weekly | monthly | quarterly | seasonal_escalating
  check_frequency text NOT NULL,
  freshness_policy text NOT NULL,
  -- False for sources whose silence is a normal state (Visit KC newsroom, Aparium).
  alert_on_silence boolean NOT NULL DEFAULT false,
  requires_playwright boolean NOT NULL DEFAULT false,
  -- allowed | disallowed | unverified. 'unverified' is an honest state, not a default lie.
  robots_status text NOT NULL DEFAULT 'unverified',
  robots_note text,
  crawl_delay_seconds integer,
  -- Source-specific outreach lead time in days. Visit KC 14, Kansas Tourism 60.
  -- Never generalized from one source to another.
  lead_time_days integer,
  tier integer NOT NULL DEFAULT 3,
  -- unchecked | healthy | dormant | structural_break | robots_refused |
  -- needs_browser | unreachable | disabled_not_applicable
  health_state text NOT NULL DEFAULT 'unchecked',
  health_explanation text,
  last_check_attempted_at timestamptz,
  last_successful_check_at timestamptz,
  next_scheduled_check_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partnership_sources_url ON partnership_sources (url);
CREATE INDEX IF NOT EXISTS idx_partnership_sources_health ON partnership_sources (health_state);
CREATE INDEX IF NOT EXISTS idx_partnership_sources_next_check
  ON partnership_sources (next_scheduled_check_at);

-- Provenance for every extracted fact. Nothing reaches a pitch without a row here.
CREATE TABLE IF NOT EXISTS partnership_source_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES partnership_sources(id) ON DELETE CASCADE,
  -- event | offer | contact | policy | property_opening | program_requirement |
  -- roster_member | collaboration_precedent | rights_term
  fact_kind text NOT NULL,
  fact_key text NOT NULL,
  fact_value jsonb NOT NULL,
  represents_business text,
  source_url text NOT NULL,
  excerpt text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partnership_source_facts_source
  ON partnership_source_facts (source_id, fact_kind);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partnership_source_facts_identity
  ON partnership_source_facts (source_id, fact_kind, fact_key)
  WHERE superseded_at IS NULL;

CREATE TABLE IF NOT EXISTS partnership_source_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES partnership_sources(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  -- success | dormant | robots_refused | structural_break | needs_browser |
  -- unreachable | error
  outcome text NOT NULL,
  facts_extracted integer NOT NULL DEFAULT 0,
  -- Plain English, safe to show an operator. Never a filesystem path or stack trace.
  operator_explanation text NOT NULL,
  http_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partnership_source_checks_source
  ON partnership_source_checks (source_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- 3. COMPENSATION MODEL + QUALIFIED OPPORTUNITY
-- ---------------------------------------------------------------------------
-- Exactly one explicit compensation state per opportunity. A discount is never
-- described as a gifted experience.
DO $$ BEGIN
  CREATE TYPE partnership_compensation_state AS ENUM (
    'cash',
    'cash_plus_hosted',
    'fully_hosted',
    'gift_card_or_credit',
    'discount_only',
    'unknown_requires_research'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE partnership_lifecycle_state AS ENUM (
    'researching',
    'blocked',
    'awaiting_approval',
    'approved',
    'sent',
    'delivered',
    'replied',
    'follow_up_due',
    'interested',
    'negotiating',
    'won',
    'declined',
    'no_response',
    'invalid_contact',
    'paused'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The qualified opportunity is the join between the two previously disconnected
-- tracks: creator-partnership research (real URL-based brand research, fit score) and
-- sponsor-outreach (the code that actually writes and sends a pitch).
CREATE TABLE IF NOT EXISTS partnership_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  property_name text,
  business_key text NOT NULL,
  -- kc_metro | kansas_side | missouri_side | out_of_market
  market text NOT NULL DEFAULT 'kc_metro',
  -- hosted_stay | hosted_meal | paid_ugc | event_coverage |
  -- influencer_program_application | media_visit_program | package_feature
  opportunity_kind text NOT NULL,

  source_id uuid REFERENCES partnership_sources(id) ON DELETE SET NULL,
  content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  creator_partnership_id uuid REFERENCES creator_partnerships(id) ON DELETE SET NULL,
  sponsor_contact_id uuid REFERENCES sponsor_contacts(id) ON DELETE SET NULL,
  relationship_id uuid,

  compensation_state partnership_compensation_state NOT NULL
    DEFAULT 'unknown_requires_research',
  -- What the business has ALREADY offered, in evidence. Separate from the ask.
  compensation_offered jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- What Benson recommends Kellie request. Never conflated with the above.
  compensation_requested jsonb NOT NULL DEFAULT '[]'::jsonb,
  compensation_note text,
  -- True when a gift card / credit does not reasonably cover the proposed experience.
  compensation_is_partial boolean NOT NULL DEFAULT false,

  -- The nine qualification answers, each with its own evidence.
  qualification jsonb NOT NULL DEFAULT '{}'::jsonb,
  qualification_score numeric(5,2),
  qualification_factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  unknowns jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  why_now text,
  pitch_concept jsonb,
  -- Terms Kellie should weigh but Benson must not decide for her — e.g. the Loews UGC
  -- rights flow granting a perpetual worldwide royalty-free licence with no obligation
  -- to use.
  terms_to_weigh jsonb NOT NULL DEFAULT '[]'::jsonb,

  lifecycle_state partnership_lifecycle_state NOT NULL DEFAULT 'researching',
  send_ready boolean NOT NULL DEFAULT false,
  blocked_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  outreach_email_id uuid REFERENCES outreach_emails(id) ON DELETE SET NULL,

  surfaced_to_kellie_at timestamptz,
  last_evaluated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partnership_opportunities_lifecycle
  ON partnership_opportunities (lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_partnership_opportunities_business
  ON partnership_opportunities (business_key);
CREATE INDEX IF NOT EXISTS idx_partnership_opportunities_score
  ON partnership_opportunities (qualification_score DESC NULLS LAST);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partnership_opportunities_identity
  ON partnership_opportunities (business_key, opportunity_kind, COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------------
-- 4. RELATIONSHIP MEMORY + PERSISTED CORRECTIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partnership_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_key text NOT NULL,
  business_name text NOT NULL,
  property_name text,
  first_contacted_at timestamptz,
  last_contacted_at timestamptz,
  last_reply_at timestamptz,
  contact_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  pitch_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  compensation_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_delivered jsonb NOT NULL DEFAULT '[]'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- NULL means Kellie has not said. Benson must not assume yes.
  approach_again boolean,
  approach_again_note text,
  promises text,
  restrictions text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partnership_relationships_business_key
  ON partnership_relationships (business_key);

-- Corrections must persist and must change future work. This is a durable override
-- table, not a learning model: every row states exactly which field it overrides.
CREATE TABLE IF NOT EXISTS partnership_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- contact | relationship | compensation | pitch_preference | business_identity
  subject_kind text NOT NULL,
  business_key text,
  subject_id uuid,
  field text NOT NULL,
  previous_value jsonb,
  corrected_value jsonb,
  correction_note text,
  corrected_by text NOT NULL DEFAULT 'operator',
  corrected_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partnership_corrections_lookup
  ON partnership_corrections (subject_kind, business_key, field)
  WHERE active;

-- ---------------------------------------------------------------------------
-- 5. BACKLOG QUARANTINE + APPROVAL/SEND HARDENING
-- ---------------------------------------------------------------------------
-- The backlog is kept, not deleted. `quarantine_state` decides whether a row may
-- appear in Kellie's primary workflow (Today, Home, Pitches default view, Telegram,
-- email approvals). Quarantined rows stay viewable deliberately.
ALTER TABLE outreach_emails
  ADD COLUMN IF NOT EXISTS quarantine_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS quarantine_reason text,
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz,
  ADD COLUMN IF NOT EXISTS partnership_opportunity_id uuid
    REFERENCES partnership_opportunities(id) ON DELETE SET NULL,
  -- Approval identity + content hash: after approval, exactly the reviewed version
  -- must go to exactly the reviewed recipient.
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_content_hash text,
  ADD COLUMN IF NOT EXISTS approved_recipient text,
  ADD COLUMN IF NOT EXISTS sent_content_hash text,
  ADD COLUMN IF NOT EXISTS sent_recipient text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS follow_up_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compensation_state partnership_compensation_state;

CREATE INDEX IF NOT EXISTS idx_outreach_emails_quarantine
  ON outreach_emails (quarantine_state);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_opportunity
  ON outreach_emails (partnership_opportunity_id);
-- Database-level duplicate-send guard. The same body cannot be delivered to the same
-- contact twice, which is exactly the bug that produced two identical "Art-hotel
-- staycation collaboration" Gmail sends six days apart. Application-level checks in
-- send.ts run first; this index is the backstop.
DROP INDEX IF EXISTS idx_outreach_emails_one_real_send;
CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_emails_sent_content_unique
  ON outreach_emails (sponsor_contact_id, sent_content_hash)
  WHERE sent_content_hash IS NOT NULL;

ALTER TABLE creator_partnerships
  ADD COLUMN IF NOT EXISTS quarantine_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS quarantine_reason text,
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz,
  ADD COLUMN IF NOT EXISTS partnership_opportunity_id uuid
    REFERENCES partnership_opportunities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_creator_partnerships_quarantine
  ON creator_partnerships (quarantine_state);

-- Reply linkage. All 14 inbound messages currently have a NULL outreach_email_id, so
-- 100% of replies are unattributed. These columns let a reply bind to the correct
-- business AND opportunity even when the Gmail thread id is missing.
ALTER TABLE outreach_inbound_messages
  ADD COLUMN IF NOT EXISTS partnership_opportunity_id uuid
    REFERENCES partnership_opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS matched_business_key text,
  -- thread_id | provider_message_id | from_address | reply_to_address |
  -- business_domain | operator_confirmed
  ADD COLUMN IF NOT EXISTS match_method text,
  ADD COLUMN IF NOT EXISTS match_confidence_note text;
CREATE INDEX IF NOT EXISTS idx_outreach_inbound_opportunity
  ON outreach_inbound_messages (partnership_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_outreach_inbound_business_key
  ON outreach_inbound_messages (matched_business_key);

-- ---------------------------------------------------------------------------
-- 6. MEDIA KITS
-- ---------------------------------------------------------------------------
-- Both live media_kits rows are test artifacts ("Test Kit" with no file, "Upload Test"
-- with a 69-byte 1-pixel PNG) and 60 of 75 queued pitches attach the PNG as Kellie's
-- media kit. These columns separate a real generated kit from an upload and let a
-- test artifact be marked as such instead of quietly serving as the creator's kit.
ALTER TABLE media_kits
  -- uploaded | generated_core | generated_business
  ADD COLUMN IF NOT EXISTS kit_kind text NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS is_test_artifact boolean NOT NULL DEFAULT false,
  -- hotel | restaurant | retail | general — the business-specific tailored layer.
  ADD COLUMN IF NOT EXISTS business_variant text,
  ADD COLUMN IF NOT EXISTS web_slug text,
  ADD COLUMN IF NOT EXISTS analytics_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS analytics_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_kits_web_slug
  ON media_kits (web_slug) WHERE web_slug IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. TELEGRAM URGENCY
-- ---------------------------------------------------------------------------
-- Urgency was a hard-coded string ('high urgency' on all sponsor-inbox mail) and zero
-- of 437 early signals were ever classified urgent. This table is the classifier's
-- durable record: it dedupes by event_key so a repeated event cannot produce a second
-- alert, and it lets a resolved item LEAVE urgent.
CREATE TABLE IF NOT EXISTS partnership_urgent_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable identity for the underlying event. Dedupe key.
  event_key text NOT NULL,
  -- business_reply_needs_decision | offer_deadline_expiring |
  -- requested_date_needs_confirmation | compensation_question |
  -- high_value_short_window | approved_send_failed | obligation_at_risk
  urgency_reason text NOT NULL,
  business_name text NOT NULL,
  opportunity_id uuid REFERENCES partnership_opportunities(id) ON DELETE CASCADE,
  outreach_email_id uuid REFERENCES outreach_emails(id) ON DELETE CASCADE,
  inbound_message_id uuid,
  what_changed text NOT NULL,
  compensation_summary text,
  deadline_at timestamptz,
  deadline_timezone text,
  contact_confidence_label text,
  recommended_action text NOT NULL,
  deep_link text NOT NULL,
  -- urgent | resolved | superseded
  state text NOT NULL DEFAULT 'urgent',
  telegram_sent_at timestamptz,
  telegram_error text,
  resolved_at timestamptz,
  resolution_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partnership_urgent_alerts_event_key
  ON partnership_urgent_alerts (event_key);
CREATE INDEX IF NOT EXISTS idx_partnership_urgent_alerts_state
  ON partnership_urgent_alerts (state, created_at DESC);

-- ---------------------------------------------------------------------------
-- 8. USER-FED INTELLIGENCE INTAKE
-- ---------------------------------------------------------------------------
-- Preserves the original evidence Elliott or Kellie supplied alongside the structured
-- extraction, so a later correction can be traced to what was actually submitted.
CREATE TABLE IF NOT EXISTS partnership_intake_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- url | screenshot | forwarded_email | newsletter | instagram_profile |
  -- instagram_post | business_name | contact_name | business_card | call_note |
  -- partnership_history | rate_offer | analytics | content_example
  intake_kind text NOT NULL,
  raw_input text,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  stored_asset_path text,
  submitted_by text NOT NULL DEFAULT 'operator',
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  business_key text,
  matched_opportunity_id uuid REFERENCES partnership_opportunities(id) ON DELETE SET NULL,
  matched_contact_id uuid REFERENCES sponsor_contacts(id) ON DELETE SET NULL,
  matched_relationship_id uuid REFERENCES partnership_relationships(id) ON DELETE SET NULL,
  -- received | extracted | duplicate | needs_research | applied | rejected
  status text NOT NULL DEFAULT 'received',
  status_note text,
  duplicate_of_id uuid REFERENCES partnership_intake_submissions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partnership_intake_status
  ON partnership_intake_submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partnership_intake_business
  ON partnership_intake_submissions (business_key);
