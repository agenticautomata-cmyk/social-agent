import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  date,
  jsonb,
  numeric,
  primaryKey,
  unique,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// ENUMS
// ============================================================================

export const contentTypeEnum = pgEnum('content_type', [
  'testimonial',
  'case_study',
  'success_story',
  'explainer',
  'educational',
  'transformation',
  'founder_message',
  'industry_insight',
]);

export const contentStateEnum = pgEnum('content_state', [
  'planned',
  'script_drafted',
  'script_approved',
  'script_rejected',
  'assets_ready',
  'video_generating',
  'video_ready',
  'post_production',
  'ready_to_publish',
  'scheduled',
  'published',
  'failed',
  'cancelled',
]);

export const platformEnum = pgEnum('platform', [
  'instagram',
  'tiktok',
  'youtube_shorts',
  'linkedin',
  'facebook',
]);

export const languageEnum = pgEnum('language_code', ['en', 'de', 'es']);

export const autonomyEnum = pgEnum('autonomy_mode', ['manual', 'hitl', 'auto']);

export const creatorValueStatusEnum = pgEnum('creator_value_status', [
  'hidden_raw_signal',
  'researching',
  'creator_candidate',
  'actionable',
  'top_pick',
  'rejected',
  'archived',
]);

export const lifecycleStatusEnum = pgEnum('lifecycle_status', [
  'upcoming',
  'active',
  'expiring_soon',
  'expired',
  'archived',
  'needs_date_verification',
]);

export const researchJobStatusEnum = pgEnum('research_job_status', [
  'queued',
  'researching',
  'needs_verification',
  'complete',
  'failed',
  'cancelled',
]);

export const suppressionScopeEnum = pgEnum('suppression_scope', [
  'never_recommend',
  'never_pitch',
  'never_notify',
  'never_show_in_feed',
  'never_mention',
  'suppress_everywhere',
]);

export const sourceTypeEnum = pgEnum('source_type', [
  'reddit',
  'visitkc',
  'crossroads',
  'union_station',
  'kauffman',
  'sporting_kc',
  'restaurant_week',
  'pitch_dining',
  'kc_parks',
  'kc_library',
  'first_fridays',
  'estate_sales_net',
  'estate_sales_org',
  'brown_button_estates',
  'pitch_openings',
  'inkc_openings',
  'visitkc_openings',
  'metro_openings',
  'metro_deals',
  'pitch_closings',
  'inkc_closings',
  'liquidation_sales_net',
  'consignment_kc',
  'visitkc_luxury',
  'visitkc_romantic_weekends',
  'visitkc_luxury_experiences',
  'kc_hotel_packages',
  'casino_hotel_packages',
  'spa_packages_kc',
  'rooftop_bars_kc',
  'wine_tasting_kc',
  'chef_tasting_menus',
  'kauffman_date_nights',
  'romantic_restaurant_events',
  'big_slick_kc',
  'childrens_mercy_events',
  'chiefs_charity_events',
  'royals_charity_events',
  'sporting_kc_charity',
  'kc_current_charity',
  'kauffman_charity_galas',
  'visitkc_charity_events',
  'kc_nonprofit_galas',
  'kc_entertainment_charity',
  'country_club_plaza',
  'crown_center_retail',
  'corbin_park',
  'prairiefire_retail',
  'town_center_plaza',
  'zona_rosa',
  'legends_outlets',
  'strawberry_swing',
  'west_bottoms_vintage',
  'river_market_vendors',
  'made_in_kc',
  'cardshows_io',
  'collect_a_con',
  'planet_comicon',
  'rss',
  'ics',
  'event_api',
  'google_maps',
  'manual',
  'scrape',
]);

export const routeStrategyEnum = pgEnum('route_strategy', ['all', 'round_robin', 'weighted']);

export const publicationStatusEnum = pgEnum('publication_status', [
  'queued',
  'publishing',
  'published',
  'failed',
  'cancelled',
]);

export const intakeTypeEnum = pgEnum('intake_type', [
  'url',
  'text',
  'image',
  'mixed',
  'video',
  'audio',
]);

export const intakeReviewStatusEnum = pgEnum('intake_review_status', [
  'pending_ai',
  'needs_review',
  'approved',
  'rejected',
]);

export const intakeSourceTypeEnum = pgEnum('intake_source_type', [
  'manual_share',
  'share_to_benson',
]);

export const intakeProcessingStatusEnum = pgEnum('intake_processing_status', [
  'received',
  'queued',
  'extracting_audio',
  'transcribing',
  'analyzing',
  'ready',
  'failed',
  'too_large',
]);

export const draftSourceChannelEnum = pgEnum('draft_source_channel', [
  'share_to_benson',
  'telegram',
  'manual_upload',
  'transcript_paste',
  'future_tiktok_api',
]);

export const draftSourceTypeEnum = pgEnum('draft_source_type', [
  'video',
  'audio',
  'transcript',
  'caption_file',
  'screenshot',
  'mixed',
]);

export const draftConfidenceLevelEnum = pgEnum('draft_confidence_level', [
  'low',
  'medium',
  'high',
]);

export const draftAssetStatusEnum = pgEnum('draft_asset_status', [
  'received',
  'processing',
  'analyzed',
  'needs_review',
  'ready_to_post',
  'hold',
  'revise',
  'scheduled',
  'handed_off',
  'posted',
  'completed',
  'scrapped',
  'failed',
]);

export const draftDecisionTypeEnum = pgEnum('draft_decision_type', [
  'post_now',
  'schedule',
  'hold',
  'revise',
  'scrap',
  'convert_to_sequel',
  'use_for_sponsor',
  'add_to_planner',
  'needs_more_footage',
  'link_opportunity',
  'mark_posted',
]);

// ============================================================================
// TABLES
// ============================================================================

export const industries = pgTable('industries', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  visualStyle: text('visual_style'),
  topicSeeds: text('topic_seeds').array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  autonomyMode: autonomyEnum('autonomy_mode').notNull().default('hitl'),

  weeklyTestimonials: integer('weekly_testimonials').notNull().default(0),
  weeklyCaseStudies: integer('weekly_case_studies').notNull().default(0),
  weeklyExplainers: integer('weekly_explainers').notNull().default(0),
  weeklyEducational: integer('weekly_educational').notNull().default(0),
  weeklyFounderMessages: integer('weekly_founder_messages').notNull().default(0),
  weeklyIndustryInsights: integer('weekly_industry_insights').notNull().default(0),

  languages: languageEnum('languages')
    .array()
    .notNull()
    .default(sql`ARRAY['en']::language_code[]`),

  postingSchedule: text('posting_schedule').notNull().default('0 9 * * *'),
  postingTimezone: text('posting_timezone').notNull().default('America/Chicago'),

  founderHeygenAvatarId: text('founder_heygen_avatar_id'),
  founderHeygenVoiceId: text('founder_heygen_voice_id'),

  brandVoice: text('brand_voice'),
  brandDefaultCta: text('brand_default_cta'),
  brandLogoUrl: text('brand_logo_url'),
  brandPrimaryColor: text('brand_primary_color'),

  routeStrategy: routeStrategyEnum('route_strategy').notNull().default('all'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const campaignIndustries = pgTable(
  'campaign_industries',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    industryId: uuid('industry_id')
      .notNull()
      .references(() => industries.id, { onDelete: 'restrict' }),
    weight: integer('weight').notNull().default(1),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.campaignId, t.industryId] }),
  })
);

export const personas = pgTable(
  'personas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    industryId: uuid('industry_id').references(() => industries.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    role: text('role'),
    ageRange: text('age_range'),
    background: text('background'),
    voiceTraits: text('voice_traits'),
    portraitImageUrl: text('portrait_image_url'),
    portraitPrompt: text('portrait_prompt'),
    heygenAvatarId: text('heygen_avatar_id'),
    heygenVoiceId: text('heygen_voice_id'),
    usesCount: integer('uses_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    campaignIdx: index('idx_personas_campaign').on(t.campaignId),
    industryIdx: index('idx_personas_industry').on(t.industryId),
  })
);

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  type: sourceTypeEnum('type').notNull(),
  name: text('name').notNull(),
  config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
  active: boolean('active').notNull().default(true),
  pollIntervalCron: text('poll_interval_cron'),
  lastScanAt: timestamp('last_scan_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const coverageFormatEnum = pgEnum('coverage_format', [
  'field_visit',
  'green_screen',
  'green_screen_then_visit',
  'roundup',
  'track_only',
]);

export const contentItems = pgTable(
  'content_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    industryId: uuid('industry_id').references(() => industries.id, {
      onDelete: 'set null',
    }),
    personaId: uuid('persona_id').references(() => personas.id, {
      onDelete: 'set null',
    }),

    type: contentTypeEnum('type').notNull(),
    language: languageEnum('language').notNull().default('en'),
    state: contentStateEnum('state').notNull().default('planned'),

    topic: text('topic').notNull(),
    // Vector column declared as raw SQL — drizzle-orm has a vector type but
    // pgvector setup lives in the SQL init script, so we keep it as unknown here
    // and operate via raw SQL where dedup similarity is needed.
    topicEmbedding: text('topic_embedding'),
    hook: text('hook'),
    script: text('script'),
    cta: text('cta'),
    durationSeconds: integer('duration_seconds'),

    captionInstagram: text('caption_instagram'),
    captionTiktok: text('caption_tiktok'),
    hashtagsInstagram: text('hashtags_instagram').array(),
    hashtagsTiktok: text('hashtags_tiktok').array(),

    heygenVideoId: text('heygen_video_id'),
    heygenVideoUrl: text('heygen_video_url'),
    finalVideoUrl: text('final_video_url'),

    plannedForDate: date('planned_for_date'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),

    scriptApprovedAt: timestamp('script_approved_at', { withTimezone: true }),
    scriptApprovedBy: text('script_approved_by'),
    scriptRejectionReason: text('script_rejection_reason'),

    lastError: text('last_error'),
    retryCount: integer('retry_count').notNull().default(0),

    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),

    sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'set null' }),
    sourceExternalId: text('source_external_id'),
    sourceUrl: text('source_url'),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }),
    relevanceScore: numeric('relevance_score', { precision: 4, scale: 3 }),
    urgencyScore: numeric('urgency_score', { precision: 4, scale: 3 }),
    eventStartsAt: timestamp('event_starts_at', { withTimezone: true }),
    eventEndsAt: timestamp('event_ends_at', { withTimezone: true }),
    locationName: text('location_name'),
    locationLat: numeric('location_lat'),
    locationLng: numeric('location_lng'),
    locationStatus: text('location_status'),
    googlePlaceId: text('google_place_id'),
    formattedAddress: text('formatted_address'),
    googleMapsUrl: text('google_maps_url'),
    locationWebsiteUrl: text('location_website_url'),
    locationConfidence: numeric('location_confidence', { precision: 4, scale: 3 }),
    locationSource: text('location_source'),
    locationCandidates: jsonb('location_candidates'),
    locationVerifiedAt: timestamp('location_verified_at', { withTimezone: true }),
    locationResolutionError: text('location_resolution_error'),
    rawPayload: jsonb('raw_payload'),

    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    sourceLastCheckedAt: timestamp('source_last_checked_at', { withTimezone: true }),
    stale: boolean('stale').notNull().default(false),
    freshnessBucket: text('freshness_bucket'),

    coverageFormat: coverageFormatEnum('coverage_format'),
    suggestedCoverageFormat: coverageFormatEnum('suggested_coverage_format'),
    firsthandVisited: boolean('firsthand_visited').notNull().default(false),

    creatorValueStatus: creatorValueStatusEnum('creator_value_status')
      .notNull()
      .default('hidden_raw_signal'),
    lifecycleStatus: lifecycleStatusEnum('lifecycle_status').notNull().default('active'),
    creatorRelevanceExplanation: jsonb('creator_relevance_explanation').notNull().default(sql`'[]'::jsonb`),
    contentCategory: text('content_category'),
    classificationVerifiedAt: timestamp('classification_verified_at', { withTimezone: true }),
    canonicalEntityId: uuid('canonical_entity_id'),
    creatorNextAction: text('creator_next_action'),
    topPickValidatedAt: timestamp('top_pick_validated_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    campaignIdx: index('idx_content_campaign').on(t.campaignId),
    plannedDateIdx: index('idx_content_planned_date').on(t.plannedForDate),
    sourceIdx: index('idx_content_source_id').on(t.sourceId),
  })
);

export const sourceIngestionStatusEnum = pgEnum('source_ingestion_status', [
  'running',
  'success',
  'partial',
  'failed',
]);

export const sourceIngestionRuns = pgTable(
  'source_ingestion_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'set null' }),
    sourceName: text('source_name').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: sourceIngestionStatusEnum('status').notNull().default('running'),
    createdCount: integer('created_count').notNull().default(0),
    updatedCount: integer('updated_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    errorMessage: text('error_message'),
    rawSummary: jsonb('raw_summary').notNull().default(sql`'{}'::jsonb`),
    dryRun: boolean('dry_run').notNull().default(false),
  },
  (t) => ({
    sourceStartedIdx: index('idx_source_ingestion_runs_source_started').on(
      t.sourceId,
      t.startedAt,
    ),
    startedIdx: index('idx_source_ingestion_runs_started').on(t.startedAt),
  }),
);

export const scanRuns = pgTable(
  'scan_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'set null' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: text('status').notNull().default('running'),
    itemsFound: integer('items_found').notNull().default(0),
    itemsCreated: integer('items_created').notNull().default(0),
    itemsSkipped: integer('items_skipped').notNull().default(0),
    error: text('error'),
    payload: jsonb('payload'),
  },
  (t) => ({
    sourceStartedIdx: index('idx_scan_runs_source').on(t.sourceId, t.startedAt),
  })
);

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentItemId: uuid('content_item_id').references(() => contentItems.id, {
      onDelete: 'cascade',
    }),
    personaId: uuid('persona_id').references(() => personas.id, {
      onDelete: 'cascade',
    }),
    kind: text('kind').notNull(),
    url: text('url').notNull(),
    storagePath: text('storage_path'),
    mimeType: text('mime_type'),
    durationSeconds: integer('duration_seconds'),
    width: integer('width'),
    height: integer('height'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    contentIdx: index('idx_assets_content').on(t.contentItemId),
    personaIdx: index('idx_assets_persona').on(t.personaId),
    kindIdx: index('idx_assets_kind').on(t.kind),
  })
);

export const publishingTargets = pgTable(
  'publishing_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    platform: platformEnum('platform').notNull(),
    accountHandle: text('account_handle').notNull(),
    accountId: text('account_id'),
    credentialsRef: text('credentials_ref'),
    weight: integer('weight').notNull().default(1),
    postsCount: integer('posts_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: unique().on(t.campaignId, t.platform, t.accountHandle),
  })
);

export const publications = pgTable(
  'publications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentItemId: uuid('content_item_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => publishingTargets.id, { onDelete: 'restrict' }),
    status: publicationStatusEnum('status').notNull().default('queued'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    remotePostId: text('remote_post_id'),
    remotePostUrl: text('remote_post_url'),
    caption: text('caption'),
    hashtags: text('hashtags').array(),
    error: text('error'),
    retryCount: integer('retry_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: unique().on(t.contentItemId, t.targetId),
    contentIdx: index('idx_publications_content').on(t.contentItemId),
    statusIdx: index('idx_publications_status').on(t.status),
  })
);

export const postMetrics = pgTable(
  'post_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicationId: uuid('publication_id')
      .notNull()
      .references(() => publications.id, { onDelete: 'cascade' }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    hoursSincePost: integer('hours_since_post').notNull(),
    views: integer('views').notNull().default(0),
    likes: integer('likes').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    shares: integer('shares').notNull().default(0),
    saves: integer('saves').notNull().default(0),
    reach: integer('reach').notNull().default(0),
    watchTimeSeconds: integer('watch_time_seconds').notNull().default(0),
    engagementRate: numeric('engagement_rate', { precision: 6, scale: 4 }).notNull().default('0'),
    raw: jsonb('raw').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    pubIdx: index('idx_post_metrics_publication').on(t.publicationId, t.hoursSincePost),
    fetchIdx: index('idx_post_metrics_fetched').on(t.fetchedAt),
  })
);

export const topicPerformance = pgTable(
  'topic_performance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    industryId: uuid('industry_id').references(() => industries.id, { onDelete: 'cascade' }),
    contentType: contentTypeEnum('content_type').notNull(),
    language: languageEnum('language').notNull().default('en'),
    posts: integer('posts').notNull().default(0),
    totalViews: bigint('total_views', { mode: 'number' }).notNull().default(0),
    totalEngagement: bigint('total_engagement', { mode: 'number' }).notNull().default(0),
    avgEngagementRate: numeric('avg_engagement_rate', { precision: 6, scale: 4 }).notNull().default('0'),
    plannerWeightModifier: numeric('planner_weight_modifier', { precision: 4, scale: 2 }).notNull().default('1.00'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: unique().on(t.campaignId, t.industryId, t.contentType, t.language),
    lookupIdx: index('idx_topic_perf_lookup').on(t.campaignId, t.industryId),
  })
);

