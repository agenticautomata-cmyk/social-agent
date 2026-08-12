#!/usr/bin/env -S pnpm exec tsx
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

const r = await db.execute(sql`
  SELECT id, topic, source_url, event_starts_at, location_name, source_external_id,
         metadata->>'userConfirmed' as user_confirmed,
         lifecycle_status, created_at::text
  FROM content_items
  WHERE topic ILIKE '%Conversations%Karaoke%'
     OR topic ILIKE '%ROCK THE BRIDGE%'
     OR topic ILIKE '%Brushes%Beats%'
     OR source_url ILIKE '%eventbrite%'
  ORDER BY topic, created_at DESC
`);
const rows = (r as { rows?: unknown[] }).rows ?? r;
console.log(JSON.stringify(rows, null, 2));
process.exit(0);
