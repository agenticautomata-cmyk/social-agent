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
]);

export const languageEnum = pgEnum('language_code', ['en', 'de', 'es']);

export const autonomyEnum = pgEnum('autonomy_mode', ['manual', 'hitl', 'auto']);

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

export const intakeTypeEnum = pgEnum('intake_type', ['url', 'text', 'image', 'mixed']);

export const intakeReviewStatusEnum = pgEnum('intake_review_status', [
  'pending_ai',
  'needs_review',
  'approved',
  'rejected',
]);

export const intakeSourceTypeEnum = pgEnum('intake_source_type', ['manual_share']);

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
  postingTimezone: text('posting_timezone').notNull().default('Europe/Berlin'),

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
    rawPayload: jsonb('raw_payload'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    campaignIdx: index('idx_content_campaign').on(t.campaignId),
    plannedDateIdx: index('idx_content_planned_date').on(t.plannedForDate),
    sourceIdx: index('idx_content_source_id').on(t.sourceId),
  })
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    campaignStatusIdx: index('idx_share_intake_campaign_status').on(
      t.campaignId,
      t.reviewStatus,
      t.submittedAt,
    ),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('idx_outreach_emails_status').on(t.status),
    scheduledIdx: index('idx_outreach_emails_scheduled').on(t.scheduledSendAt),
    followUpDueIdx: index('idx_outreach_emails_follow_up_due').on(t.followUpDueAt),
    contactIdx: index('idx_outreach_emails_contact').on(t.sponsorContactId),
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
export type NewShareIntakeSubmission = typeof shareIntakeSubmissions.$inferInsert;
export type CreatorAccount = typeof creatorAccounts.$inferSelect;
export type NewCreatorAccount = typeof creatorAccounts.$inferInsert;
export type CreatorVideo = typeof creatorVideos.$inferSelect;
export type NewCreatorVideo = typeof creatorVideos.$inferInsert;
export type CreatorMetricsSnapshot = typeof creatorMetricsSnapshots.$inferSelect;
export type NewCreatorMetricsSnapshot = typeof creatorMetricsSnapshots.$inferInsert;
export type CreatorPlatformConnection = typeof creatorPlatformConnections.$inferSelect;
export type NewCreatorPlatformConnection = typeof creatorPlatformConnections.$inferInsert;
export type CreatorPlatformConnectionStatus =
  (typeof creatorPlatformConnectionStatusEnum.enumValues)[number];
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
export type OutreachEmail = typeof outreachEmails.$inferSelect;
export type NewOutreachEmail = typeof outreachEmails.$inferInsert;
export type OutreachSendAttempt = typeof outreachSendAttempts.$inferSelect;
export type TesterFeedback = typeof testerFeedback.$inferSelect;
export type NewTesterFeedback = typeof testerFeedback.$inferInsert;
