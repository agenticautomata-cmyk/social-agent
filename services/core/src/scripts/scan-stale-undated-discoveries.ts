#!/usr/bin/env -S pnpm exec tsx
import { and, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { isDiscoveryFeedFresh } from '../inventory/content-freshness.js';

const rows = await db
  .select({
    id: contentItems.id,
    topic: contentItems.topic,
    hook: contentItems.hook,
    script: contentItems.script,
    discoveredAt: contentItems.discoveredAt,
    createdAt: contentItems.createdAt,
    creatorValueStatus: contentItems.creatorValueStatus,
  })
  .from(contentItems)
  .where(
    and(
      isNull(contentItems.eventStartsAt),
      sql`${contentItems.creatorValueStatus} IS DISTINCT FROM 'archived'`,
      sql`${contentItems.creatorValueStatus} IS DISTINCT FROM 'rejected'`,
      or(
        sql`${contentItems.hook} ~* 'this (spring|summer|fall|autumn|winter)'`,
        sql`${contentItems.script} ~* 'this (spring|summer|fall|autumn|winter)'`,
        sql`${contentItems.hook} ~* '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.? +20[0-9]{2}'`,
        sql`${contentItems.script} ~* '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.? +20[0-9]{2}'`,
      ),
    ),
  )
  .limit(200);

const stale = rows.filter((row) =>
  !isDiscoveryFeedFresh({
    title: row.topic,
    hook: row.hook,
    summary: row.script,
    eventStartsAt: null,
    discoveredAt: row.discoveredAt,
    createdAt: row.createdAt,
  }),
);

console.log(
  JSON.stringify(
    {
      scanned: rows.length,
      wouldFilterFromFeed: stale.length,
      samples: stale.slice(0, 15).map((r) => ({ id: r.id, topic: r.topic, status: r.creatorValueStatus })),
    },
    null,
    2,
  ),
);
process.exit(0);
