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
];

export async function runPreAlphaMigrations(db: postgres.Sql): Promise<void> {
  console.log('Pre-alpha migration chain (ordered 24 → 32)...');
  for (const step of PRE_ALPHA_MIGRATION_STEPS) {
    await applyMigrationFile(db, step);
  }
  console.log('All pre-alpha migrations applied.');
}