export const platformCredentials = pgTable(
  'platform_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetId: uuid('target_id')
      .notNull()
      .unique()
      .references(() => publishingTargets.id, { onDelete: 'cascade' }),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    clientId: text('client_id'),
    clientSecret: text('client_secret'),
    scope: text('scope'),
    lastRotatedAt: timestamp('last_rotated_at', { withTimezone: true }),
    lastRotationError: text('last_rotation_error'),
    rotationAttempts: integer('rotation_attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    expiryIdx: index('idx_credentials_expiry').on(t.expiresAt),
  })
);

export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentItemId: uuid('content_item_id').references(() => contentItems.id, {
      onDelete: 'cascade',
    }),
    workflowName: text('workflow_name').notNull(),
    stateFrom: contentStateEnum('state_from'),
    stateTo: contentStateEnum('state_to'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    status: text('status').notNull().default('running'),
    error: text('error'),
    payload: jsonb('payload'),
  },
  (t) => ({
    contentIdx: index('idx_runs_content').on(t.contentItemId),
    startedIdx: index('idx_runs_started').on(t.startedAt),
    workflowIdx: index('idx_runs_workflow').on(t.workflowName, t.startedAt),
  })
);

export const shareIntakeSubmissions = pgTable(
  'share_intake_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    sourceType: intakeSourceTypeEnum('source_type').notNull().default('manual_share'),
    intakeType: intakeTypeEnum('intake_type').notNull(),
    originalUrl: text('original_url'),
    rawText: text('raw_text'),
    notes: text('notes'),
    uploadedImagePath: text('uploaded_image_path'),
    uploadedImageUrl: text('uploaded_image_url'),
    aiSummary: text('ai_summary'),
    extractedTitle: text('extracted_title'),
    extractedDate: timestamp('extracted_date', { withTimezone: true }),
    extractedLocation: text('extracted_location'),
    extractedBusiness: text('extracted_business'),
    extractedCategory: text('extracted_category'),
    extractedTags: text('extracted_tags').array().notNull().default(sql`'{}'::text[]`),
    confidenceScore: numeric('confidence_score', { precision: 4, scale: 3 }),
    reviewStatus: intakeReviewStatusEnum('review_status').notNull().default('needs_review'),
    rejectionReason: text('rejection_reason'),
    promotedContentItemId: uuid('promoted_content_item_id').references(() => contentItems.id, {
      onDelete: 'set null',
    }),
    submittedBy: text('submitted_by').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    clientMetadata: jsonb('client_metadata').notNull().default(sql`'{}'::jsonb`),
    creatorId: uuid('creator_id').references(() => creatorAccounts.id, { onDelete: 'set null' }),
    originalFilename: text('original_filename'),
    mimeType: text('mime_type'),
    fileSize: bigint('file_size', { mode: 'number' }),
    durationSeconds: numeric('duration_seconds', { precision: 10, scale: 2 }),
    tempFilePath: text('temp_file_path'),
    transcriptText: text('transcript_text'),
    transcriptSegmentsJson: jsonb('transcript_segments_json'),
    contentTheme: text('content_theme'),
    hookSummary: text('hook_summary'),
    keyMomentsJson: jsonb('key_moments_json'),
    sponsorRelevance: text('sponsor_relevance'),
    detectedProductsJson: jsonb('detected_products_json'),
    detectedBrandsJson: jsonb('detected_brands_json'),
    detectedLocationsJson: jsonb('detected_locations_json'),
    captionSuggestionsJson: jsonb('caption_suggestions_json'),
    hashtagSuggestionsJson: jsonb('hashtag_suggestions_json'),
    followUpIdeasJson: jsonb('follow_up_ideas_json'),
    processingStatus: intakeProcessingStatusEnum('processing_status'),
    processingError: text('processing_error'),
    linkedPostPackageId: uuid('linked_post_package_id').references(() => tiktokPostPackages.id, {
      onDelete: 'set null',
    }),
    linkedPlannerItemId: uuid('linked_planner_item_id').references(() => plannerItems.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    campaignStatusIdx: index('idx_share_intake_campaign_status').on(
      t.campaignId,
      t.reviewStatus,
      t.submittedAt,
    ),
    processingIdx: index('idx_share_intake_processing').on(t.processingStatus, t.submittedAt),
  }),
);

export const creatorAccounts = pgTable(
  'creator_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: platformEnum('platform').notNull(),
    username: text('username').notNull(),
    displayName: text('display_name'),
    profileUrl: text('profile_url'),
    avatarUrl: text('avatar_url'),
    connectionStatus: text('connection_status').notNull().default('import_only'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    platformUsernameUq: unique().on(t.platform, t.username),
    platformIdx: index('idx_creator_accounts_platform').on(t.platform),
  }),
);

export const creatorVideos = pgTable(
  'creator_videos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    platform: platformEnum('platform').notNull(),
    videoId: text('video_id').notNull(),
    title: text('title'),
    caption: text('caption'),
    postUrl: text('post_url'),
    thumbnailUrl: text('thumbnail_url'),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    contentCategory: text('content_category'),
    contentPillar: text('content_pillar'),
    locationTag: text('location_tag'),
    sponsorTag: text('sponsor_tag'),
    opportunityId: uuid('opportunity_id').references(() => contentItems.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    accountVideoUq: unique().on(t.accountId, t.videoId),
    accountIdx: index('idx_creator_videos_account').on(t.accountId),
    publishedIdx: index('idx_creator_videos_published').on(t.publishedAt),
    platformIdx: index('idx_creator_videos_platform').on(t.platform),
  }),
);

export const creatorMetricsSnapshots = pgTable(
  'creator_metrics_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => creatorVideos.id, { onDelete: 'cascade' }),
    views: bigint('views', { mode: 'number' }).notNull().default(0),
    likes: integer('likes').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    shares: integer('shares').notNull().default(0),
    saves: integer('saves'),
    engagementRate: numeric('engagement_rate', { precision: 8, scale: 4 }),
    watchTimeSeconds: bigint('watch_time_seconds', { mode: 'number' }),
    averageWatchDurationSeconds: numeric('average_watch_duration_seconds', {
      precision: 10,
      scale: 2,
    }),
    completionRate: numeric('completion_rate', { precision: 6, scale: 4 }),
    followerCountSnapshot: integer('follower_count_snapshot'),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
    source: text('source').notNull().default('import'),
    raw: jsonb('raw').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    videoCollectedIdx: index('idx_creator_metrics_video_collected').on(
      t.videoId,
      t.collectedAt,
    ),
  }),
);

export const creatorPostingAnalytics = pgTable(
  'creator_posting_analytics',
  {
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    platform: platformEnum('platform').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    timezone: text('timezone').notNull(),
    sampleSize: integer('sample_size').notNull(),
    medianViews: integer('median_views').notNull(),
    analytics: jsonb('analytics').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.creatorId, t.platform] }),
    computedIdx: index('idx_creator_posting_analytics_computed').on(t.computedAt),
  }),
);

export const bensonConversations = pgTable(
  'benson_conversations',
  {
    id: uuid('id').primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    titleSource: text('title_source').notNull().default('auto'),
    // Soft UI/default hint only. Message entityContext remains authoritative.
    primaryPartnershipId: uuid('primary_partnership_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull(),
    lastMessagePreview: text('last_message_preview'),
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    creatorRecentIdx: index('idx_benson_conversations_creator_recent').on(
      t.creatorId,
      t.lastMessageAt,
      t.id,
    ),
    creatorOpenedIdx: index('idx_benson_conversations_creator_opened').on(
      t.creatorId,
      t.lastOpenedAt,
    ),
  }),
);

export const bensonChatMessages = pgTable(
  'benson_chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull(),
    role: text('role').notNull(),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    inputSnapshot: jsonb('input_snapshot').notNull().default(sql`'{}'::jsonb`),
    outputJson: jsonb('output_json').notNull().default(sql`'{}'::jsonb`),
    tokenUsage: jsonb('token_usage').notNull().default(sql`'{}'::jsonb`),
    estimatedCost: numeric('estimated_cost', { precision: 12, scale: 6 }).notNull().default('0'),
  },
  (t) => ({
    creatorConversationIdx: index('idx_benson_chat_creator_conversation').on(
      t.creatorId,
      t.conversationId,
      t.createdAt,
    ),
    cacheLookupIdx: index('idx_benson_chat_cache_lookup').on(t.creatorId, t.createdAt),
  }),
);

export const strategistBriefings = pgTable(
  'strategist_briefings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    promptVersion: text('prompt_version').notNull(),
    inputSnapshot: jsonb('input_snapshot').notNull().default(sql`'{}'::jsonb`),
    outputJson: jsonb('output_json').notNull().default(sql`'{}'::jsonb`),
    tokenUsage: jsonb('token_usage').notNull().default(sql`'{}'::jsonb`),
    estimatedCost: numeric('estimated_cost', { precision: 12, scale: 6 }).notNull().default('0'),
  },
  (t) => ({
    creatorCreatedIdx: index('idx_strategist_briefings_creator_created').on(
      t.creatorId,
      t.createdAt,
    ),
  }),
);

export const creatorPlatformConnectionStatusEnum = pgEnum('creator_platform_connection_status', [
  'connected',
  'disconnected',
  'expired',
  'error',
  'credentials_missing',
]);

export const creatorPlatformConnections = pgTable(
  'creator_platform_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorAccountId: uuid('creator_account_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    platform: platformEnum('platform').notNull(),
    platformUserId: text('platform_user_id'),
    platformUsername: text('platform_username'),
    accessTokenEncrypted: text('access_token_encrypted'),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    status: creatorPlatformConnectionStatusEnum('status').notNull().default('disconnected'),
    lastError: text('last_error'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    accountPlatformUq: unique().on(t.creatorAccountId, t.platform),
    statusIdx: index('idx_creator_platform_connections_status').on(t.platform, t.status),
    accountIdx: index('idx_creator_platform_connections_account').on(t.creatorAccountId),
  }),
);

export const analyticsConnectors = pgTable('analytics_connectors', {
  provider: text('provider').primaryKey(),
  connected: boolean('connected').notNull().default(false),
  accountId: text('account_id'),
  accountName: text('account_name'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastSuccessfulSyncAt: timestamp('last_successful_sync_at', { withTimezone: true }),
  lastSyncError: text('last_sync_error'),
  syncStatus: text('sync_status').notNull().default('idle'),
  followers: bigint('followers', { mode: 'number' }),
  postCount: integer('post_count'),
  totalViews: bigint('total_views', { mode: 'number' }),
  totalEngagement: bigint('total_engagement', { mode: 'number' }),
  enabled: boolean('enabled').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plannerItemStatusEnum = pgEnum('planner_item_status', [
  'saved',
  'considering',
  'planned',
  'covered',
  'skipped',
]);

export const plannerItems = pgTable(
  'planner_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentItemId: uuid('content_item_id')
      .notNull()
      .unique()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    listName: text('list_name').notNull().default('Saved For Later'),
    notes: text('notes'),
    priority: integer('priority').notNull().default(2),
    plannedDate: date('planned_date'),
    dueDate: date('due_date'),
    contentAngle: text('content_angle'),
    status: plannerItemStatusEnum('status').notNull().default('saved'),
    followUpAt: timestamp('follow_up_at', { withTimezone: true }),
    draftCaption: text('draft_caption'),
    postedUrl: text('posted_url'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    greenScreenStatus: text('green_screen_status'),
    visitReminderAt: timestamp('visit_reminder_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('idx_planner_items_status').on(t.status),
    listIdx: index('idx_planner_items_list').on(t.listName),
    plannedDateIdx: index('idx_planner_items_planned_date').on(t.plannedDate),
    dueDateIdx: index('idx_planner_items_due_date').on(t.dueDate),
  }),
);

export const greenScreenPackages = pgTable(
  'green_screen_packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentItemId: uuid('content_item_id')
      .notNull()
      .unique()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('draft'),
    suggestedHeadline: text('suggested_headline'),
    openingHook: text('opening_hook'),
    spokenScript: text('spoken_script'),
    keyFacts: jsonb('key_facts').notNull().default(sql`'[]'::jsonb`),
    eventDates: text('event_dates'),
    location: text('location'),
    priceOrOffer: text('price_or_offer'),
    restrictions: text('restrictions'),
    backgroundSources: jsonb('background_sources').notNull().default(sql`'[]'::jsonb`),
    onScreenText: jsonb('on_screen_text').notNull().default(sql`'[]'::jsonb`),
    caption: text('caption'),
    hashtags: jsonb('hashtags').notNull().default(sql`'[]'::jsonb`),
    callToAction: text('call_to_action'),
    sourceAttribution: text('source_attribution'),
    verificationStatus: text('verification_status').notNull().default('unverified'),
    verificationFlags: jsonb('verification_flags').notNull().default(sql`'[]'::jsonb`),
    visitLaterNotes: text('visit_later_notes'),
    duplicateOfContentItemId: uuid('duplicate_of_content_item_id').references(() => contentItems.id, {
      onDelete: 'set null',
    }),
    preparedAt: timestamp('prepared_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    contentIdx: index('idx_green_screen_packages_content').on(t.contentItemId),
  }),
);

export const discoveryEmailMessages = pgTable(
  'discovery_email_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gmailMessageId: text('gmail_message_id').notNull().unique(),
    gmailThreadId: text('gmail_thread_id'),
    originalRecipient: text('original_recipient'),
    senderEmail: text('sender_email'),
    senderName: text('sender_name'),
    subject: text('subject'),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    bodyText: text('body_text'),
    urls: jsonb('urls').notNull().default(sql`'[]'::jsonb`),
    attachmentMetadata: jsonb('attachment_metadata').notNull().default(sql`'[]'::jsonb`),
    contentItemId: uuid('content_item_id').references(() => contentItems.id, { onDelete: 'set null' }),
    duplicateOfContentItemId: uuid('duplicate_of_content_item_id').references(() => contentItems.id, {
      onDelete: 'set null',
    }),
    messageKind: text('message_kind').notNull().default('opportunity_signal'),
    subscriptionId: uuid('subscription_id'),
    channelId: text('channel_id').notNull().default('discoveries'),
    emailCategory: text('email_category').notNull().default('discovery'),
    discoveryIntent: text('discovery_intent'),
    matchedHeader: text('matched_header'),
    processingStatus: text('processing_status').notNull().default('received'),
    processingError: text('processing_error'),
    newsletterCategory: text('newsletter_category'),
    senderDomain: text('sender_domain'),
    contentFingerprint: text('content_fingerprint'),
    newsletterSourceId: uuid('newsletter_source_id'),
    entitiesExtracted: integer('entities_extracted').notNull().default(0),
    occurrencesExtracted: integer('occurrences_extracted').notNull().default(0),
    quarantinedCount: integer('quarantined_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    receivedIdx: index('idx_discovery_email_received').on(t.receivedAt),
    contentIdx: index('idx_discovery_email_content').on(t.contentItemId),
    subscriptionIdx: index('idx_discovery_email_subscription').on(t.subscriptionId),
    fingerprintIdx: index('idx_discovery_email_fingerprint').on(t.contentFingerprint),
    newsletterSourceIdx: index('idx_discovery_email_newsletter_source').on(t.newsletterSourceId, t.receivedAt),
  }),
);

export const discoverySubscriptions = pgTable(
  'discovery_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceName: text('source_name').notNull(),
    signupDomain: text('signup_domain'),
    signupUrl: text('signup_url'),
    emailAddress: text('email_address').notNull().default('discoveries@kckellie.com'),
    signupAt: timestamp('signup_at', { withTimezone: true }).notNull().defaultNow(),
    expectedSenderDomain: text('expected_sender_domain'),
    status: text('status').notNull().default('signup_submitted'),
    confirmationMessageId: uuid('confirmation_message_id'),
    confirmationLink: text('confirmation_link'),
    verificationCode: text('verification_code'),
    verificationAttemptedAt: timestamp('verification_attempted_at', { withTimezone: true }),
    verificationResult: text('verification_result'),
    verificationFailureReason: text('verification_failure_reason'),
    manualReviewReason: text('manual_review_reason'),
    blockedSender: boolean('blocked_sender').notNull().default(false),
    lastEmailReceivedAt: timestamp('last_email_received_at', { withTimezone: true }),
    lastUsefulOpportunityAt: timestamp('last_useful_opportunity_at', { withTimezone: true }),
    lastOpportunityContentItemId: uuid('last_opportunity_content_item_id').references(() => contentItems.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('idx_discovery_subscriptions_status').on(t.status, t.signupAt),
    domainIdx: index('idx_discovery_subscriptions_domain').on(t.signupDomain, t.expectedSenderDomain),
  }),
);

