#!/usr/bin/env -S pnpm exec tsx
/**
 * One-off remediation: sanitize existing active content_items whose topic/hook/
 * script/locationName still contain HTML entity or CSS/JS scraping artifacts.
 * Does not touch source history — only rewrites the display text fields.
 */
import { db } from '../db.js';
import { contentItems, sponsorContacts, creatorCalendarItems } from '../schema.js';
import { eq, or, sql } from 'drizzle-orm';
import {
  looksLikeUnsanitizedArtifact,
  sanitizeScrapedText,
  sanitizeScrapedTitle,
} from '../text-sanitize/sanitize-scraped-text.js';

// Process every active/upcoming row unconditionally — sanitization is idempotent
// and cheap, and narrow regex pre-filters previously missed named entities
// (&mdash; &rsquo; &amp;amp;) and embedded CSS soup.
const rows = await db
  .select({
    id: contentItems.id,
    topic: contentItems.topic,
    hook: contentItems.hook,
    script: contentItems.script,
    locationName: contentItems.locationName,
  })
  .from(contentItems)
  .where(sql`lifecycle_status IN ('active', 'upcoming', 'expiring_soon')`);

let cleaned = 0;
for (const row of rows) {
  const nextTopic = sanitizeScrapedTitle(row.topic);
  const nextHook = row.hook ? sanitizeScrapedTitle(row.hook) : row.hook;
  const nextScript = row.script ? sanitizeScrapedText(row.script) : row.script;
  const nextLocation = row.locationName ? sanitizeScrapedTitle(row.locationName) : row.locationName;

  const changed =
    nextTopic !== row.topic || nextHook !== row.hook || nextScript !== row.script || nextLocation !== row.locationName;
  if (!changed) continue;

  await db
    .update(contentItems)
    .set({ topic: nextTopic, hook: nextHook, script: nextScript, locationName: nextLocation, updatedAt: new Date() })
    .where(eq(contentItems.id, row.id));
  cleaned += 1;
  console.log(`Cleaned content_items ${row.id}: "${row.topic}" -> "${nextTopic}"`);
}

console.log(`\ncontent_items scanned=${rows.length} cleaned=${cleaned}`);

// Sponsor contact business names / notes can inherit the same artifacts from opportunity titles.
const sponsorRows = await db
  .select({ id: sponsorContacts.id, businessName: sponsorContacts.businessName, notes: sponsorContacts.notes })
  .from(sponsorContacts)
  .where(or(sql`business_name ~ '&#[0-9x]'`, sql`notes ~ '&#[0-9x]'`));

let sponsorCleaned = 0;
for (const row of sponsorRows) {
  const nextName = sanitizeScrapedTitle(row.businessName);
  const nextNotes = row.notes ? sanitizeScrapedText(row.notes) : row.notes;
  if (nextName === row.businessName && nextNotes === row.notes) continue;
  await db
    .update(sponsorContacts)
    .set({ businessName: nextName, notes: nextNotes, updatedAt: new Date() })
    .where(eq(sponsorContacts.id, row.id));
  sponsorCleaned += 1;
  console.log(`Cleaned sponsor_contacts ${row.id}: "${row.businessName}" -> "${nextName}"`);
}
console.log(`sponsor_contacts scanned=${sponsorRows.length} cleaned=${sponsorCleaned}`);

// Calendar item titles/locations inherit the same scraping artifacts (e.g. Family
// Shows in Kansas City &mdash; Schedule 2026-2027) since they're populated from the
// same newsletter/scrape sources but were historically written without sanitization.
const calendarRows = await db
  .select({
    id: creatorCalendarItems.id,
    title: creatorCalendarItems.title,
    description: creatorCalendarItems.description,
    location: creatorCalendarItems.location,
  })
  .from(creatorCalendarItems);

let calendarCleaned = 0;
for (const row of calendarRows) {
  const nextTitle = sanitizeScrapedTitle(row.title);
  const nextDescription = row.description ? sanitizeScrapedText(row.description) : row.description;
  const nextLocation = row.location ? sanitizeScrapedTitle(row.location) : row.location;
  const changed =
    nextTitle !== row.title || nextDescription !== row.description || nextLocation !== row.location;
  if (!changed) continue;
  await db
    .update(creatorCalendarItems)
    .set({ title: nextTitle, description: nextDescription, location: nextLocation, updatedAt: new Date() })
    .where(eq(creatorCalendarItems.id, row.id));
  calendarCleaned += 1;
  console.log(`Cleaned creator_calendar_items ${row.id}: "${row.title}" -> "${nextTitle}"`);
}
console.log(`creator_calendar_items scanned=${calendarRows.length} cleaned=${calendarCleaned}`);

// Report: how many active rows STILL look dirty after this pass (should be near zero for entity/CSS artifacts).
const stillActive = await db
  .select({ topic: contentItems.topic, script: contentItems.script })
  .from(contentItems)
  .where(eq(contentItems.lifecycleStatus, 'active'));
const stillDirty = stillActive.filter(
  (r) => looksLikeUnsanitizedArtifact(r.topic) || looksLikeUnsanitizedArtifact(r.script),
);
console.log(`\nActive rows still showing artifact-like text after cleanup: ${stillDirty.length} / ${stillActive.length}`);

process.exit(0);
