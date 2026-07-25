import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type postgres from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = resolve(here, '../../../../db/migrations');

export type MigrationStep = {
  /** Numeric prefix matching db/migrations/NN_name.sql */
  id: string;
  file: string;
  label: string;
  requires?: string[];
  priorCommand?: string;
};

export async function tableExists(
  db: postgres.Sql,
  table: string,
): Promise<boolean> {
  const rows = await db<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${table}
    ) AS exists
  `;
  return rows[0]?.exists === true;
}

export async function requireTables(
  db: postgres.Sql,
  tables: string[],
  step: MigrationStep,
): Promise<void> {
  const missing: string[] = [];
  for (const table of tables) {
    if (!(await tableExists(db, table))) missing.push(table);
  }
  if (missing.length === 0) return;

  const hint = step.priorCommand
    ? `Run first: ${step.priorCommand}`
    : 'Ensure base schema is applied (docker init db/init or seed).';
  throw new Error(
    `Migration ${step.id} (${step.label}) requires table(s): ${missing.join(', ')}. ${hint}`,
  );
}

export async function applyMigrationFile(
  db: postgres.Sql,
  step: MigrationStep,
): Promise<void> {
  if (step.requires?.length) {
    await requireTables(db, step.requires, step);
  }
  const sqlPath = resolve(MIGRATIONS_DIR, step.file);
  const sql = readFileSync(sqlPath, 'utf8');
  console.log(`Applying ${step.file}...`);
  await db.unsafe(sql);
  console.log(`  ✓ ${step.label}`);
}

/** Pre-alpha Benson stack — dependency order (24 → 32). */
export const PRE_ALPHA_MIGRATION_STEPS: MigrationStep[] = [
  {
    id: '24',
    file: '24_creator_analytics.sql',
    label: 'creator analytics',
    requires: ['content_items'],
    priorCommand: 'pnpm seed (or fresh Postgres with db/init)',
  },
  {
    id: '25',
    file: '25_editor_home.sql',
    label: 'editor home',
    requires: ['content_items'],
    priorCommand: 'pnpm migrate:editor-home (after base schema)',
  },
  {
    id: '26',
    file: '26_content_planning.sql',
    label: 'content planning (planner_items)',
    requires: ['content_items'],
    priorCommand: 'pnpm migrate:content-planning',
  },
  {
    id: '27',
    file: '27_sponsor_outreach.sql',
    label: 'sponsor outreach',
    requires: ['content_items'],
    priorCommand: 'pnpm migrate:sponsor-outreach',
  },
  {
    id: '28',
    file: '28_creator_platform_connections.sql',
    label: 'creator platform connections',
    requires: ['creator_accounts'],
    priorCommand: 'pnpm migrate:creator-analytics',
  },
  {
    id: '29',
    file: '29_sponsor_outreach_phase_b.sql',
    label: 'sponsor outreach phase B',
    requires: ['outreach_emails', 'outreach_send_attempts'],
    priorCommand: 'pnpm migrate:sponsor-outreach',
  },
  {
    id: '30',
    file: '30_sponsor_pipeline.sql',
    label: 'sponsor pipeline',
    requires: ['sponsor_contacts'],
    priorCommand: 'pnpm migrate:sponsor-outreach',
  },
  {
    id: '31',
    file: '31_action_center_due_dates.sql',
    label: 'action center due dates',
    requires: ['planner_items', 'sponsor_opportunities', 'outreach_emails'],
    priorCommand: 'pnpm migrate:content-planning && pnpm migrate:sponsor-pipeline && pnpm migrate:sponsor-outreach',
  },
  {
    id: '32',
    file: '32_pre_alpha_feedback.sql',
    label: 'pre-alpha feedback',
  },
  {
    id: '33',
    file: '33_source_ingestion_freshness.sql',
    label: 'source ingestion freshness',
    requires: ['content_items', 'sources'],
    priorCommand: 'pnpm migrate:source-ingestion',
  },
  {
    id: '34',
    file: '34_analytics_connectors.sql',
    label: 'analytics connectors',
  },
  {
    id: '35',
    file: '35_analytics_sync_state.sql',
    label: 'analytics sync state',
    requires: ['analytics_connectors'],
    priorCommand: 'pnpm migrate:analytics-connectors',
  },
  {
    id: '41',
    file: '41_benson_brain.sql',
    label: 'benson brain (preferences, progress briefs, source proposals)',
    requires: ['creator_accounts', 'sources'],
    priorCommand: 'pnpm migrate:creator-analytics',
  },
  {
    id: '42',
    file: '42_benson_learnings.sql',
    label: 'benson self-learning insights',
  },
  {
    id: '43',
    file: '43_benson_chat_feedback.sql',
    label: 'benson chat feedback',
    requires: ['benson_chat_messages'],
  },
  {
    id: '44',
    file: '44_benson_discoveries.sql',
    label: 'benson autonomous discoveries',
  },
  {
    id: '45',
    file: '45_benson_push.sql',
    label: 'benson web push notifications',
  },
  {
    id: '46',
    file: '46_benson_milestones.sql',
    label: 'benson milestone celebrations',
  },
  {
    id: '47',
    file: '47_planner_post_assist.sql',
    label: 'planner post assist (draft caption, posted url)',
    requires: ['planner_items'],
  },
  {
    id: '48',
    file: '48_tiktok_operator.sql',
    label: 'tiktok operator execution layer',
    requires: ['creator_accounts', 'creator_videos', 'media_kits'],
    priorCommand: 'pnpm migrate:creator-analytics && pnpm migrate:sponsor-outreach',
  },
  {
    id: '49',
    file: '49_gmail_outreach.sql',
    label: 'gmail oauth + benson outreach draft metadata',
    requires: ['outreach_emails'],
    priorCommand: 'pnpm migrate:sponsor-outreach',
  },
  {
    id: '50',
    file: '50_gmail_inbox.sql',
    label: 'gmail inbox sync + reply tracking + digest dedupe',
    requires: ['outreach_emails', 'gmail_connections'],
    priorCommand: 'pnpm migrate:sponsor-outreach',
  },
  {
    id: '51',
    file: '51_website_manager.sql',
    label: 'benson website manager (media, drafts, publishing)',
  },
  {
    id: '60',
    file: '60_green_screen_coverage.sql',
    label: 'green screen coverage format + discovery email ingestion',
    requires: ['content_items', 'planner_items'],
    priorCommand: 'pnpm migrate:green-screen-coverage',
  },
  {
    id: '61',
    file: '61_discovery_subscriptions.sql',
    label: 'discovery subscription verification tracking',
    requires: ['discovery_email_messages'],
    priorCommand: 'pnpm migrate:discovery-subscriptions',
  },
  {
    id: '62',
    file: '62_email_category_routing.sql',
    label: 'email category routing for inbox + telegram',
    requires: ['gmail_digest_messages', 'discovery_email_messages'],
    priorCommand: 'pnpm migrate:email-category-routing',
  },
  {
    id: '63',
    file: '63_opportunity_location.sql',
    label: 'opportunity location resolution fields',
    requires: ['content_items'],
    priorCommand: 'pnpm migrate:opportunity-location',
  },
  {
    id: '64',
    file: '64_gmail_digest_promote.sql',
    label: 'gmail digest promotion tracking',
    requires: ['gmail_digest_messages', 'content_items'],
    priorCommand: 'pnpm migrate:gmail-digest-promote',
  },
  {
    id: '65',
    file: '65_outcome_shoot_control_tower.sql',
    label: 'outcome engine shoot sessions worker heartbeats',
    requires: ['content_items', 'planner_items', 'share_intake_submissions', 'creator_draft_assets', 'creator_videos'],
    priorCommand: 'pnpm migrate:outcome-shoot-control-tower',
  },
  {
    id: '66',
    file: '66_llm_usage_events.sql',
    label: 'llm usage event tracking',
    requires: [],
    priorCommand: 'pnpm migrate:llm-usage-events',
  },
  {
    id: '67',
    file: '67_early_signal_intelligence.sql',
    label: 'early signal intelligence',
    requires: ['sources', 'content_items'],
    priorCommand: 'pnpm migrate:early-signal-intelligence',
  },
  {
    id: '68',
    file: '68_creator_agent_corrective.sql',
    label: 'creator agent corrective build',
    requires: ['content_items', 'worker_heartbeats', 'sponsor_contacts', 'outreach_emails'],
    priorCommand: 'pnpm migrate:creator-agent-corrective',
  },
];

export async function runPreAlphaMigrations(db: postgres.Sql): Promise<void> {
  console.log('Pre-alpha migration chain (ordered 24 → 32)...');
  for (const step of PRE_ALPHA_MIGRATION_STEPS) {
    await applyMigrationFile(db, step);
  }
  console.log('All pre-alpha migrations applied.');
}