export const newsletterSources = pgTable(
  'newsletter_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderEmail: text('sender_email'),
    senderDomain: text('sender_domain').notNull(),
    senderName: text('sender_name'),
    category: text('category').notNull().default('local_newsletter'),
    status: text('status').notNull().default('suggested'),
    discoverySubscriptionId: uuid('discovery_subscription_id').references(() => discoverySubscriptions.id, {
      onDelete: 'set null',
    }),
    lastEmailReceivedAt: timestamp('last_email_received_at', { withTimezone: true }),
    lastSuccessfulParseAt: timestamp('last_successful_parse_at', { withTimezone: true }),
    emailsProcessed: integer('emails_processed').notNull().default(0),
    entitiesExtracted: integer('entities_extracted').notNull().default(0),
    occurrencesExtracted: integer('occurrences_extracted').notNull().default(0),
    verifiedItemCount: integer('verified_item_count').notNull().default(0),
    duplicateMergeCount: integer('duplicate_merge_count').notNull().default(0),
    quarantinedCount: integer('quarantined_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    domainIdx: uniqueIndex('idx_newsletter_sources_domain').on(t.senderDomain),
    statusIdx: index('idx_newsletter_sources_status').on(t.status, t.lastEmailReceivedAt),
  }),
);

export const inventoryEvidence = pgTable(
  'inventory_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentItemId: uuid('content_item_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    evidenceType: text('evidence_type').notNull().default('newsletter_email'),
    sourceLabel: text('source_label'),
    gmailMessageId: text('gmail_message_id'),
    discoveryEmailMessageId: uuid('discovery_email_message_id').references(() => discoveryEmailMessages.id, {
      onDelete: 'set null',
    }),
    newsletterSourceId: uuid('newsletter_source_id').references(() => newsletterSources.id, {
      onDelete: 'set null',
    }),
    sourceUrl: text('source_url'),
    canonicalSourceUrl: text('canonical_source_url'),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    verificationStatus: text('verification_status').notNull().default('newsletter_only'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    contentIdx: index('idx_inventory_evidence_content').on(t.contentItemId, t.createdAt),
    gmailIdx: index('idx_inventory_evidence_gmail').on(t.gmailMessageId),
  }),
);

export const newsletterBackfillRuns = pgTable('newsletter_backfill_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  dryRun: boolean('dry_run').notNull().default(true),
  sinceDays: integer('since_days').notNull().default(180),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  report: jsonb('report').notNull().default(sql`'{}'::jsonb`),
  status: text('status').notNull().default('running'),
  error: text('error'),
});

export const newsletterVerificationQueue = pgTable(
  'newsletter_verification_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentItemId: uuid('content_item_id').references(() => contentItems.id, { onDelete: 'cascade' }),
    occurrenceFingerprint: text('occurrence_fingerprint'),
    entityName: text('entity_name'),
    occurrenceTitle: text('occurrence_title'),
    newsletterClaim: jsonb('newsletter_claim').notNull().default(sql`'{}'::jsonb`),
    officialClaim: jsonb('official_claim').notNull().default(sql`'{}'::jsonb`),
    verificationStatus: text('verification_status').notNull().default('newsletter_only'),
    conflictingFields: jsonb('conflicting_fields').notNull().default(sql`'[]'::jsonb`),
    canonicalOfficialUrl: text('canonical_official_url'),
    verificationPriority: integer('verification_priority').notNull().default(6),
    gmailMessageId: text('gmail_message_id'),
    newsletterSourceId: uuid('newsletter_source_id').references(() => newsletterSources.id, {
      onDelete: 'set null',
    }),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('idx_newsletter_verification_status').on(t.verificationStatus, t.updatedAt),
    fingerprintIdx: index('idx_newsletter_verification_fingerprint').on(t.occurrenceFingerprint),
  }),
);

export type NewInventoryEvidence = typeof inventoryEvidence.$inferInsert;

export const discoveryVerificationAttempts = pgTable(
  'discovery_verification_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => discoverySubscriptions.id, { onDelete: 'cascade' }),
    gmailMessageId: text('gmail_message_id'),
    method: text('method').notNull(),
    result: text('result').notNull(),
    failureReason: text('failure_reason'),
    finalUrl: text('final_url'),
    redirectCount: integer('redirect_count'),
    httpStatus: integer('http_status'),
    sanitizedLinkDomain: text('sanitized_link_domain'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    subIdx: index('idx_discovery_verification_attempts_sub').on(t.subscriptionId, t.createdAt),
  }),
);

export const editorOpportunityTracking = pgTable(
  'editor_opportunity_tracking',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentItemId: uuid('content_item_id')
      .notNull()
      .unique()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    saved: boolean('saved').notNull().default(false),
    covered: boolean('covered').notNull().default(false),
    note: text('note'),
    followUpAt: timestamp('follow_up_at', { withTimezone: true }),
    savedAt: timestamp('saved_at', { withTimezone: true }),
    coveredAt: timestamp('covered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    savedIdx: index('idx_editor_tracking_saved').on(t.saved, t.savedAt),
    coveredIdx: index('idx_editor_tracking_covered').on(t.covered, t.coveredAt),
    followUpIdx: index('idx_editor_tracking_follow_up').on(t.followUpAt),
  }),
);

export const sponsorContactStatusEnum = pgEnum('sponsor_contact_status', [
  'lead',
  'ready_to_contact',
  'scheduled',
  'sent',
  'replied',
  'follow_up_needed',
  'not_interested',
  'converted',
]);

export const sponsorPipelineStatusEnum = pgEnum('sponsor_pipeline_status', [
  'lead',
  'contacted',
  'interested',
  'meeting_scheduled',
  'proposal_sent',
  'negotiating',
  'won',
  'lost',
]);

export const outreachEmailStatusEnum = pgEnum('outreach_email_status', [
  'draft',
  'needs_approval',
  'scheduled',
  'sending',
  'sent',
  'simulated_sent',
  'failed',
  'canceled',
]);

export const outreachSendAttemptStatusEnum = pgEnum('outreach_send_attempt_status', [
  'simulated',
  'sent',
  'failed',
  'canceled',
]);

export const sponsorContacts = pgTable(
  'sponsor_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessName: text('business_name').notNull(),
    contactName: text('contact_name'),
    email: text('email'),
    phone: text('phone'),
    website: text('website'),
    instagram: text('instagram'),
    tiktok: text('tiktok'),
    category: text('category'),
    notes: text('notes'),
    sponsorFitScore: numeric('sponsor_fit_score', { precision: 4, scale: 3 }),
    sourceOpportunityId: uuid('source_opportunity_id').references(() => contentItems.id, {
      onDelete: 'set null',
    }),
    status: sponsorContactStatusEnum('status').notNull().default('lead'),
    contactVerificationStatus: text('contact_verification_status').notNull().default('missing'),
    canonicalBusinessId: uuid('canonical_business_id'),
    mergedIntoId: uuid('merged_into_id'),
    entityType: text('entity_type').notNull().default('business'),
    lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('idx_sponsor_contacts_status').on(t.status),
    sourceIdx: index('idx_sponsor_contacts_source').on(t.sourceOpportunityId),
    businessIdx: index('idx_sponsor_contacts_business').on(t.businessName),
  }),
);

export const sponsorOpportunities = pgTable(
  'sponsor_opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sponsorContactId: uuid('sponsor_contact_id')
      .notNull()
      .references(() => sponsorContacts.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    estimatedValue: numeric('estimated_value', { precision: 12, scale: 2 }),
    actualValue: numeric('actual_value', { precision: 12, scale: 2 }),
    status: sponsorPipelineStatusEnum('status').notNull().default('lead'),
    notes: text('notes'),
    leadSource: text('lead_source'),
    plannerListName: text('planner_list_name'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => ({
    contactIdx: index('idx_sponsor_opportunities_contact').on(t.sponsorContactId),
    statusIdx: index('idx_sponsor_opportunities_status').on(t.status),
    closedIdx: index('idx_sponsor_opportunities_closed').on(t.closedAt),
    dueDateIdx: index('idx_sponsor_opportunities_due_date').on(t.dueDate),
  }),
);

export const mediaKits = pgTable(
  'media_kits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    targetAudience: text('target_audience'),
    fileUrl: text('file_url'),
    originalFilename: text('original_filename'),
    mimeType: text('mime_type'),
    fileSize: integer('file_size'),
    storageFilename: text('storage_filename'),
    version: text('version').notNull().default('1.0'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activeIdx: index('idx_media_kits_active').on(t.active),
  }),
);

export const emailTemplates = pgTable('email_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type').notNull().unique(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gmailConnections = pgTable(
  'gmail_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email'),
    accessTokenEncrypted: text('access_token_encrypted'),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    status: text('status').notNull().default('disconnected'),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    lastError: text('last_error'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('idx_gmail_connections_status').on(t.status),
  }),
);

export const gmailSyncState = pgTable('gmail_sync_state', {
  id: text('id').primaryKey().default('default'),
  historyId: text('history_id'),
  lastInboxSyncAt: timestamp('last_inbox_sync_at', { withTimezone: true }),
  lastDigestAt: timestamp('last_digest_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const outreachEmails = pgTable(
  'outreach_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sponsorContactId: uuid('sponsor_contact_id')
      .notNull()
      .references(() => sponsorContacts.id, { onDelete: 'cascade' }),
    mediaKitId: uuid('media_kit_id').references(() => mediaKits.id, { onDelete: 'set null' }),
    templateId: uuid('template_id').references(() => emailTemplates.id, { onDelete: 'set null' }),
    subject: text('subject').notNull().default(''),
    body: text('body').notNull().default(''),
    scheduledSendAt: timestamp('scheduled_send_at', { withTimezone: true }),
    followUpDueAt: timestamp('follow_up_due_at', { withTimezone: true }),
    status: outreachEmailStatusEnum('status').notNull().default('draft'),
    approvalRequired: boolean('approval_required').notNull().default(true),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    previewedAt: timestamp('previewed_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    draftedBy: text('drafted_by'),
    bensonDraftContext: jsonb('benson_draft_context'),
    approvalNotifiedAt: timestamp('approval_notified_at', { withTimezone: true }),
    gmailThreadId: text('gmail_thread_id'),
    sendProvider: text('send_provider'),
    pitchReadinessStatus: text('pitch_readiness_status').notNull().default('lead_only'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('idx_outreach_emails_status').on(t.status),
    scheduledIdx: index('idx_outreach_emails_scheduled').on(t.scheduledSendAt),
    followUpDueIdx: index('idx_outreach_emails_follow_up_due').on(t.followUpDueAt),
    contactIdx: index('idx_outreach_emails_contact').on(t.sponsorContactId),
    draftedByIdx: index('idx_outreach_emails_drafted_by').on(t.draftedBy),
  }),
);

export const outreachSendAttempts = pgTable(
  'outreach_send_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    outreachEmailId: uuid('outreach_email_id')
      .notNull()
      .references(() => outreachEmails.id, { onDelete: 'cascade' }),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
    status: outreachSendAttemptStatusEnum('status').notNull(),
    provider: text('provider').notNull().default('demo'),
    providerMessageId: text('provider_message_id'),
    recipient: text('recipient'),
    subject: text('subject'),
    errorMessage: text('error_message'),
  },
  (t) => ({
    emailIdx: index('idx_outreach_send_attempts_email').on(t.outreachEmailId),
  }),
);

export const outreachInboundMessages = pgTable(
  'outreach_inbound_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gmailMessageId: text('gmail_message_id').notNull().unique(),
    gmailThreadId: text('gmail_thread_id').notNull(),
    outreachEmailId: uuid('outreach_email_id').references(() => outreachEmails.id, {
      onDelete: 'set null',
    }),
    fromEmail: text('from_email'),
    fromName: text('from_name'),
    subject: text('subject'),
    snippet: text('snippet'),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    matchKind: text('match_kind').notNull().default('unknown'),
    channelId: text('channel_id').notNull().default('sponsors'),
    emailCategory: text('email_category').notNull().default('sponsor'),
    originalRecipient: text('original_recipient'),
    matchedHeader: text('matched_header'),
    isRead: boolean('is_read').notNull().default(false),
    emailIntent: text('email_intent'),
    actionability: text('actionability').notNull().default('none'),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    threadIdx: index('idx_outreach_inbound_thread').on(t.gmailThreadId),
    outreachIdx: index('idx_outreach_inbound_outreach').on(t.outreachEmailId),
    actionabilityIdx: index('idx_outreach_inbound_actionability').on(t.actionability, t.isRead),
  }),
);

export const gmailDigestMessages = pgTable(
  'gmail_digest_messages',
  {
    gmailMessageId: text('gmail_message_id').primaryKey(),
    gmailThreadId: text('gmail_thread_id').notNull(),
    fromEmail: text('from_email'),
    fromName: text('from_name'),
    subject: text('subject'),
    snippet: text('snippet'),
    summarizedAt: timestamp('summarized_at', { withTimezone: true }).notNull().defaultNow(),
    telegramSentAt: timestamp('telegram_sent_at', { withTimezone: true }),
    digestBatchId: uuid('digest_batch_id'),
    channelId: text('channel_id'),
    emailCategory: text('email_category'),
    discoveryIntent: text('discovery_intent'),
    originalRecipient: text('original_recipient'),
    matchedHeader: text('matched_header'),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    promotedContentItemId: uuid('promoted_content_item_id').references(() => contentItems.id, {
      onDelete: 'set null',
    }),
    promotedAt: timestamp('promoted_at', { withTimezone: true }),
    actionStatus: text('action_status').notNull().default('open'),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => ({
    telegramIdx: index('idx_gmail_digest_telegram').on(t.telegramSentAt),
    categoryIdx: index('idx_gmail_digest_category').on(t.emailCategory, t.summarizedAt),
    actionStatusIdx: index('idx_gmail_digest_action_status').on(t.actionStatus, t.summarizedAt),
  }),
);

export const testerFeedback = pgTable(
  'tester_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    route: text('route').notNull(),
    pageTitle: text('page_title'),
    sentiment: text('sentiment'),
    reasonCode: text('reason_code'),
    comment: text('comment'),
    expectedBehavior: text('expected_behavior'),
    userEmail: text('user_email'),
    userAgent: text('user_agent'),
    viewport: text('viewport'),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index('idx_tester_feedback_created').on(t.createdAt),
    kindIdx: index('idx_tester_feedback_kind').on(t.kind),
    routeIdx: index('idx_tester_feedback_route').on(t.route),
  }),
);

export const creatorPreferences = pgTable('creator_preferences', {
  id: text('id').primaryKey().default('global'),
  excludedCategories: text('excluded_categories').array().notNull().default(sql`'{}'::text[]`),
  categoryNotes: jsonb('category_notes').notNull().default(sql`'{}'::jsonb`),
  preferenceLog: jsonb('preference_log').notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bensonProgressBriefs = pgTable(
  'benson_progress_briefs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    snapshotHash: text('snapshot_hash').notNull(),
    snapshot: jsonb('snapshot').notNull().default(sql`'{}'::jsonb`),
    delta: jsonb('delta').notNull().default(sql`'{}'::jsonb`),
    brief: jsonb('brief').notNull().default(sql`'{}'::jsonb`),
    tokenUsage: jsonb('token_usage').notNull().default(sql`'{}'::jsonb`),
    estimatedCost: numeric('estimated_cost', { precision: 12, scale: 6 }).notNull().default('0'),
  },
  (t) => ({
    creatorCreatedIdx: index('idx_benson_progress_briefs_creator_created').on(
      t.creatorId,
      t.createdAt,
    ),
  }),
);

export const bensonLearnings = pgTable(
  'benson_learnings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sourceHash: text('source_hash').notNull(),
    summary: text('summary').notNull().default(''),
    insights: jsonb('insights').notNull().default(sql`'[]'::jsonb`),
    signalSnapshot: jsonb('signal_snapshot').notNull().default(sql`'{}'::jsonb`),
    tokenUsage: jsonb('token_usage').notNull().default(sql`'{}'::jsonb`),
    estimatedCost: numeric('estimated_cost', { precision: 12, scale: 6 }).notNull().default('0'),
  },
  (t) => ({
    createdIdx: index('idx_benson_learnings_created').on(t.createdAt),
    sourceHashUq: unique().on(t.sourceHash),
  }),
);

export const bensonChatFeedback = pgTable(
  'benson_chat_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => bensonChatMessages.id, { onDelete: 'cascade' }),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    sentiment: text('sentiment').notNull(),
    reasonCode: text('reason_code'),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    messageUq: unique().on(t.messageId),
    creatorCreatedIdx: index('idx_benson_chat_feedback_creator_created').on(
      t.creatorId,
      t.createdAt,
    ),
  }),
);

export const bensonDiscoveries = pgTable(
  'benson_discoveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    runHash: text('run_hash').notNull(),
    searchQueries: text('search_queries').array().notNull().default(sql`'{}'::text[]`),
    summary: text('summary').notNull().default(''),
    citations: jsonb('citations').notNull().default(sql`'[]'::jsonb`),
    itemsFound: jsonb('items_found').notNull().default(sql`'[]'::jsonb`),
    createdCount: integer('created_count').notNull().default(0),
    updatedCount: integer('updated_count').notNull().default(0),
    scoredCount: integer('scored_count').notNull().default(0),
    tokenUsage: jsonb('token_usage').notNull().default(sql`'{}'::jsonb`),
    estimatedCost: numeric('estimated_cost', { precision: 12, scale: 6 }).notNull().default('0'),
  },
  (t) => ({
    createdIdx: index('idx_benson_discoveries_created').on(t.createdAt),
    runHashUq: unique().on(t.runHash),
  }),
);

