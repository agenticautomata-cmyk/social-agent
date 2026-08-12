#!/usr/bin/env -S pnpm exec tsx
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

const sections: Array<[string, ReturnType<typeof sql>]> = [
  [
    'Lead counts by verification + recommendation',
    sql`SELECT verification_status, creator_recommendation, COUNT(*)::int AS n
        FROM curator_event_leads
        WHERE discovered_via_handle ILIKE '%jasfood%' AND dismissed_at IS NULL
        GROUP BY 1, 2 ORDER BY n DESC`,
  ],
  [
    'Signal states for jasfood leads',
    sql`SELECT es.signal_state, COUNT(*)::int AS n
        FROM curator_event_leads cel
        JOIN early_signals es ON es.id = cel.linked_early_signal_id
        WHERE cel.discovered_via_handle ILIKE '%jasfood%'
        GROUP BY 1`,
  ],
  [
    'Promoted to content_items?',
    sql`SELECT COUNT(*)::int AS promoted_count
        FROM early_signals es
        JOIN curator_event_leads cel ON cel.linked_early_signal_id = es.id
        WHERE cel.discovered_via_handle ILIKE '%jasfood%' AND es.linked_opportunity_id IS NOT NULL`,
  ],
  [
    'Recent jasfood leads (detail)',
    sql`SELECT cel.event_name, cel.event_date, cel.venue, cel.verification_status,
               cel.creator_recommendation, es.signal_state, cel.created_at
        FROM curator_event_leads cel
        LEFT JOIN early_signals es ON es.id = cel.linked_early_signal_id
        WHERE cel.discovered_via_handle ILIKE '%jasfood%' AND cel.dismissed_at IS NULL
        ORDER BY cel.created_at DESC LIMIT 20`,
  ],
  [
    'Recent watcher runs',
    sql`SELECT started_at, finished_at, status, result_summary
        FROM curator_watchlist_runs
        WHERE watcher_id = '6cd867ad-9bdf-441b-b30f-d51bed11376b'
        ORDER BY started_at DESC LIMIT 8`,
  ],
  [
    'Food-ish vs party-ish lead titles',
    sql`SELECT
          SUM(CASE WHEN event_name ~* 'food|brunch|restaurant|market|coffee|truck' THEN 1 ELSE 0 END)::int AS foodish,
          SUM(CASE WHEN event_name ~* 'party|funday|wasted|day party|matinee' THEN 1 ELSE 0 END)::int AS partyish,
          COUNT(*)::int AS total
        FROM curator_event_leads
        WHERE discovered_via_handle ILIKE '%jasfood%' AND dismissed_at IS NULL`,
  ],
];

for (const [label, query] of sections) {
  console.log(`\n=== ${label} ===`);
  try {
    const rows = await db.execute(query);
    console.log(JSON.stringify(rows.rows ?? rows, null, 2));
  } catch (err) {
    console.log('ERROR:', err instanceof Error ? err.message : err);
  }
}

process.exit(0);
