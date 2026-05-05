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

export const routeStrategyEnum = pgEnum('route_strategy', ['all', 'round_robin', 'weighted']);

export const publicationStatusEnum = pgEnum('publication_status', [
  'queued',
  'publishing',
  'published',
  'failed',
  'cancelled',
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

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    campaignIdx: index('idx_content_campaign').on(t.campaignId),
    plannedDateIdx: index('idx_content_planned_date').on(t.plannedForDate),
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