export const bensonPushSettings = pgTable('benson_push_settings', {
  id: text('id').primaryKey().default('global'),
  masterEnabled: boolean('master_enabled').notNull().default(true),
  topics: jsonb('topics').notNull().default(sql`'{}'::jsonb`),
  lastSentAt: jsonb('last_sent_at').notNull().default(sql`'{}'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bensonPushSubscriptions = pgTable(
  'benson_push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    endpointUq: unique().on(t.endpoint),
    updatedIdx: index('idx_benson_push_subscriptions_updated').on(t.updatedAt),
  }),
);

export const bensonMilestones = pgTable('benson_milestones', {
  id: text('id').primaryKey(),
  reachedAt: timestamp('reached_at', { withTimezone: true }).notNull().defaultNow(),
  followerCount: integer('follower_count'),
  pushSentAt: timestamp('push_sent_at', { withTimezone: true }),
  celebratedAt: timestamp('celebrated_at', { withTimezone: true }),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
});

export const bensonRecommendationEvents = pgTable(
  'benson_recommendation_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    source: text('source').notNull(),
    contentItemId: uuid('content_item_id').references(() => contentItems.id, { onDelete: 'set null' }),
    plannerItemId: uuid('planner_item_id').references(() => plannerItems.id, { onDelete: 'set null' }),
    operatorRecommendationId: uuid('operator_recommendation_id'),
    confidence: numeric('confidence', { precision: 5, scale: 4 }),
    rationale: text('rationale'),
    category: text('category'),
    userResponse: text('user_response'),
    responseReason: text('response_reason'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    shootSessionId: uuid('shoot_session_id'),
    outcomeLinkId: uuid('outcome_link_id'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    createdIdx: index('idx_benson_recommendation_events_created').on(t.createdAt),
    contentIdx: index('idx_benson_recommendation_events_content').on(t.contentItemId),
    responseIdx: index('idx_benson_recommendation_events_response').on(t.userResponse, t.createdAt),
  }),
);

export const shootSessions = pgTable(
  'shoot_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    status: text('status').notNull().default('active'),
    completionReason: text('completion_reason'),
    contentItemId: uuid('content_item_id').references(() => contentItems.id, { onDelete: 'set null' }),
    sponsorContactId: uuid('sponsor_contact_id').references(() => sponsorContacts.id, {
      onDelete: 'set null',
    }),
    locationLabel: text('location_label'),
    locationLat: numeric('location_lat', { precision: 10, scale: 7 }),
    locationLng: numeric('location_lng', { precision: 10, scale: 7 }),
    contentFormat: text('content_format'),
    shotIndex: integer('shot_index').notNull().default(0),
    shots: jsonb('shots').notNull().default(sql`'[]'::jsonb`),
    talkingPoints: jsonb('talking_points').notNull().default(sql`'[]'::jsonb`),
    keyFacts: jsonb('key_facts').notNull().default(sql`'[]'::jsonb`),
    notes: jsonb('notes').notNull().default(sql`'[]'::jsonb`),
    voiceNotes: jsonb('voice_notes').notNull().default(sql`'[]'::jsonb`),
    mediaRefs: jsonb('media_refs').notNull().default(sql`'[]'::jsonb`),
    sponsorChecklist: jsonb('sponsor_checklist').notNull().default(sql`'{}'::jsonb`),
    disclosureChecklist: jsonb('disclosure_checklist').notNull().default(sql`'{}'::jsonb`),
    issues: jsonb('issues').notNull().default(sql`'[]'::jsonb`),
    summary: jsonb('summary').notNull().default(sql`'{}'::jsonb`),
    outcomeLinkId: uuid('outcome_link_id'),
  },
  (t) => ({
    statusStartedIdx: index('idx_shoot_sessions_status_started').on(t.status, t.startedAt),
    contentIdx: index('idx_shoot_sessions_content').on(t.contentItemId),
  }),
);

export const contentOutcomeLinks = pgTable(
  'content_outcome_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    contentItemId: uuid('content_item_id').references(() => contentItems.id, { onDelete: 'set null' }),
    recommendationEventId: uuid('recommendation_event_id').references(() => bensonRecommendationEvents.id, {
      onDelete: 'set null',
    }),
    shootSessionId: uuid('shoot_session_id').references(() => shootSessions.id, { onDelete: 'set null' }),
    intakeSubmissionId: uuid('intake_submission_id').references(() => shareIntakeSubmissions.id, {
      onDelete: 'set null',
    }),
    draftAssetId: uuid('draft_asset_id').references(() => creatorDraftAssets.id, { onDelete: 'set null' }),
    creatorVideoId: uuid('creator_video_id').references(() => creatorVideos.id, { onDelete: 'set null' }),
    sponsorContactId: uuid('sponsor_contact_id').references(() => sponsorContacts.id, {
      onDelete: 'set null',
    }),
    outreachEmailId: uuid('outreach_email_id'),
    pipelineOpportunityId: uuid('pipeline_opportunity_id'),
    linkConfidence: numeric('link_confidence', { precision: 5, scale: 4 }).notNull().default('1.0'),
    linkSource: text('link_source').notNull().default('auto'),
    outcomeScore: numeric('outcome_score', { precision: 8, scale: 4 }),
    outcomeClassification: text('outcome_classification'),
    revenueRecognized: numeric('revenue_recognized', { precision: 12, scale: 2 }),
    dealValue: numeric('deal_value', { precision: 12, scale: 2 }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    createdIdx: index('idx_content_outcome_links_created').on(t.createdAt),
    contentIdx: index('idx_content_outcome_links_content').on(t.contentItemId),
    classificationIdx: index('idx_content_outcome_links_classification').on(t.outcomeClassification),
  }),
);

export const contentPerformanceSnapshots = pgTable(
  'content_performance_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    outcomeLinkId: uuid('outcome_link_id')
      .notNull()
      .references(() => contentOutcomeLinks.id, { onDelete: 'cascade' }),
    creatorVideoId: uuid('creator_video_id').references(() => creatorVideos.id, { onDelete: 'set null' }),
    snapshotKind: text('snapshot_kind').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    views: integer('views').notNull().default(0),
    likes: integer('likes').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    shares: integer('shares').notNull().default(0),
    saves: integer('saves'),
    followersGained: integer('followers_gained'),
    engagementRate: numeric('engagement_rate', { precision: 8, scale: 6 }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    outcomeKindIdx: index('idx_content_performance_snapshots_outcome_kind').on(
      t.outcomeLinkId,
      t.snapshotKind,
    ),
  }),
);

export const workerHeartbeats = pgTable('worker_heartbeats', {
  workerId: text('worker_id').primaryKey(),
  displayName: text('display_name').notNull(),
  scheduleLabel: text('schedule_label'),
  enabled: boolean('enabled').notNull().default(true),
  status: text('status').notNull().default('unknown'),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
  lastErrorSummary: text('last_error_summary'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  lastDurationMs: integer('last_duration_ms'),
  queueDepth: integer('queue_depth'),
  retryCount: integer('retry_count').notNull().default(0),
  currentJob: text('current_job'),
  nextScheduledAt: timestamp('next_scheduled_at', { withTimezone: true }),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workerJobRuns = pgTable(
  'worker_job_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workerId: text('worker_id')
      .notNull()
      .references(() => workerHeartbeats.workerId, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: text('status').notNull().default('running'),
    durationMs: integer('duration_ms'),
    errorSummary: text('error_summary'),
    retryCount: integer('retry_count').notNull().default(0),
    trigger: text('trigger').notNull().default('scheduled'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    workerStartedIdx: index('idx_worker_job_runs_worker_started').on(t.workerId, t.startedAt),
    statusIdx: index('idx_worker_job_runs_status').on(t.status, t.startedAt),
  }),
);

export const workerIncidents = pgTable(
  'worker_incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workerId: text('worker_id')
      .notNull()
      .references(() => workerHeartbeats.workerId, { onDelete: 'cascade' }),
    state: text('state').notNull().default('detected'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    recoveringAt: timestamp('recovering_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    errorSummary: text('error_summary'),
    consecutiveFailureCount: integer('consecutive_failure_count').notNull().default(1),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastFailedRunId: uuid('last_failed_run_id').references(() => workerJobRuns.id, {
      onDelete: 'set null',
    }),
    recoveryRunId: uuid('recovery_run_id').references(() => workerJobRuns.id, { onDelete: 'set null' }),
    notificationSentAt: timestamp('notification_sent_at', { withTimezone: true }),
    recoveryNotificationSentAt: timestamp('recovery_notification_sent_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activeIdx: index('idx_worker_incidents_active').on(t.workerId, t.state),
  }),
);

export const entitySuppressions = pgTable(
  'entity_suppressions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    canonicalEntityId: uuid('canonical_entity_id'),
    canonicalName: text('canonical_name').notNull(),
    aliases: text('aliases').array().notNull().default(sql`'{}'`),
    domains: text('domains').array().notNull().default(sql`'{}'`),
    addresses: text('addresses').array().notNull().default(sql`'{}'`),
    phoneNumbers: text('phone_numbers').array().notNull().default(sql`'{}'`),
    socialHandles: text('social_handles').array().notNull().default(sql`'{}'`),
    linkedRecordIds: uuid('linked_record_ids').array().notNull().default(sql`'{}'`),
    suppressionReason: text('suppression_reason').notNull(),
    suppressionScope: suppressionScopeEnum('suppression_scope').notNull().default('suppress_everywhere'),
    permanent: boolean('permanent').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    restoredAt: timestamp('restored_at', { withTimezone: true }),
    createdBy: text('created_by').notNull().default('system'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    scopeIdx: index('idx_entity_suppressions_scope').on(t.suppressionScope),
    nameIdx: index('idx_entity_suppressions_name').on(t.canonicalName),
  }),
);

export const creatorCategoryRules = pgTable('creator_category_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleKey: text('rule_key').notNull().unique(),
  label: text('label').notNull(),
  categoryPattern: text('category_pattern').notNull(),
  sourceTypePattern: text('source_type_pattern'),
  defaultAction: creatorValueStatusEnum('default_action').notNull().default('hidden_raw_signal'),
  allowWhen: jsonb('allow_when').notNull().default(sql`'[]'::jsonb`),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const creatorFeedbackEvents = pgTable(
  'creator_feedback_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recordType: text('record_type').notNull(),
    recordId: uuid('record_id').notNull(),
    action: text('action').notNull(),
    reasonCode: text('reason_code'),
    comment: text('comment'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    recordIdx: index('idx_creator_feedback_record').on(t.recordType, t.recordId, t.createdAt),
  }),
);

export const creatorInterestRecords = pgTable(
  'creator_interest_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentItemId: uuid('content_item_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'set null' }),
    interestLevel: text('interest_level').notNull().default('interested'),
    sourceScreen: text('source_screen').notNull().default('unknown'),
    requestedAssistance: text('requested_assistance').array().notNull().default(sql`'{}'::text[]`),
    enrichmentStatus: researchJobStatusEnum('enrichment_status').notNull().default('queued'),
    researchJobId: uuid('research_job_id'),
    nextAction: text('next_action'),
    plannedDate: timestamp('planned_date', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    outcome: text('outcome'),
    assistancePackage: jsonb('assistance_package').notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('idx_creator_interest_status').on(t.enrichmentStatus, t.updatedAt),
    itemIdx: index('idx_creator_interest_item').on(t.contentItemId),
  }),
);

export const creatorResearchJobs = pgTable(
  'creator_research_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentItemId: uuid('content_item_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    interestRecordId: uuid('interest_record_id').references(() => creatorInterestRecords.id, {
      onDelete: 'set null',
    }),
    status: researchJobStatusEnum('status').notNull().default('queued'),
    enrichment: jsonb('enrichment').notNull().default(sql`'{}'::jsonb`),
    errorMessage: text('error_message'),
    retryCount: integer('retry_count').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    itemIdx: index('idx_creator_research_jobs_item').on(t.contentItemId, t.createdAt),
  }),
);

export const creatorPartnerships = pgTable(
  'creator_partnerships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentItemId: uuid('content_item_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    submittedUrl: text('submitted_url'),
    submittedText: text('submitted_text'),
    brandName: text('brand_name'),
    productName: text('product_name'),
    retailerName: text('retailer_name'),
    pipelineStatus: text('pipeline_status').notNull().default('discovered'),
    monetizationPaths: text('monetization_paths').array().notNull().default(sql`'{}'::text[]`),
    fitScore: integer('fit_score'),
    fitScoreBreakdown: jsonb('fit_score_breakdown').notNull().default(sql`'{}'::jsonb`),
    research: jsonb('research').notNull().default(sql`'{}'::jsonb`),
    creatorPlay: jsonb('creator_play').notNull().default(sql`'{}'::jsonb`),
    needsVerification: text('needs_verification').array().notNull().default(sql`'{}'::text[]`),
    followUpAt: timestamp('follow_up_at', { withTimezone: true }),
    calendarReminderAt: timestamp('calendar_reminder_at', { withTimezone: true }),
    researchStatus: researchJobStatusEnum('research_status').notNull().default('queued'),
    researchError: text('research_error'),
    fingerprints: jsonb('fingerprints').notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    contentItemIdx: index('idx_creator_partnerships_content_item').on(t.contentItemId),
    statusIdx: index('idx_creator_partnerships_status').on(t.pipelineStatus, t.updatedAt),
  }),
);

export const creatorPlatformRelationships = pgTable(
  'creator_platform_relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platformName: text('platform_name').notNull(),
    domain: text('domain'),
    status: text('status').notNull().default('unknown'),
    accountEmail: text('account_email'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameIdx: index('idx_creator_platform_relationships_name').on(t.platformName),
  }),
);

export const creatorPlatformActivities = pgTable(
  'creator_platform_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorPlatformRelationshipId: uuid('creator_platform_relationship_id')
      .notNull()
      .references(() => creatorPlatformRelationships.id, { onDelete: 'cascade' }),
    activityType: text('activity_type').notNull(),
    gmailMessageId: text('gmail_message_id').notNull(),
    gmailThreadId: text('gmail_thread_id'),
    subject: text('subject'),
    snippet: text('snippet'),
    suggestedAction: text('suggested_action'),
    followUpAt: timestamp('follow_up_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    relationshipIdx: index('idx_creator_platform_activities_relationship').on(
      t.creatorPlatformRelationshipId,
      t.createdAt,
    ),
  }),
);

export const creatorPartnershipActivities = pgTable(
  'creator_partnership_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorPartnershipId: uuid('creator_partnership_id').references(() => creatorPartnerships.id, {
      onDelete: 'cascade',
    }),
    activityType: text('activity_type').notNull(),
    entityType: text('entity_type').notNull().default('unknown'),
    entityName: text('entity_name'),
    gmailMessageId: text('gmail_message_id').notNull(),
    gmailThreadId: text('gmail_thread_id'),
    senderEmail: text('sender_email'),
    senderDomain: text('sender_domain'),
    subject: text('subject'),
    snippet: text('snippet'),
    matchConfidence: numeric('match_confidence', { precision: 6, scale: 4 }),
    matchedOn: text('matched_on'),
    suggestedStatus: text('suggested_status'),
    suggestedAction: text('suggested_action'),
    suggestedFollowUpAt: timestamp('suggested_follow_up_at', { withTimezone: true }),
    requiresConfirmation: boolean('requires_confirmation').notNull().default(true),
    confirmationStatus: text('confirmation_status').notNull().default('pending'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    partnershipIdx: index('idx_creator_partnership_activities_partnership').on(
      t.creatorPartnershipId,
      t.createdAt,
    ),
  }),
);

export const bensonDataRevisions = pgTable('benson_data_revisions', {
  domain: text('domain').primaryKey(),
  revision: integer('revision').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  lastEventType: text('last_event_type'),
  lastSource: text('last_source'),
  lastSuccess: boolean('last_success').notNull().default(true),
  lastRecordIds: jsonb('last_record_ids').notNull().default(sql`'[]'::jsonb`),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
});

export const creatorSkippedRecords = pgTable(
  'creator_skipped_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentItemId: uuid('content_item_id').references(() => contentItems.id, { onDelete: 'set null' }),
    skipIdentityKey: text('skip_identity_key'),
    occurrenceFingerprint: text('occurrence_fingerprint').notNull(),
    skippedAt: timestamp('skipped_at', { withTimezone: true }).notNull().defaultNow(),
    sourceScreen: text('source_screen').notNull().default('unknown'),
    snoozeUntil: timestamp('snooze_until', { withTimezone: true }),
    restoredAt: timestamp('restored_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    itemIdx: index('idx_creator_skipped_item').on(t.contentItemId, t.skippedAt),
  }),
);

export const voiceSettings = pgTable('voice_settings', {
  creatorId: uuid('creator_id')
    .primaryKey()
    .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
  voiceMode: text('voice_mode').notNull().default('studio'),
  voiceboxProfileId: text('voicebox_profile_id'),
  autoPlay: text('auto_play').notNull().default('off'),
  playbackSpeed: numeric('playback_speed', { precision: 4, scale: 2 }).notNull().default('1.0'),
  longAnswerMode: text('long_answer_mode').notNull().default('ask'),
  fallbackEnabled: boolean('fallback_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const voiceGenerationJobs = pgTable(
  'voice_generation_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: text('request_id').notNull(),
    messageId: uuid('message_id').references(() => bensonChatMessages.id, { onDelete: 'set null' }),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    voiceProfile: text('voice_profile').notNull(),
    engine: text('engine').notNull(),
    textHash: text('text_hash').notNull(),
    spokenText: text('spoken_text').notNull(),
    speechTransformVersion: integer('speech_transform_version').notNull().default(1),
    playbackSpeed: numeric('playback_speed', { precision: 4, scale: 2 }).notNull().default('1.0'),
    status: text('status').notNull().default('queued'),
    queueTimestamp: timestamp('queue_timestamp', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    retryCount: integer('retry_count').notNull().default(0),
    sanitizedError: text('sanitized_error'),
    generatedAudioId: uuid('generated_audio_id'),
    durationSeconds: numeric('duration_seconds', { precision: 10, scale: 3 }),
    modelVersion: text('model_version'),
    chunkIndex: integer('chunk_index').notNull().default(0),
    chunkTotal: integer('chunk_total').notNull().default(1),
    voiceboxGenerationId: text('voicebox_generation_id'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusQueueIdx: index('idx_voice_jobs_status_queue').on(t.status, t.queueTimestamp),
    creatorMessageIdx: index('idx_voice_jobs_creator_message').on(t.creatorId, t.messageId, t.createdAt),
  }),
);

export const generatedVoiceAudio = pgTable(
  'generated_voice_audio',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id').references(() => bensonChatMessages.id, { onDelete: 'set null' }),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => voiceGenerationJobs.id, { onDelete: 'set null' }),
    textHash: text('text_hash').notNull(),
    voiceProfile: text('voice_profile').notNull(),
    engine: text('engine').notNull(),
    modelVersion: text('model_version'),
    speechTransformVersion: integer('speech_transform_version').notNull().default(1),
    playbackSpeed: numeric('playback_speed', { precision: 4, scale: 2 }).notNull().default('1.0'),
    durationSeconds: numeric('duration_seconds', { precision: 10, scale: 3 }),
    fileFormat: text('file_format').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull().default(0),
    storagePath: text('storage_path').notNull(),
    originalPeakDb: numeric('original_peak_db', { precision: 8, scale: 3 }),
    normalizedPeakDb: numeric('normalized_peak_db', { precision: 8, scale: 3 }),
    chunkIndex: integer('chunk_index').notNull().default(0),
    chunkTotal: integer('chunk_total').notNull().default(1),
    generationMetadata: jsonb('generation_metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastPlayedAt: timestamp('last_played_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    expiresIdx: index('idx_generated_voice_audio_expires').on(t.expiresAt),
  }),
);

export const voiceServiceHealth = pgTable('voice_service_health', {
  id: text('id').primaryKey().default('default'),
  serviceStatus: text('service_status').notNull().default('unavailable'),
  modelStatus: text('model_status').notNull().default('not_installed'),
  queueStatus: text('queue_status').notNull().default('healthy'),
  activeEngine: text('active_engine'),
  modelVersion: text('model_version'),
  voiceboxProfileId: text('voicebox_profile_id'),
  voiceboxUpstreamTag: text('voicebox_upstream_tag'),
  voiceboxUpstreamCommit: text('voicebox_upstream_commit'),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }),
  lastSuccessfulGeneration: timestamp('last_successful_generation', { withTimezone: true }),
  lastFailedGeneration: timestamp('last_failed_generation', { withTimezone: true }),
  averageGenerationMs: integer('average_generation_ms'),
  currentQueueDepth: integer('current_queue_depth').notNull().default(0),
  sanitizedLatestError: text('sanitized_latest_error'),
  generationPaused: boolean('generation_paused').notNull().default(false),
  storageBytes: integer('storage_bytes').notNull().default(0),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const calendarItemTypeEnum = pgEnum('calendar_item_type', [
  'public_event',
  'content_filming',
  'content_posting',
  'sponsor_outreach',
  'creator_task',
  'early_signal',
  'personal_busy',
]);

export const calendarPlanningStatusEnum = pgEnum('calendar_planning_status', [
  'suggested',
  'tentative',
  'confirmed',
  'completed',
  'missed',
  'cancelled',
  'expired',
  'dismissed',
]);

export const calendarSyncStatusEnum = pgEnum('calendar_sync_status', [
  'benson_only',
  'ready_to_export',
  'syncing',
  'synced',
  'update_available',
  'sync_failed',
  'google_auth_required',
  'removed_from_google',
]);

export const creatorCalendarItems = pgTable(
  'creator_calendar_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description'),
    itemType: calendarItemTypeEnum('item_type').notNull().default('public_event'),
    sourceRecordType: text('source_record_type'),
    sourceRecordId: uuid('source_record_id'),
    sourceUrl: text('source_url'),
    internalDetailUrl: text('internal_detail_url'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }),
    allDay: boolean('all_day').notNull().default(false),
    timezone: text('timezone').notNull().default('America/Chicago'),
    location: text('location'),
    latitude: numeric('latitude'),
    longitude: numeric('longitude'),
    status: calendarPlanningStatusEnum('status').notNull().default('tentative'),
    planningStatus: calendarPlanningStatusEnum('planning_status').notNull().default('tentative'),
    creatorAction: text('creator_action'),
    reminderSettings: jsonb('reminder_settings').notNull().default(sql`'{}'::jsonb`),
    contentFormat: text('content_format'),
    verifiedFields: jsonb('verified_fields').notNull().default(sql`'[]'::jsonb`),
    unverifiedFields: jsonb('unverified_fields').notNull().default(sql`'[]'::jsonb`),
    notes: text('notes'),
    travelMinutes: integer('travel_minutes'),
    createdBy: text('created_by').notNull().default('kellie'),
    isTest: boolean('is_test').notNull().default(false),
    testRunId: text('test_run_id'),
    idempotencyKey: text('idempotency_key'),
    calendarIntent: text('calendar_intent'),
    occurrenceFingerprint: text('occurrence_fingerprint'),
    dismissReason: text('dismiss_reason'),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    verificationState: text('verification_state').notNull().default('unverified'),
    userEditedAt: timestamp('user_edited_at', { withTimezone: true }),
    populationSource: text('population_source'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    missedAt: timestamp('missed_at', { withTimezone: true }),
    expiredAt: timestamp('expired_at', { withTimezone: true }),
  },
  (t) => ({
    startIdx: index('idx_creator_calendar_items_start').on(t.startAt),
    statusStartIdx: index('idx_creator_calendar_items_status_start').on(t.planningStatus, t.startAt),
    sourceIdx: index('idx_creator_calendar_items_source').on(t.sourceRecordType, t.sourceRecordId),
    idempotencyKeyUnique: uniqueIndex('creator_calendar_items_idempotency_key_key')
      .on(t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    isTestIdx: index('idx_creator_calendar_items_is_test').on(t.isTest).where(sql`${t.isTest} = true`),
    occurrenceFpIdx: index('idx_creator_calendar_items_occurrence_fp')
      .on(t.occurrenceFingerprint)
      .where(sql`${t.occurrenceFingerprint} IS NOT NULL`),
    dismissedIdx: index('idx_creator_calendar_items_dismissed')
      .on(t.dismissedAt)
      .where(sql`${t.dismissedAt} IS NOT NULL`),
  }),
);

export const calendarDismissalFeedback = pgTable(
  'calendar_dismissal_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    calendarItemId: uuid('calendar_item_id').references(() => creatorCalendarItems.id, {
      onDelete: 'set null',
    }),
    sourceRecordType: text('source_record_type'),
    sourceRecordId: uuid('source_record_id'),
    occurrenceFingerprint: text('occurrence_fingerprint').notNull(),
    calendarIntent: text('calendar_intent'),
    dismissReason: text('dismiss_reason').notNull(),
    planningStatusBefore: text('planning_status_before'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fpIdx: index('idx_calendar_dismissal_feedback_fp').on(t.occurrenceFingerprint),
    sourceIdx: index('idx_calendar_dismissal_feedback_source').on(t.sourceRecordType, t.sourceRecordId),
  }),
);

export const calendarCategorySnoozes = pgTable('calendar_category_snoozes', {
  categoryKey: text('category_key').primaryKey(),
  label: text('label').notNull(),
  until: timestamp('until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const googleCalendarConnections = pgTable('google_calendar_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email'),
  accessTokenEncrypted: text('access_token_encrypted'),
  refreshTokenEncrypted: text('refresh_token_encrypted'),
  scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  status: text('status').notNull().default('disconnected'),
  selectedCalendarId: text('selected_calendar_id'),
  selectedCalendarName: text('selected_calendar_name'),
  dedicatedCalendarId: text('dedicated_calendar_id'),
  dedicatedCalendarName: text('dedicated_calendar_name'),
  availabilityEnabled: boolean('availability_enabled').notNull().default(false),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
  lastSuccessfulSyncAt: timestamp('last_successful_sync_at', { withTimezone: true }),
  lastFailedSyncAt: timestamp('last_failed_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const calendarSyncRecords = pgTable(
  'calendar_sync_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    calendarItemId: uuid('calendar_item_id')
      .notNull()
      .references(() => creatorCalendarItems.id, { onDelete: 'cascade' }),
    googleCalendarId: text('google_calendar_id').notNull(),
    googleEventId: text('google_event_id'),
    payloadHash: text('payload_hash'),
    syncStatus: calendarSyncStatusEnum('sync_status').notNull().default('benson_only'),
    autoUpdateEnabled: boolean('auto_update_enabled').notNull().default(false),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastGoogleModifiedAt: timestamp('last_google_modified_at', { withTimezone: true }),
    lastError: text('last_error'),
    retryCount: integer('retry_count').notNull().default(0),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    itemUnique: uniqueIndex('calendar_sync_records_calendar_item_id_key').on(t.calendarItemId),
    googleEventIdx: index('idx_calendar_sync_google_event').on(t.googleEventId),
  }),
);

export const canonicalBusinesses = pgTable(
  'canonical_businesses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    category: text('category'),
    website: text('website'),
    address: text('address'),
    localRelevanceScore: numeric('local_relevance_score', { precision: 4, scale: 3 }),
    sponsorFitStatus: text('sponsor_fit_status').notNull().default('unknown'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    normalizedIdx: index('idx_canonical_businesses_normalized').on(t.normalizedName),
  }),
);

export const llmUsageEvents = pgTable(
  'llm_usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    source: text('source').notNull(),
    model: text('model'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    estimatedCost: numeric('estimated_cost', { precision: 12, scale: 6 }).notNull().default('0'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    createdIdx: index('idx_llm_usage_events_created').on(t.createdAt),
    sourceCreatedIdx: index('idx_llm_usage_events_source_created').on(t.source, t.createdAt),
  }),
);

export const sourceWatchers = pgTable(
  'source_watchers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceName: text('source_name').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceCategory: text('source_category').notNull().default('general'),
    adapterType: text('adapter_type').notNull().default('html_watch'),
    checkFrequencyMs: integer('check_frequency_ms').notNull().default(21_600_000),
    lastSuccessfulCheck: timestamp('last_successful_check', { withTimezone: true }),
    lastChangedAt: timestamp('last_changed_at', { withTimezone: true }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
    lastFailureMessage: text('last_failure_message'),
    enabled: boolean('enabled').notNull().default(true),
    consecutiveFailureCount: integer('consecutive_failure_count').notNull().default(0),
    healthStatus: text('health_status').notNull().default('unknown'),
    linkedSourceId: uuid('linked_source_id').references(() => sources.id, { onDelete: 'set null' }),
    config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
    submittedUrl: text('submitted_url'),
    canonicalSourceUrl: text('canonical_source_url'),
    publisherUrl: text('publisher_url'),
    platform: text('platform'),
    jurisdiction: text('jurisdiction').default('Kansas City, MO'),
    monitoringMode: text('monitoring_mode').notNull().default('WATCH_PAGE'),
    approvalStatus: text('approval_status').notNull().default('approved'),
    adaptiveFrequency: boolean('adaptive_frequency').notNull().default(true),
    paused: boolean('paused').notNull().default(false),
    sourceReliability: numeric('source_reliability', { precision: 4, scale: 3 }),
    creatorLeadPotential: numeric('creator_lead_potential', { precision: 4, scale: 3 }),
    signalToNoiseScore: numeric('signal_to_noise_score', { precision: 4, scale: 3 }),
    lastAttemptedCheck: timestamp('last_attempted_check', { withTimezone: true }),
    lastNewItemDetected: timestamp('last_new_item_detected', { withTimezone: true }),
    lastMaterialChange: timestamp('last_material_change', { withTimezone: true }),
    latestContentDate: timestamp('latest_content_date', { withTimezone: true }),
    sessionStatus: text('session_status').default('none'),
    authenticationRequired: boolean('authentication_required').notNull().default(false),
    robotsReviewStatus: text('robots_review_status').default('pending'),
    extractionConfig: jsonb('extraction_config').notNull().default(sql`'{}'::jsonb`),
    selectorConfig: jsonb('selector_config').notNull().default(sql`'{}'::jsonb`),
    createdBy: text('created_by').default('creator'),
    watcherKind: text('watcher_kind').notNull().default('generic'),
    // Stable real-world identity (e.g. "instagram:account:jasfoodjourney").
    // Live uniqueness is the partial unique index from migrate-watch-source-canonical-identity:
    // idx_source_watchers_canonical_key_unique ON (canonical_key) WHERE canonical_key IS NOT NULL.
    canonicalKey: text('canonical_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    enabledIdx: index('idx_source_watchers_enabled').on(t.enabled, t.healthStatus),
    adapterIdx: index('idx_source_watchers_adapter').on(t.adapterType, t.enabled),
    canonicalKeyIdx: uniqueIndex('idx_source_watchers_canonical_key_unique')
      .on(t.canonicalKey)
      .where(sql`${t.canonicalKey} IS NOT NULL`),
  }),
);

export const sourceSnapshots = pgTable(
  'source_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    watcherId: uuid('watcher_id')
      .notNull()
      .references(() => sourceWatchers.id, { onDelete: 'cascade' }),
    contentHash: text('content_hash').notNull(),
    extractedContent: text('extracted_content'),
    responseStatus: integer('response_status'),
    changeSummary: text('change_summary'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    watcherFetchedIdx: index('idx_source_snapshots_watcher_fetched').on(t.watcherId, t.fetchedAt),
  }),
);

export const scoutSourceRuns = pgTable(
  'scout_source_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    watcherId: uuid('watcher_id')
      .notNull()
      .references(() => sourceWatchers.id, { onDelete: 'cascade' }),
    triggerType: text('trigger_type').notNull().default('scheduled'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    fetchMethodsAttempted: text('fetch_methods_attempted').array().notNull().default(sql`'{}'::text[]`),
    finalFetchMethod: text('final_fetch_method'),
    responseStatus: integer('response_status'),
    itemCount: integer('item_count').notNull().default(0),
    newCount: integer('new_count').notNull().default(0),
    changedCount: integer('changed_count').notNull().default(0),
    hiddenCount: integer('hidden_count').notNull().default(0),
    qualifiedCount: integer('qualified_count').notNull().default(0),
    failureCategory: text('failure_category'),
    sanitizedFailure: text('sanitized_failure'),
    cpuTimeMs: integer('cpu_time_ms'),
    memoryPeakMb: integer('memory_peak_mb'),
    bytesDownloaded: integer('bytes_downloaded').notNull().default(0),
    traceId: text('trace_id'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    watcherIdx: index('idx_scout_source_runs_watcher').on(t.watcherId, t.startedAt),
  }),
);

export const scoutItems = pgTable(
  'scout_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    watcherId: uuid('watcher_id')
      .notNull()
      .references(() => sourceWatchers.id, { onDelete: 'cascade' }),
    externalItemId: text('external_item_id'),
    itemUrl: text('item_url').notNull(),
    publisher: text('publisher'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    modifiedAt: timestamp('modified_at', { withTimezone: true }),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    captionText: text('caption_text'),
    rawMetadata: jsonb('raw_metadata').notNull().default(sql`'{}'::jsonb`),
    itemType: text('item_type').notNull().default('unknown'),
    lifecycleStatus: text('lifecycle_status').notNull().default('active'),
    creatorValueStatus: text('creator_value_status').notNull().default('pending'),
    contentHash: text('content_hash').notNull(),
    occurrenceFingerprint: text('occurrence_fingerprint').notNull(),
    linkedContentItemId: uuid('linked_content_item_id').references(() => contentItems.id, {
      onDelete: 'set null',
    }),
    linkedEarlySignalId: uuid('linked_early_signal_id').references(() => earlySignals.id, {
      onDelete: 'set null',
    }),
    linkedEntityId: uuid('linked_entity_id'),
    verificationStatus: text('verification_status').notNull().default('unverified'),
    relevanceExplanation: jsonb('relevance_explanation').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    watcherDetectedIdx: index('idx_scout_items_watcher_detected').on(t.watcherId, t.detectedAt),
  }),
);

export const scoutMediaAssets = pgTable('scout_media_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  scoutItemId: uuid('scout_item_id')
    .notNull()
    .references(() => scoutItems.id, { onDelete: 'cascade' }),
  mediaType: text('media_type').notNull(),
  originalUrl: text('original_url'),
  storagePath: text('storage_path'),
  mimeType: text('mime_type'),
  width: integer('width'),
  height: integer('height'),
  durationSeconds: numeric('duration_seconds', { precision: 10, scale: 3 }),
  contentHash: text('content_hash'),
  ocrStatus: text('ocr_status').notNull().default('pending'),
  ocrConfidence: numeric('ocr_confidence', { precision: 5, scale: 3 }),
  extractedText: text('extracted_text'),
  ocrEngine: text('ocr_engine'),
  slideIndex: integer('slide_index'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

export const scoutExtractedDocuments = pgTable('scout_extracted_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  scoutItemId: uuid('scout_item_id').references(() => scoutItems.id, { onDelete: 'cascade' }),
  documentUrl: text('document_url'),
  fileType: text('file_type'),
  fileHash: text('file_hash'),
  pageCount: integer('page_count'),
  extractionStatus: text('extraction_status').notNull().default('queued'),
  structuredOutput: jsonb('structured_output').notNull().default(sql`'{}'::jsonb`),
  pageEvidence: jsonb('page_evidence').notNull().default(sql`'[]'::jsonb`),
  tableEvidence: jsonb('table_evidence').notNull().default(sql`'[]'::jsonb`),
  extractionEngine: text('extraction_engine'),
  extractionVersion: text('extraction_version'),
  storagePath: text('storage_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

export const scoutSocialSessions = pgTable('scout_social_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  watcherId: uuid('watcher_id')
    .notNull()
    .references(() => sourceWatchers.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  profileReference: text('profile_reference').notNull(),
  sessionStatus: text('session_status').notNull().default('unknown'),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  needsUserLogin: boolean('needs_user_login').notNull().default(false),
  sanitizedFailure: text('sanitized_failure'),
  storageRef: text('storage_ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scoutEvidence = pgTable(
  'scout_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scoutItemId: uuid('scout_item_id').references(() => scoutItems.id, { onDelete: 'cascade' }),
    earlySignalId: uuid('early_signal_id').references(() => earlySignals.id, { onDelete: 'cascade' }),
    evidenceType: text('evidence_type').notNull(),
    sourceUrl: text('source_url'),
    sourceName: text('source_name'),
    pageOrImageRef: text('page_or_image_ref'),
    quotedClaim: text('quoted_claim').notNull(),
    fieldSupported: text('field_supported'),
    confidence: numeric('confidence', { precision: 5, scale: 3 }),
    verificationStatus: text('verification_status').notNull().default('unverified'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    itemIdx: index('idx_scout_evidence_item').on(t.scoutItemId, t.detectedAt),
  }),
);

export const curatorSocialPosts = pgTable(
  'curator_social_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    watcherId: uuid('watcher_id')
      .notNull()
      .references(() => sourceWatchers.id, { onDelete: 'cascade' }),
    scoutItemId: uuid('scout_item_id').references(() => scoutItems.id, { onDelete: 'set null' }),
    postUrl: text('post_url').notNull(),
    profileHandle: text('profile_handle').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    caption: text('caption'),
    postType: text('post_type').notNull().default('unknown'),
    sourceFingerprint: text('source_fingerprint').notNull(),
    lastSeenFingerprint: text('last_seen_fingerprint'),
    slideCount: integer('slide_count').notNull().default(0),
    outboundLinks: jsonb('outbound_links').notNull().default(sql`'[]'::jsonb`),
    ephemeralSource: boolean('ephemeral_source').notNull().default(false),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fingerprintIdx: index('idx_curator_posts_fingerprint').on(t.watcherId, t.sourceFingerprint),
    watcherPublishedIdx: index('idx_curator_posts_watcher_detected').on(t.watcherId, t.publishedAt),
  }),
);

export const curatorPostSlides = pgTable(
  'curator_post_slides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => curatorSocialPosts.id, { onDelete: 'cascade' }),
    scoutMediaAssetId: uuid('scout_media_asset_id').references(() => scoutMediaAssets.id, {
      onDelete: 'set null',
    }),
    slideNumber: integer('slide_number').notNull(),
    imageUrl: text('image_url'),
    storagePath: text('storage_path'),
    ocrText: text('ocr_text'),
    ocrStatus: text('ocr_status').notNull().default('pending'),
    ocrEngine: text('ocr_engine'),
    ocrConfidence: numeric('ocr_confidence', { precision: 5, scale: 3 }),
    contentHash: text('content_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    postSlideIdx: index('idx_curator_slides_post_number').on(t.postId, t.slideNumber),
  }),
);

export const curatorEventLeads = pgTable(
  'curator_event_leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    watcherId: uuid('watcher_id')
      .notNull()
      .references(() => sourceWatchers.id, { onDelete: 'cascade' }),
    postId: uuid('post_id').references(() => curatorSocialPosts.id, { onDelete: 'set null' }),
    slideId: uuid('slide_id').references(() => curatorPostSlides.id, { onDelete: 'set null' }),
    scoutItemId: uuid('scout_item_id').references(() => scoutItems.id, { onDelete: 'set null' }),
    eventName: text('event_name').notNull(),
    eventDate: date('event_date'),
    eventTime: text('event_time'),
    venue: text('venue'),
    neighborhood: text('neighborhood'),
    price: text('price'),
    ageRestriction: text('age_restriction'),
    registrationNotes: text('registration_notes'),
    dayHeading: text('day_heading'),
    discoveredViaHandle: text('discovered_via_handle').notNull(),
    discoveredViaPostUrl: text('discovered_via_post_url').notNull(),
    discoveredViaSlideNumber: integer('discovered_via_slide_number'),
    originalQuotedText: text('original_quoted_text'),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
    verificationStatus: text('verification_status').notNull().default('SOCIAL_LEAD'),
    officialOrganizerUrl: text('official_organizer_url'),
    officialVenueUrl: text('official_venue_url'),
    ticketUrl: text('ticket_url'),
    officialSocialUrl: text('official_social_url'),
    researchSummary: jsonb('research_summary').notNull().default(sql`'{}'::jsonb`),
    verificationNotes: text('verification_notes'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    creatorRecommendation: text('creator_recommendation'),
    creatorValueScore: numeric('creator_value_score', { precision: 5, scale: 3 }),
    creatorValueExplanation: jsonb('creator_value_explanation').notNull().default(sql`'{}'::jsonb`),
    linkedContentItemId: uuid('linked_content_item_id').references(() => contentItems.id, {
      onDelete: 'set null',
    }),
    linkedEarlySignalId: uuid('linked_early_signal_id').references(() => earlySignals.id, {
      onDelete: 'set null',
    }),
    linkedCalendarItemId: uuid('linked_calendar_item_id').references(() => creatorCalendarItems.id, {
      onDelete: 'set null',
    }),
    occurrenceFingerprint: text('occurrence_fingerprint').notNull(),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    dismissReason: text('dismiss_reason'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fingerprintIdx: index('idx_curator_leads_fingerprint').on(t.watcherId, t.occurrenceFingerprint),
    statusIdx: index('idx_curator_leads_watcher_status').on(
      t.watcherId,
      t.verificationStatus,
      t.eventDate,
    ),
  }),
);

export const curatorReliabilityStats = pgTable('curator_reliability_stats', {
  watcherId: uuid('watcher_id')
    .primaryKey()
    .references(() => sourceWatchers.id, { onDelete: 'cascade' }),
  leadsExtracted: integer('leads_extracted').notNull().default(0),
  leadsVerified: integer('leads_verified').notNull().default(0),
  leadsPartiallyVerified: integer('leads_partially_verified').notNull().default(0),
  leadsConflicted: integer('leads_conflicted').notNull().default(0),
  leadsExpired: integer('leads_expired').notNull().default(0),
  verificationRate: numeric('verification_rate', { precision: 5, scale: 3 }),
  conflictRate: numeric('conflict_rate', { precision: 5, scale: 3 }),
  earlyPostScore: numeric('early_post_score', { precision: 5, scale: 3 }),
  acceptedCount: integer('accepted_count').notNull().default(0),
  coveredCount: integer('covered_count').notNull().default(0),
  reliabilityScore: numeric('reliability_score', { precision: 5, scale: 3 }),
  noiseRate: numeric('noise_rate', { precision: 5, scale: 3 }),
  postsProcessed: integer('posts_processed').notNull().default(0),
  slidesProcessed: integer('slides_processed').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const urlIntakeQuarantine = pgTable(
  'url_intake_quarantine',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceUrl: text('source_url').notNull(),
    pageUrl: text('page_url'),
    userMessage: text('user_message'),
    extractedTitle: text('extracted_title'),
    extractedLocation: text('extracted_location'),
    extractedEventDate: date('extracted_event_date'),
    rejectionCode: text('rejection_code').notNull(),
    rejectionReason: text('rejection_reason').notNull(),
    entityName: text('entity_name'),
    entityDomain: text('entity_domain'),
    locationScope: text('location_scope'),
    rawExtraction: jsonb('raw_extraction').notNull().default(sql`'{}'::jsonb`),
    linkedContentItemId: uuid('linked_content_item_id').references(() => contentItems.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    domainIdx: index('idx_url_quarantine_domain').on(t.entityDomain, t.createdAt),
  }),
);

export const urlWatchRules = pgTable(
  'url_watch_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domain: text('domain').notNull(),
    businessName: text('business_name'),
    locationScope: text('location_scope'),
    cityScope: text('city_scope').default('Kansas City metro'),
    categoryScope: text('category_scope'),
    excludeBranches: jsonb('exclude_branches').notNull().default(sql`'[]'::jsonb`),
    watcherId: uuid('watcher_id').references(() => sourceWatchers.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    domainScopeIdx: uniqueIndex('idx_url_watch_rules_domain_scope').on(
      t.domain,
      sql`COALESCE(${t.locationScope}, '')`,
    ),
  }),
);

export const urlIntakeAudit = pgTable(
  'url_intake_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentItemId: uuid('content_item_id').references(() => contentItems.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    reasonCode: text('reason_code').notNull(),
    reasonDetail: text('reason_detail'),
    performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    itemIdx: index('idx_url_intake_audit_item').on(t.contentItemId, t.performedAt),
  }),
);

export const earlySignals = pgTable(
  'early_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    signalType: text('signal_type').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    sourceUrl: text('source_url'),
    sourceName: text('source_name'),
    sourceCategory: text('source_category'),
    businessName: text('business_name'),
    address: text('address'),
    city: text('city').default('Kansas City'),
    regionState: text('region_state').default('MO'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    firstDetectedAt: timestamp('first_detected_at', { withTimezone: true }).notNull().defaultNow(),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }).notNull().defaultNow(),
    eventDate: timestamp('event_date', { withTimezone: true }),
    rawText: text('raw_text'),
    normalizedData: jsonb('normalized_data').notNull().default(sql`'{}'::jsonb`),
    contentHash: text('content_hash').notNull(),
    confidenceLevel: text('confidence_level').notNull().default('low'),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }).notNull().default('0'),
    confidenceExplanation: jsonb('confidence_explanation').notNull().default(sql`'[]'::jsonb`),
    urgencyLevel: text('urgency_level').notNull().default('weak_signal'),
    urgencyScore: numeric('urgency_score', { precision: 5, scale: 2 }).notNull().default('0'),
    urgencyExplanation: jsonb('urgency_explanation').notNull().default(sql`'[]'::jsonb`),
    verificationStatus: text('verification_status').notNull().default('unverified'),
    signalState: text('signal_state').notNull().default('active'),
    linkedOpportunityId: uuid('linked_opportunity_id').references(() => contentItems.id, {
      onDelete: 'set null',
    }),
    watcherId: uuid('watcher_id').references(() => sourceWatchers.id, { onDelete: 'set null' }),
    clusterKey: text('cluster_key'),
    contentRecommendation: jsonb('content_recommendation').notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    alertSentAt: timestamp('alert_sent_at', { withTimezone: true }),
    alertContentHash: text('alert_content_hash'),
    creatorValueStatus: creatorValueStatusEnum('creator_value_status')
      .notNull()
      .default('hidden_raw_signal'),
    lifecycleStatus: lifecycleStatusEnum('lifecycle_status').notNull().default('active'),
    creatorRelevanceExplanation: jsonb('creator_relevance_explanation').notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    stateIdx: index('idx_early_signals_state').on(t.signalState, t.urgencyLevel, t.firstDetectedAt),
    clusterIdx: index('idx_early_signals_cluster').on(t.clusterKey),
    hashIdx: index('idx_early_signals_hash').on(t.contentHash),
    verificationIdx: index('idx_early_signals_verification').on(t.verificationStatus, t.confidenceLevel),
  }),
);

export const earlySignalEvidence = pgTable(
  'early_signal_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    signalId: uuid('signal_id')
      .notNull()
      .references(() => earlySignals.id, { onDelete: 'cascade' }),
    evidenceType: text('evidence_type').notNull(),
    sourceUrl: text('source_url'),
    sourceName: text('source_name'),
    extractedClaim: text('extracted_claim').notNull(),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    reliabilityScore: numeric('reliability_score', { precision: 5, scale: 2 }).notNull().default('0.5'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    signalIdx: index('idx_early_signal_evidence_signal').on(t.signalId, t.detectedAt),
  }),
);

export const alertDeliveries = pgTable(
  'alert_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    signalId: uuid('signal_id').references(() => earlySignals.id, { onDelete: 'set null' }),
    opportunityId: uuid('opportunity_id').references(() => contentItems.id, { onDelete: 'set null' }),
    channel: text('channel').notNull(),
    recipient: text('recipient'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }).notNull().defaultNow(),
    success: boolean('success').notNull().default(false),
    providerResponse: text('provider_response'),
    retryCount: integer('retry_count').notNull().default(0),
    payloadHash: text('payload_hash'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    signalIdx: index('idx_alert_deliveries_signal').on(t.signalId, t.channel, t.deliveredAt),
    hashIdx: index('idx_alert_deliveries_hash').on(t.payloadHash),
  }),
);

export const earlySignalAlertPreferences = pgTable('early_signal_alert_preferences', {
  id: text('id').primaryKey().default('global'),
  breakingOnly: boolean('breaking_only').notNull().default(false),
  highConfidence: boolean('high_confidence').notNull().default(true),
  dailyDigest: boolean('daily_digest').notNull().default(false),
  allQualified: boolean('all_qualified').notNull().default(false),
  quietHoursStart: integer('quiet_hours_start'),
  quietHoursEnd: integer('quiet_hours_end'),
  cities: text('cities').array().notNull().default(sql`ARRAY['Kansas City']::text[]`),
  signalCategories: text('signal_categories').array().notNull().default(sql`'{}'::text[]`),
  keywordPatterns: jsonb('keyword_patterns').notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const websiteSections = pgTable('website_sections', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  enabled: boolean('enabled').notNull().default(true),
  maxItems: integer('max_items').notNull().default(6),
  sectionType: text('section_type').notNull().default('media_grid'),
  config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const websiteMediaItems = pgTable(
  'website_media_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull().default(0),
    mediaKind: text('media_kind').notNull().default('image'),
    storageFilename: text('storage_filename').notNull(),
    thumbnailFilename: text('thumbnail_filename'),
    durationSeconds: numeric('duration_seconds', { precision: 10, scale: 2 }),
    width: integer('width'),
    height: integer('height'),
    uploadedBy: text('uploaded_by').notNull().default('kellie'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    aiCategory: text('ai_category'),
    aiCaption: text('ai_caption'),
    aiAltText: text('ai_alt_text'),
    aiContentType: text('ai_content_type'),
    aiSuggestedPlacement: text('ai_suggested_placement'),
    aiMetadata: jsonb('ai_metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uploadedIdx: index('idx_website_media_uploaded').on(t.uploadedAt),
  }),
);

export const websiteDrafts = pgTable(
  'website_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    sectionId: text('section_id')
      .notNull()
      .references(() => websiteSections.id),
    mediaItemId: uuid('media_item_id').references(() => websiteMediaItems.id, {
      onDelete: 'set null',
    }),
    caption: text('caption'),
    altText: text('alt_text'),
    headline: text('headline'),
    ctaLabel: text('cta_label'),
    ctaHref: text('cta_href'),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status').notNull().default('draft'),
    bensonReasoning: text('benson_reasoning'),
    createdBy: text('created_by').notNull().default('benson'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('idx_website_drafts_status').on(t.status, t.updatedAt),
    sectionIdx: index('idx_website_drafts_section').on(t.sectionId, t.status),
  }),
);

export const websitePublishedItems = pgTable(
  'website_published_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => websiteDrafts.id, { onDelete: 'cascade' }),
    sectionId: text('section_id')
      .notNull()
      .references(() => websiteSections.id),
    mediaItemId: uuid('media_item_id').references(() => websiteMediaItems.id, {
      onDelete: 'set null',
    }),
    caption: text('caption'),
    altText: text('alt_text'),
    headline: text('headline'),
    ctaLabel: text('cta_label'),
    ctaHref: text('cta_href'),
    sortOrder: integer('sort_order').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    publishedBy: text('published_by').notNull().default('kellie'),
    unpublishedAt: timestamp('unpublished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    draftUq: unique().on(t.draftId),
    sectionIdx: index('idx_website_published_section').on(t.sectionId, t.sortOrder),
  }),
);

export const websiteSettings = pgTable('website_settings', {
  id: text('id').primaryKey().default('default'),
  siteTitle: text('site_title').notNull().default('KC Kellie'),
  siteTagline: text('site_tagline'),
  heroHeadline: text('hero_headline'),
  heroSubheadline: text('hero_subheadline'),
  contactEmail: text('contact_email'),
  bookingHref: text('booking_href'),
  mediaKitHref: text('media_kit_href'),
  maxUploadBytes: bigint('max_upload_bytes', { mode: 'number' }).notNull().default(26214400),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const equipmentItems = pgTable(
  'equipment_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    brand: text('brand').notNull(),
    model: text('model').notNull(),
    category: text('category').notNull(),
    owner: text('owner').notNull().default('Kellie'),
    manualFilePath: text('manual_file_path'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: index('idx_equipment_items_slug').on(t.slug),
  }),
);

export const equipmentManuals = pgTable(
  'equipment_manuals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipmentItems.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    originalFilename: text('original_filename').notNull(),
    storageFilename: text('storage_filename').notNull(),
    mimeType: text('mime_type').notNull().default('application/pdf'),
    fileSize: bigint('file_size', { mode: 'number' }).notNull().default(0),
    pageCount: integer('page_count'),
    chunkCount: integer('chunk_count').notNull().default(0),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }),
    sourcePath: text('source_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    equipmentUq: unique().on(t.equipmentId),
  }),
);

export const equipmentManualChunks = pgTable(
  'equipment_manual_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    manualId: uuid('manual_id')
      .notNull()
      .references(() => equipmentManuals.id, { onDelete: 'cascade' }),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipmentItems.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number'),
    sectionTitle: text('section_title'),
    chunkIndex: integer('chunk_index').notNull().default(0),
    chunkText: text('chunk_text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    manualIdx: index('idx_equipment_manual_chunks_manual').on(t.manualId, t.chunkIndex),
    equipmentIdx: index('idx_equipment_manual_chunks_equipment').on(t.equipmentId),
  }),
);

export const equipmentQuickTips = pgTable(
  'equipment_quick_tips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    equipmentId: uuid('equipment_id').references(() => equipmentItems.id, { onDelete: 'cascade' }),
    topic: text('topic').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    sourceManual: text('source_manual'),
    sourcePage: integer('source_page'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    equipmentIdx: index('idx_equipment_quick_tips_equipment').on(t.equipmentId, t.sortOrder),
  }),
);

export const equipmentChecklists = pgTable('equipment_checklists', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  shootType: text('shoot_type').notNull(),
  description: text('description'),
  gearToBring: jsonb('gear_to_bring').notNull().default(sql`'[]'::jsonb`),
  steps: jsonb('steps').notNull().default(sql`'[]'::jsonb`),
  commonMistakes: jsonb('common_mistakes').notNull().default(sql`'[]'::jsonb`),
  recoverySteps: jsonb('recovery_steps').notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const equipmentTroubleshooting = pgTable(
  'equipment_troubleshooting',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    label: text('label').notNull(),
    equipmentId: uuid('equipment_id').references(() => equipmentItems.id, { onDelete: 'set null' }),
    symptoms: jsonb('symptoms').notNull().default(sql`'[]'::jsonb`),
    steps: jsonb('steps').notNull().default(sql`'[]'::jsonb`),
    quickPrompt: text('quick_prompt').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sortIdx: index('idx_equipment_troubleshooting_sort').on(t.sortOrder),
  }),
);

export const equipmentReferenceVideos = pgTable(
  'equipment_reference_videos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    equipmentId: uuid('equipment_id').references(() => equipmentItems.id, { onDelete: 'set null' }),
    sourceChannel: text('source_channel').notNull(),
    referenceUrl: text('reference_url').notNull(),
    referenceKind: text('reference_kind').notNull().default('youtube'),
    youtubeVideoId: text('youtube_video_id'),
    topicTags: jsonb('topic_tags').notNull().default(sql`'[]'::jsonb`),
    notes: text('notes'),
    priority: integer('priority').notNull().default(50),
    watchedByKellie: boolean('watched_by_kellie').notNull().default(false),
    usefulForChecklist: boolean('useful_for_checklist').notNull().default(false),
    usefulForTroubleshooting: boolean('useful_for_troubleshooting').notNull().default(false),
    usefulForTraining: boolean('useful_for_training').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    equipmentIdx: index('idx_equipment_reference_videos_equipment').on(t.equipmentId, t.priority),
    priorityIdx: index('idx_equipment_reference_videos_priority').on(t.priority),
  }),
);

export const playbookSources = pgTable('playbook_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const playbookDocuments = pgTable(
  'playbook_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => playbookSources.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    originalFilename: text('original_filename').notNull(),
    storageFilename: text('storage_filename').notNull(),
    mimeType: text('mime_type').notNull().default('text/html'),
    fileSize: bigint('file_size', { mode: 'number' }).notNull().default(0),
    pageCount: integer('page_count'),
    chunkCount: integer('chunk_count').notNull().default(0),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }),
    sourcePath: text('source_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceUq: unique().on(t.sourceId),
  }),
);

export const playbookChunks = pgTable(
  'playbook_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => playbookDocuments.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => playbookSources.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number'),
    sectionTitle: text('section_title'),
    chunkIndex: integer('chunk_index').notNull().default(0),
    chunkText: text('chunk_text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    documentIdx: index('idx_playbook_chunks_document').on(t.documentId, t.chunkIndex),
    sourceIdx: index('idx_playbook_chunks_source').on(t.sourceId),
  }),
);

export const playbookQuickActions = pgTable(
  'playbook_quick_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    label: text('label').notNull(),
    prompt: text('prompt').notNull(),
    capability: text('capability').notNull().default('general'),
    sourceSlug: text('source_slug'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sortIdx: index('idx_playbook_quick_actions_sort').on(t.sortOrder),
  }),
);

export const playbookChecklists = pgTable('playbook_checklists', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  capability: text('capability').notNull(),
  description: text('description'),
  steps: jsonb('steps').notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sourceProposals = pgTable(
  'source_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    url: text('url').notNull(),
    rationale: text('rationale'),
    status: text('status').notNull().default('proposed'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    urlKindUq: unique().on(t.kind, t.url),
    statusIdx: index('idx_source_proposals_status').on(t.status, t.createdAt),
  }),
);

export const tiktokOperatorRecommendationTypeEnum = pgEnum('tiktok_operator_recommendation_type', [
  'make_sequel',
  'reply_with_video',
  'add_to_media_kit',
  'build_sponsor_proof',
  'create_outreach_angle',
  'repeat_format',
  'repost_or_remix',
  'schedule_follow_up',
  'prepare_for_tiktok',
  'investigate_comment_trend',
  'create_product_or_location_followup',
]);

export const tiktokOperatorRecommendationStatusEnum = pgEnum(
  'tiktok_operator_recommendation_status',
  ['new', 'accepted', 'in_progress', 'prepared', 'scheduled', 'completed', 'dismissed'],
);

export const tiktokPostPackageStatusEnum = pgEnum('tiktok_post_package_status', [
  'draft',
  'ready',
  'scheduled',
  'handed_off',
  'posted_manual',
  'posted_confirmed',
  'failed',
  'canceled',
]);

export const tiktokMediaSourceTypeEnum = pgEnum('tiktok_media_source_type', [
  'none',
  'local_reference',
  'temporary_upload',
  'external_url',
  'tiktok_draft',
  'cloud_asset',
]);

export const tiktokHandoffMethodEnum = pgEnum('tiktok_handoff_method', [
  'manual',
  'deep_link',
  'clipboard',
  'future_tiktok_upload',
  'future_direct_post',
]);

export const tiktokHandoffStatusEnum = pgEnum('tiktok_handoff_status', [
  'pending',
  'ready',
  'handed_off',
  'posted',
  'failed',
  'canceled',
]);

export const tiktokCommentInsightTypeEnum = pgEnum('tiktok_comment_insight_type', [
  'repeated_question',
  'product_request',
  'location_request',
  'sizing_price_where_to_buy',
  'complaint_confusion',
  'brand_mention',
  'sponsor_relevant',
  'reply_video_worthy',
  'sequel_suggestion',
  'other',
]);

export const tiktokCommentInsightStatusEnum = pgEnum('tiktok_comment_insight_status', [
  'new',
  'actioned',
  'dismissed',
  'handled',
]);

export const tiktokOperatorRecommendations = pgTable(
  'tiktok_operator_recommendations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    platform: platformEnum('platform').notNull().default('tiktok'),
    sourceVideoId: text('source_video_id'),
    creatorVideoId: uuid('creator_video_id').references(() => creatorVideos.id, {
      onDelete: 'set null',
    }),
    recommendationType: tiktokOperatorRecommendationTypeEnum('recommendation_type').notNull(),
    title: text('title').notNull(),
    explanation: text('explanation').notNull().default(''),
    supportingMetrics: jsonb('supporting_metrics').notNull().default(sql`'{}'::jsonb`),
    confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull().default('0.5'),
    priority: integer('priority').notNull().default(2),
    status: tiktokOperatorRecommendationStatusEnum('status').notNull().default('new'),
    relatedContentItemId: uuid('related_content_item_id').references(() => contentItems.id, {
      onDelete: 'set null',
    }),
    relatedSponsorTag: text('related_sponsor_tag'),
    relatedLocationTag: text('related_location_tag'),
    postPackageId: uuid('post_package_id'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    creatorStatusIdx: index('idx_tiktok_operator_recs_creator_status').on(
      t.creatorId,
      t.status,
      t.createdAt,
    ),
    videoTypeIdx: index('idx_tiktok_operator_recs_video_type').on(
      t.creatorId,
      t.sourceVideoId,
      t.recommendationType,
    ),
  }),
);

export const tiktokPostPackages = pgTable(
  'tiktok_post_packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    platform: platformEnum('platform').notNull().default('tiktok'),
    recommendationId: uuid('recommendation_id'),
    creatorVideoId: uuid('creator_video_id').references(() => creatorVideos.id, {
      onDelete: 'set null',
    }),
    sourceVideoId: text('source_video_id'),
    relatedContentItemId: uuid('related_content_item_id').references(() => contentItems.id, {
      onDelete: 'set null',
    }),
    hook: text('hook'),
    caption: text('caption').notNull().default(''),
    hashtags: text('hashtags').array().notNull().default(sql`'{}'::text[]`),
    coverText: text('cover_text'),
    firstComment: text('first_comment'),
    disclosureText: text('disclosure_text'),
    suggestedPostTime: timestamp('suggested_post_time', { withTimezone: true }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    sponsorAngle: text('sponsor_angle'),
    contentTheme: text('content_theme'),
    formatLabel: text('format_label'),
    reason: text('reason'),
    checklist: jsonb('checklist').notNull().default(sql`'[]'::jsonb`),
    shotList: jsonb('shot_list').notNull().default(sql`'[]'::jsonb`),
    cta: text('cta'),
    locationBrandNotes: text('location_brand_notes'),
    status: tiktokPostPackageStatusEnum('status').notNull().default('draft'),
    mediaSourceType: tiktokMediaSourceTypeEnum('media_source_type').notNull().default('none'),
    mediaReferenceText: text('media_reference_text'),
    temporaryAssetId: uuid('temporary_asset_id'),
    handoffMethod: tiktokHandoffMethodEnum('handoff_method').notNull().default('manual'),
    handoffStatus: tiktokHandoffStatusEnum('handoff_status').notNull().default('pending'),
    handoffError: text('handoff_error'),
    handedOffAt: timestamp('handed_off_at', { withTimezone: true }),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    postedUrl: text('posted_url'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    creatorStatusIdx: index('idx_tiktok_post_packages_creator_status').on(
      t.creatorId,
      t.status,
      t.updatedAt,
    ),
  }),
);

export const creatorDraftAssets = pgTable(
  'creator_draft_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    sourceChannel: draftSourceChannelEnum('source_channel').notNull().default('share_to_benson'),
    sourceType: draftSourceTypeEnum('source_type').notNull(),
    shareIntakeId: uuid('share_intake_id').references(() => shareIntakeSubmissions.id, {
      onDelete: 'set null',
    }),
    originalFilename: text('original_filename'),
    mimeType: text('mime_type'),
    fileSize: bigint('file_size', { mode: 'number' }),
    durationSeconds: numeric('duration_seconds', { precision: 10, scale: 2 }),
    tempFilePath: text('temp_file_path'),
    draftTitle: text('draft_title'),
    userNote: text('user_note'),
    rawCaptionOrText: text('raw_caption_or_text'),
    transcriptText: text('transcript_text'),
    transcriptSegmentsJson: jsonb('transcript_segments_json'),
    visualSummary: text('visual_summary'),
    audioSummary: text('audio_summary'),
    overallSummary: text('overall_summary'),
    frameSummariesJson: jsonb('frame_summaries_json'),
    detectedProductsJson: jsonb('detected_products_json'),
    detectedBrandsJson: jsonb('detected_brands_json'),
    detectedLocationsJson: jsonb('detected_locations_json'),
    detectedPeopleOrRolesJson: jsonb('detected_people_or_roles_json'),
    detectedContentTheme: text('detected_content_theme'),
    detectedFormat: text('detected_format'),
    hookAssessment: text('hook_assessment'),
    pacingAssessment: text('pacing_assessment'),
    visualQualityNotes: text('visual_quality_notes'),
    audioQualityNotes: text('audio_quality_notes'),
    lightingNotes: text('lighting_notes'),
    possibleCoverText: text('possible_cover_text'),
    bestCoverFrameNotes: text('best_cover_frame_notes'),
    suggestedCaption: text('suggested_caption'),
    suggestedHashtagsJson: jsonb('suggested_hashtags_json'),
    suggestedFirstComment: text('suggested_first_comment'),
    suggestedPlatformsJson: jsonb('suggested_platforms_json'),
    suggestedPostWindow: text('suggested_post_window'),
    postNowScore: numeric('post_now_score', { precision: 4, scale: 3 }),
    readinessScore: numeric('readiness_score', { precision: 4, scale: 3 }),
    sponsorRelevanceScore: numeric('sponsor_relevance_score', { precision: 4, scale: 3 }),
    opportunityMatchScore: numeric('opportunity_match_score', { precision: 4, scale: 3 }),
    confidenceLevel: draftConfidenceLevelEnum('confidence_level'),
    contextLimitations: text('context_limitations'),
    postingRecommendationJson: jsonb('posting_recommendation_json'),
    opportunityMatchJson: jsonb('opportunity_match_json'),
    status: draftAssetStatusEnum('status').notNull().default('received'),
    processingError: text('processing_error'),
    linkedOpportunityId: uuid('linked_opportunity_id').references(() => contentItems.id, {
      onDelete: 'set null',
    }),
    linkedPlannerItemId: uuid('linked_planner_item_id').references(() => plannerItems.id, {
      onDelete: 'set null',
    }),
    linkedPostPackageId: uuid('linked_post_package_id').references(() => tiktokPostPackages.id, {
      onDelete: 'set null',
    }),
    linkedTiktokVideoId: uuid('linked_tiktok_video_id').references(() => creatorVideos.id, {
      onDelete: 'set null',
    }),
    linkedSponsorProofId: uuid('linked_sponsor_proof_id'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    analyzedAt: timestamp('analyzed_at', { withTimezone: true }),
    lastDiscussedAt: timestamp('last_discussed_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    creatorStatusIdx: index('idx_creator_draft_assets_creator_status').on(
      t.creatorId,
      t.status,
      t.updatedAt,
    ),
    shareIntakeIdx: index('idx_creator_draft_assets_share_intake').on(t.shareIntakeId),
  }),
);

export const draftDecisions = pgTable(
  'draft_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    draftAssetId: uuid('draft_asset_id')
      .notNull()
      .references(() => creatorDraftAssets.id, { onDelete: 'cascade' }),
    decisionType: draftDecisionTypeEnum('decision_type').notNull(),
    decisionSummary: text('decision_summary').notNull(),
    reason: text('reason'),
    decidedBy: text('decided_by').notNull().default('creator'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    targetPlatformsJson: jsonb('target_platforms_json'),
    linkedPostPackageId: uuid('linked_post_package_id').references(() => tiktokPostPackages.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    assetIdx: index('idx_draft_decisions_asset').on(t.draftAssetId, t.createdAt),
  }),
);

export const tiktokCommentInsights = pgTable(
  'tiktok_comment_insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    platform: platformEnum('platform').notNull().default('tiktok'),
    sourceVideoId: text('source_video_id').notNull(),
    creatorVideoId: uuid('creator_video_id').references(() => creatorVideos.id, {
      onDelete: 'set null',
    }),
    commentText: text('comment_text'),
    clusterSummary: text('cluster_summary'),
    insightType: tiktokCommentInsightTypeEnum('insight_type').notNull().default('other'),
    frequency: integer('frequency').notNull().default(1),
    recommendation: text('recommendation').notNull().default(''),
    postPackageId: uuid('post_package_id').references(() => tiktokPostPackages.id, {
      onDelete: 'set null',
    }),
    status: tiktokCommentInsightStatusEnum('status').notNull().default('new'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    handledAt: timestamp('handled_at', { withTimezone: true }),
  },
  (t) => ({
    creatorStatusIdx: index('idx_tiktok_comment_insights_creator_status').on(
      t.creatorId,
      t.status,
      t.createdAt,
    ),
  }),
);

export const sponsorProofAssets = pgTable(
  'sponsor_proof_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    platform: platformEnum('platform').notNull().default('tiktok'),
    sourceVideoId: text('source_video_id').notNull(),
    creatorVideoId: uuid('creator_video_id').references(() => creatorVideos.id, {
      onDelete: 'set null',
    }),
    videoTitle: text('video_title').notNull().default(''),
    videoCaption: text('video_caption'),
    thumbnailUrl: text('thumbnail_url'),
    shareUrl: text('share_url'),
    performanceSnapshot: jsonb('performance_snapshot').notNull().default(sql`'{}'::jsonb`),
    engagementRate: numeric('engagement_rate', { precision: 8, scale: 4 }),
    contentCategory: text('content_category'),
    brandRelevance: text('brand_relevance'),
    notes: text('notes'),
    proofHeadline: text('proof_headline').notNull().default(''),
    proofSummary: text('proof_summary').notNull().default(''),
    includedInMediaKit: boolean('included_in_media_kit').notNull().default(false),
    mediaKitId: uuid('media_kit_id').references(() => mediaKits.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    creatorIdx: index('idx_sponsor_proof_assets_creator').on(t.creatorId, t.createdAt),
  }),
);

export const creatorFormatTemplates = pgTable(
  'creator_format_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    formatName: text('format_name').notNull(),
    structure: text('structure').notNull().default(''),
    idealLength: text('ideal_length'),
    openingHookStyle: text('opening_hook_style'),
    shotPattern: jsonb('shot_pattern').notNull().default(sql`'[]'::jsonb`),
    bestContentCategories: jsonb('best_content_categories').notNull().default(sql`'[]'::jsonb`),
    proofVideoIds: jsonb('proof_video_ids').notNull().default(sql`'[]'::jsonb`),
    avgPerformanceIndex: numeric('avg_performance_index', { precision: 6, scale: 2 }),
    whenToUse: text('when_to_use'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    creatorIdx: index('idx_creator_format_templates_creator').on(t.creatorId, t.updatedAt),
  }),
);

export const tiktokOperatorBriefings = pgTable(
  'tiktok_operator_briefings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    period: text('period').notNull().default('daily'),
    briefingDate: date('briefing_date').notNull().defaultNow(),
    summary: text('summary').notNull().default(''),
    actions: jsonb('actions').notNull().default(sql`'[]'::jsonb`),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    creatorDateIdx: index('idx_tiktok_operator_briefings_creator_date').on(
      t.creatorId,
      t.briefingDate,
    ),
  }),
);

export const tiktokHandoffEvents = pgTable(
  'tiktok_handoff_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: 'cascade' }),
    postPackageId: uuid('post_package_id')
      .notNull()
      .references(() => tiktokPostPackages.id, { onDelete: 'cascade' }),
    handoffMethod: tiktokHandoffMethodEnum('handoff_method').notNull(),
    handoffStatus: tiktokHandoffStatusEnum('handoff_status').notNull(),
    error: text('error'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    packageIdx: index('idx_tiktok_handoff_events_package').on(t.postPackageId, t.createdAt),
  }),
);

// ============================================================================
// TYPE EXPORTS — inferred from schema
// ============================================================================

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type Industry = typeof industries.$inferSelect;
export type Persona = typeof personas.$inferSelect;
export type NewPersona = typeof personas.$inferInsert;
export type ContentItem = typeof contentItems.$inferSelect;
export type NewContentItem = typeof contentItems.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type ScanRun = typeof scanRuns.$inferSelect;
export type NewScanRun = typeof scanRuns.$inferInsert;
export type SourceIngestionRun = typeof sourceIngestionRuns.$inferSelect;
export type NewSourceIngestionRun = typeof sourceIngestionRuns.$inferInsert;
export type SourceIngestionStatus = (typeof sourceIngestionStatusEnum.enumValues)[number];
export type Asset = typeof assets.$inferSelect;
export type PublishingTarget = typeof publishingTargets.$inferSelect;
export type Publication = typeof publications.$inferSelect;
export type PlatformCredential = typeof platformCredentials.$inferSelect;
export type NewPlatformCredential = typeof platformCredentials.$inferInsert;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;

export type ContentType = (typeof contentTypeEnum.enumValues)[number];
export type ContentState = (typeof contentStateEnum.enumValues)[number];
export type Platform = (typeof platformEnum.enumValues)[number];
export type Language = (typeof languageEnum.enumValues)[number];
export type AutonomyMode = (typeof autonomyEnum.enumValues)[number];
export type PublicationStatus = (typeof publicationStatusEnum.enumValues)[number];
export type SourceType = (typeof sourceTypeEnum.enumValues)[number];
export type IntakeType = (typeof intakeTypeEnum.enumValues)[number];
export type IntakeReviewStatus = (typeof intakeReviewStatusEnum.enumValues)[number];
export type IntakeSourceType = (typeof intakeSourceTypeEnum.enumValues)[number];
export type ShareIntakeSubmission = typeof shareIntakeSubmissions.$inferSelect;
export type CreatorDraftAsset = typeof creatorDraftAssets.$inferSelect;
export type NewCreatorDraftAsset = typeof creatorDraftAssets.$inferInsert;
export type DraftDecision = typeof draftDecisions.$inferSelect;
export type NewDraftDecision = typeof draftDecisions.$inferInsert;
export type DraftAssetStatus = (typeof draftAssetStatusEnum.enumValues)[number];
export type DraftDecisionType = (typeof draftDecisionTypeEnum.enumValues)[number];
export type NewShareIntakeSubmission = typeof shareIntakeSubmissions.$inferInsert;
export type CreatorAccount = typeof creatorAccounts.$inferSelect;
export type NewCreatorAccount = typeof creatorAccounts.$inferInsert;
export type CreatorVideo = typeof creatorVideos.$inferSelect;
export type NewCreatorVideo = typeof creatorVideos.$inferInsert;
export type CreatorMetricsSnapshot = typeof creatorMetricsSnapshots.$inferSelect;
export type NewCreatorMetricsSnapshot = typeof creatorMetricsSnapshots.$inferInsert;
export type StrategistBriefing = typeof strategistBriefings.$inferSelect;
export type NewStrategistBriefing = typeof strategistBriefings.$inferInsert;
export type CreatorPostingAnalytics = typeof creatorPostingAnalytics.$inferSelect;
export type NewCreatorPostingAnalytics = typeof creatorPostingAnalytics.$inferInsert;
export type BensonChatMessage = typeof bensonChatMessages.$inferSelect;
export type NewBensonChatMessage = typeof bensonChatMessages.$inferInsert;
export type CreatorPlatformConnection = typeof creatorPlatformConnections.$inferSelect;
export type NewCreatorPlatformConnection = typeof creatorPlatformConnections.$inferInsert;
export type CreatorPlatformConnectionStatus =
  (typeof creatorPlatformConnectionStatusEnum.enumValues)[number];
export type AnalyticsConnector = typeof analyticsConnectors.$inferSelect;
export type NewAnalyticsConnector = typeof analyticsConnectors.$inferInsert;
export type EditorOpportunityTracking = typeof editorOpportunityTracking.$inferSelect;
export type NewEditorOpportunityTracking = typeof editorOpportunityTracking.$inferInsert;
export type PlannerItemStatus = (typeof plannerItemStatusEnum.enumValues)[number];
export type PlannerItem = typeof plannerItems.$inferSelect;
export type NewPlannerItem = typeof plannerItems.$inferInsert;
export type SponsorContactStatus = (typeof sponsorContactStatusEnum.enumValues)[number];
export type SponsorContact = typeof sponsorContacts.$inferSelect;
export type NewSponsorContact = typeof sponsorContacts.$inferInsert;
export type SponsorPipelineStatus = (typeof sponsorPipelineStatusEnum.enumValues)[number];
export type SponsorOpportunity = typeof sponsorOpportunities.$inferSelect;
export type NewSponsorOpportunity = typeof sponsorOpportunities.$inferInsert;
export type MediaKit = typeof mediaKits.$inferSelect;
export type NewMediaKit = typeof mediaKits.$inferInsert;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type OutreachEmailStatus = (typeof outreachEmailStatusEnum.enumValues)[number];
export type GmailConnection = typeof gmailConnections.$inferSelect;
export type NewGmailConnection = typeof gmailConnections.$inferInsert;
export type GmailSyncState = typeof gmailSyncState.$inferSelect;
export type OutreachInboundMessage = typeof outreachInboundMessages.$inferSelect;
export type NewOutreachInboundMessage = typeof outreachInboundMessages.$inferInsert;
export type GmailDigestMessage = typeof gmailDigestMessages.$inferSelect;
export type OutreachEmail = typeof outreachEmails.$inferSelect;
export type NewOutreachEmail = typeof outreachEmails.$inferInsert;
export type OutreachSendAttempt = typeof outreachSendAttempts.$inferSelect;
export type TesterFeedback = typeof testerFeedback.$inferSelect;
export type NewTesterFeedback = typeof testerFeedback.$inferInsert;
export type CreatorPreferencesRow = typeof creatorPreferences.$inferSelect;
export type BensonProgressBrief = typeof bensonProgressBriefs.$inferSelect;
export type NewBensonProgressBrief = typeof bensonProgressBriefs.$inferInsert;
export type SourceProposal = typeof sourceProposals.$inferSelect;
export type NewSourceProposal = typeof sourceProposals.$inferInsert;
export type TikTokOperatorRecommendation = typeof tiktokOperatorRecommendations.$inferSelect;
export type NewTikTokOperatorRecommendation = typeof tiktokOperatorRecommendations.$inferInsert;
export type TikTokPostPackage = typeof tiktokPostPackages.$inferSelect;
export type NewTikTokPostPackage = typeof tiktokPostPackages.$inferInsert;
export type TikTokCommentInsight = typeof tiktokCommentInsights.$inferSelect;
export type NewTikTokCommentInsight = typeof tiktokCommentInsights.$inferInsert;
export type SponsorProofAsset = typeof sponsorProofAssets.$inferSelect;
export type NewSponsorProofAsset = typeof sponsorProofAssets.$inferInsert;
export type CreatorFormatTemplate = typeof creatorFormatTemplates.$inferSelect;
export type NewCreatorFormatTemplate = typeof creatorFormatTemplates.$inferInsert;
export type TikTokOperatorBriefing = typeof tiktokOperatorBriefings.$inferSelect;
export type NewTikTokOperatorBriefing = typeof tiktokOperatorBriefings.$inferInsert;
export type TikTokHandoffEvent = typeof tiktokHandoffEvents.$inferSelect;
export type NewTikTokHandoffEvent = typeof tiktokHandoffEvents.$inferInsert;
export type TikTokOperatorRecommendationType =
  (typeof tiktokOperatorRecommendationTypeEnum.enumValues)[number];
export type TikTokOperatorRecommendationStatus =
  (typeof tiktokOperatorRecommendationStatusEnum.enumValues)[number];
export type TikTokPostPackageStatus = (typeof tiktokPostPackageStatusEnum.enumValues)[number];
export type TikTokMediaSourceType = (typeof tiktokMediaSourceTypeEnum.enumValues)[number];
export type TikTokHandoffMethod = (typeof tiktokHandoffMethodEnum.enumValues)[number];
export type TikTokHandoffStatus = (typeof tiktokHandoffStatusEnum.enumValues)[number];
export type TikTokCommentInsightType = (typeof tiktokCommentInsightTypeEnum.enumValues)[number];
export type TikTokCommentInsightStatus = (typeof tiktokCommentInsightStatusEnum.enumValues)[number];
export type WebsiteSection = typeof websiteSections.$inferSelect;
export type WebsiteMediaItem = typeof websiteMediaItems.$inferSelect;
export type WebsiteDraft = typeof websiteDrafts.$inferSelect;
export type WebsitePublishedItem = typeof websitePublishedItems.$inferSelect;
export type WebsiteSettingsRow = typeof websiteSettings.$inferSelect;
export type BensonRecommendationEvent = typeof bensonRecommendationEvents.$inferSelect;
export type NewBensonRecommendationEvent = typeof bensonRecommendationEvents.$inferInsert;
export type ShootSession = typeof shootSessions.$inferSelect;
export type NewShootSession = typeof shootSessions.$inferInsert;
export type ContentOutcomeLink = typeof contentOutcomeLinks.$inferSelect;
export type NewContentOutcomeLink = typeof contentOutcomeLinks.$inferInsert;
export type ContentPerformanceSnapshot = typeof contentPerformanceSnapshots.$inferSelect;
export type NewContentPerformanceSnapshot = typeof contentPerformanceSnapshots.$inferInsert;
export type WorkerHeartbeat = typeof workerHeartbeats.$inferSelect;
export type NewWorkerHeartbeat = typeof workerHeartbeats.$inferInsert;
export type WorkerJobRun = typeof workerJobRuns.$inferSelect;
export type NewWorkerJobRun = typeof workerJobRuns.$inferInsert;
export type WorkerIncident = typeof workerIncidents.$inferSelect;
export type EntitySuppression = typeof entitySuppressions.$inferSelect;
export type CreatorCategoryRule = typeof creatorCategoryRules.$inferSelect;
export type CreatorFeedbackEvent = typeof creatorFeedbackEvents.$inferSelect;
export type CreatorInterestRecord = typeof creatorInterestRecords.$inferSelect;
export type CreatorResearchJob = typeof creatorResearchJobs.$inferSelect;
export type CreatorPartnership = typeof creatorPartnerships.$inferSelect;
export type CreatorPartnershipActivity = typeof creatorPartnershipActivities.$inferSelect;
export type BensonDataRevision = typeof bensonDataRevisions.$inferSelect;
export type CreatorSkippedRecord = typeof creatorSkippedRecords.$inferSelect;
export type ResearchJobStatus = (typeof researchJobStatusEnum.enumValues)[number];
export type CanonicalBusiness = typeof canonicalBusinesses.$inferSelect;
export type LlmUsageEvent = typeof llmUsageEvents.$inferSelect;
export type NewLlmUsageEvent = typeof llmUsageEvents.$inferInsert;
export type CreatorCalendarItem = typeof creatorCalendarItems.$inferSelect;
export type NewCreatorCalendarItem = typeof creatorCalendarItems.$inferInsert;
export type CalendarDismissalFeedback = typeof calendarDismissalFeedback.$inferSelect;
export type CalendarCategorySnooze = typeof calendarCategorySnoozes.$inferSelect;
export type GoogleCalendarConnection = typeof googleCalendarConnections.$inferSelect;
export type CalendarSyncRecord = typeof calendarSyncRecords.$inferSelect;
export type CalendarItemType = (typeof calendarItemTypeEnum.enumValues)[number];
export type CalendarPlanningStatus = (typeof calendarPlanningStatusEnum.enumValues)[number];
export type CalendarSyncStatus = (typeof calendarSyncStatusEnum.enumValues)[number];
export type SourceWatcher = typeof sourceWatchers.$inferSelect;
export type NewSourceWatcher = typeof sourceWatchers.$inferInsert;
export type SourceSnapshot = typeof sourceSnapshots.$inferSelect;
export type EarlySignal = typeof earlySignals.$inferSelect;
export type NewEarlySignal = typeof earlySignals.$inferInsert;
export type EarlySignalEvidence = typeof earlySignalEvidence.$inferSelect;
export type AlertDelivery = typeof alertDeliveries.$inferSelect;
export type EarlySignalAlertPreferences = typeof earlySignalAlertPreferences.$inferSelect;
export type UrlIntakeQuarantine = typeof urlIntakeQuarantine.$inferSelect;
export type NewUrlIntakeQuarantine = typeof urlIntakeQuarantine.$inferInsert;
export type UrlWatchRule = typeof urlWatchRules.$inferSelect;
export type NewUrlWatchRule = typeof urlWatchRules.$inferInsert;
export type UrlIntakeAudit = typeof urlIntakeAudit.$inferSelect;
