#!/usr/bin/env -S pnpm exec tsx
/**
 * Repair visible display titles. Preserves raw titles, source URLs, and
 * canonical identity. Does not delete or merge records.
 */
import { and, eq, gte, inArray, isNull, not, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  contentItems,
  creatorCalendarItems,
  curatorEventLeads,
  earlySignals,
  sources,
} from '../schema.js';
import {
  extractPageDisplayHints,
  mergePageHintsIntoMetadata,
  resolveDisplayTitleFromRecord,
  toStoredDisplayIdentity,
  type DisplayTitleContract,
} from '../display-title/index.js';

type Defect =
  | 'source_suffix'
  | 'markdown'
  | 'html'
  | 'sentence_title'
  | 'cta'
  | 'all_caps'
  | 'seo_headline'
  | 'venue_as_title'
  | 'generic_heading'
  | 'better_title_in_metadata'
  | 'cross_surface_disagreement';

const HIDDEN_SIGNAL_STATES = ['dismissed', 'merged', 'skipped'] as const;
const PAGE_HINT_LIMIT = 48;
const pageHints = new Map<string, ReturnType<typeof extractPageDisplayHints>>();

function canonicalSourceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.searchParams.delete('utm_source');
    parsed.searchParams.delete('utm_medium');
    parsed.searchParams.delete('utm_campaign');
    return parsed.toString();
  } catch {
    return null;
  }
}

function rawLooksDefective(raw: string): boolean {
  const letters = raw.replace(/[^A-Za-z]/g, '');
  return (
    /\s*[|•·—–]\s+/.test(raw) ||
    /\[[^\]]+\]\(|<\/?[a-z]|^[_*]{1,2}\[/.test(raw) ||
    /^(sign up|apply|buy tickets|register|shop now)/i.test(raw.trim()) ||
    (letters.length >= 8 && letters === letters.toUpperCase()) ||
    /\b(huzzah|official website|seasons of)\b/i.test(raw)
  );
}

async function loadPageHints(urls: Array<string | null | undefined>): Promise<void> {
  const unique = [...new Set(urls.map(canonicalSourceUrl).filter((v): v is string => Boolean(v)))].slice(
    0,
    PAGE_HINT_LIMIT,
  );
  for (const url of unique) {
    if (pageHints.has(url)) continue;
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
        headers: { 'user-agent': 'BensonDisplayTitleRepair/1.0' },
      });
      if (!res.ok) continue;
      const html = await res.text();
      pageHints.set(url, extractPageDisplayHints(html));
    } catch {
      // Public research is best-effort; conservative cleanup still runs.
    }
  }
}

function withPageHints(metadata: Record<string, unknown>, sourceUrl: string | null | undefined): Record<string, unknown> {
  const url = canonicalSourceUrl(sourceUrl);
  const hints = url ? pageHints.get(url) : null;
  const next = hints ? mergePageHintsIntoMetadata(metadata, hints) : metadata;
  return { ...next, displayIdentity: undefined };
}

function classifyDefects(raw: string, resolved: DisplayTitleContract): Defect[] {
  const defects: Defect[] = [];
  if (/\s*[|•·—–]\s+/.test(raw) && resolved.titleChanged) defects.push('source_suffix');
  if (/\[[^\]]+\]\(|<\/?[a-z]|^[_*]{1,2}\[/.test(raw)) defects.push('markdown');
  if (/<\/?[a-z][^>]*>|&[a-z]+;|&#\d+;/i.test(raw)) defects.push('html');
  if (/\b(takes over|returns to|comes to)\b/i.test(raw)) defects.push('sentence_title');
  if (/^(sign up|apply|buy tickets|register|shop now)/i.test(raw.trim())) defects.push('cta');
  const letters = raw.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 8 && letters === letters.toUpperCase()) defects.push('all_caps');
  if (/\b(huzzah|official website|tickets?,?\s*info|seasons of)\b/i.test(raw)) defects.push('seo_headline');
  if (/^(special events?|events?|calendar|happenings|vendors?)$/i.test(raw.trim())) defects.push('generic_heading');
  return defects;
}

function mergeMeta(
  current: Record<string, unknown>,
  contract: DisplayTitleContract,
): Record<string, unknown> {
  return {
    ...current,
    rawTitle: typeof current.rawTitle === 'string' ? current.rawTitle : contract.rawTitle,
    displayIdentity: toStoredDisplayIdentity(contract),
  };
}

const audit = {
  contentItems: 0,
  calendarItems: 0,
  earlySignals: 0,
  curatorLeads: 0,
  repaired: 0,
  unchanged: 0,
  defects: {
    source_suffix: 0,
    markdown: 0,
    html: 0,
    sentence_title: 0,
    cta: 0,
    all_caps: 0,
    seo_headline: 0,
    venue_as_title: 0,
    generic_heading: 0,
    better_title_in_metadata: 0,
    cross_surface_disagreement: 0,
  } as Record<Defect, number>,
  examples: [] as Array<{ surface: string; id: string; before: string; after: string; reason: string | null }>,
};

function note(surface: string, id: string, before: string, contract: DisplayTitleContract, defects: Defect[]) {
  for (const defect of defects) audit.defects[defect] += 1;
  if (contract.titleChanged) {
    audit.repaired += 1;
    if (audit.examples.length < 24) {
      audit.examples.push({
        surface,
        id,
        before,
        after: contract.displayTitle,
        reason: contract.changeReason,
      });
    }
  } else {
    audit.unchanged += 1;
  }
}

const inventory = await db
  .select({
    id: contentItems.id,
    topic: contentItems.topic,
    script: contentItems.script,
    hook: contentItems.hook,
    locationName: contentItems.locationName,
    sourceUrl: contentItems.sourceUrl,
    metadata: contentItems.metadata,
    sourceName: sources.name,
  })
  .from(contentItems)
  .leftJoin(sources, eq(contentItems.sourceId, sources.id))
  .where(
    and(
      sql`${contentItems.lifecycleStatus} IS DISTINCT FROM 'archived'`,
      sql`${contentItems.creatorValueStatus} IS DISTINCT FROM 'rejected'`,
      sql`${contentItems.creatorValueStatus} IS DISTINCT FROM 'hidden_raw_signal'`,
      or(
        sql`COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) IS NULL`,
        sql`COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) >= NOW() - INTERVAL '14 days'`,
      ),
    ),
  );

const calendar = await db
  .select()
  .from(creatorCalendarItems)
  .where(
    and(
      gte(creatorCalendarItems.startAt, new Date(Date.now() - 7 * 86400000)),
      sql`${creatorCalendarItems.status} IS DISTINCT FROM 'cancelled'`,
    ),
  );
const signals = await db
  .select()
  .from(earlySignals)
  .where(
    and(
      not(inArray(earlySignals.signalState, [...HIDDEN_SIGNAL_STATES])),
      or(isNull(earlySignals.eventDate), gte(earlySignals.eventDate, new Date(Date.now() - 14 * 86400000))),
    ),
  );
const leads = await db
  .select()
  .from(curatorEventLeads)
  .where(isNull(curatorEventLeads.dismissedAt));

audit.contentItems = inventory.length;
audit.calendarItems = calendar.length;
audit.earlySignals = signals.length;
audit.curatorLeads = leads.length;

await loadPageHints([
  ...inventory.filter((row) => rawLooksDefective(row.topic)).map((row) => row.sourceUrl),
  ...inventory
    .filter((row) => /juneteenthkc\.com\/first-fridays|mlb\.com\/royals\/tickets\/specials\/kpop|kcrenfest\.com/i.test(row.sourceUrl ?? ''))
    .map((row) => row.sourceUrl),
  ...calendar
    .filter((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const raw = typeof metadata.rawTitle === 'string' ? metadata.rawTitle : row.title;
      return rawLooksDefective(raw);
    })
    .map((row) => row.sourceUrl),
  ...signals.filter((row) => rawLooksDefective(row.title)).map((row) => row.sourceUrl),
  ...leads.filter((row) => rawLooksDefective(row.eventName)).map((row) => row.discoveredViaPostUrl),
]);

for (const row of inventory) {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const nextMeta = withPageHints(metadata, row.sourceUrl);
  const contract = resolveDisplayTitleFromRecord({
    rawTitle: row.topic,
    sourceName: row.sourceName,
    venueName: row.locationName,
    sourceUrl: row.sourceUrl,
    summary: row.script ?? row.hook,
    metadata: nextMeta,
  });
  const defects = classifyDefects(row.topic, contract);
  if (contract.displayTitle !== row.topic && metadata.displayIdentity) {
    defects.push('better_title_in_metadata');
  }
  note('content_item', row.id, row.topic, contract, defects);
  const storedTitle =
    metadata.displayIdentity && typeof metadata.displayIdentity === 'object'
      ? String((metadata.displayIdentity as { displayTitle?: unknown }).displayTitle ?? '')
      : '';
  if (storedTitle === contract.displayTitle && metadata.displayIdentity && !nextMeta.listingScrape) continue;
  await db
    .update(contentItems)
    .set({
      metadata: mergeMeta({ ...metadata, listingScrape: nextMeta.listingScrape }, contract),
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, row.id));
}

for (const row of calendar) {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const raw = typeof metadata.rawTitle === 'string' ? metadata.rawTitle : row.title;
  const nextMeta = withPageHints(metadata, row.sourceUrl);
  const contract = resolveDisplayTitleFromRecord({
    rawTitle: raw,
    sourceName: typeof metadata.sourceName === 'string' ? metadata.sourceName : null,
    venueName: row.location,
    sourceUrl: row.sourceUrl,
    summary: row.description,
    metadata: nextMeta,
  });
  const defects = classifyDefects(row.title, contract);
  note('calendar', row.id, row.title, contract, defects);
  if (row.title === contract.displayTitle && metadata.displayIdentity && !nextMeta.listingScrape) continue;
  await db
    .update(creatorCalendarItems)
    .set({
      title: contract.displayTitle,
      metadata: mergeMeta({ ...metadata, listingScrape: nextMeta.listingScrape }, { ...contract, rawTitle: raw }),
      updatedAt: new Date(),
    })
    .where(eq(creatorCalendarItems.id, row.id));
}

for (const row of signals) {
  const metadata = (row.normalizedData ?? {}) as Record<string, unknown>;
  const nextMeta = withPageHints(metadata, row.sourceUrl);
  const contract = resolveDisplayTitleFromRecord({
    rawTitle: row.title,
    sourceName: row.sourceName,
    venueName: row.businessName,
    sourceUrl: row.sourceUrl,
    summary: row.summary,
    evidence: row.rawText,
    metadata: nextMeta,
  });
  const defects = classifyDefects(row.title, contract);
  note('early_signal', row.id, row.title, contract, defects);
  const storedTitle =
    metadata.displayIdentity && typeof metadata.displayIdentity === 'object'
      ? String((metadata.displayIdentity as { displayTitle?: unknown }).displayTitle ?? '')
      : '';
  if (storedTitle === contract.displayTitle && metadata.displayIdentity && !nextMeta.listingScrape) continue;
  await db
    .update(earlySignals)
    .set({
      normalizedData: mergeMeta({ ...metadata, listingScrape: nextMeta.listingScrape }, contract),
      updatedAt: new Date(),
    })
    .where(eq(earlySignals.id, row.id));
}

for (const row of leads) {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const nextMeta = withPageHints(metadata, row.discoveredViaPostUrl);
  const contract = resolveDisplayTitleFromRecord({
    rawTitle: row.eventName,
    venueName: row.venue,
    sourceUrl: row.discoveredViaPostUrl,
    evidence: row.originalQuotedText,
    metadata: nextMeta,
  });
  const defects = classifyDefects(row.eventName, contract);
  note('curator_lead', row.id, row.eventName, contract, defects);
  const storedTitle =
    metadata.displayIdentity && typeof metadata.displayIdentity === 'object'
      ? String((metadata.displayIdentity as { displayTitle?: unknown }).displayTitle ?? '')
      : '';
  if (storedTitle === contract.displayTitle && metadata.displayIdentity && !nextMeta.listingScrape) continue;
  await db
    .update(curatorEventLeads)
    .set({
      metadata: mergeMeta({ ...metadata, listingScrape: nextMeta.listingScrape }, contract),
      updatedAt: new Date(),
    })
    .where(eq(curatorEventLeads.id, row.id));
}

const calendarBySource = new Map(calendar.map((row) => [`${row.sourceRecordType}:${row.sourceRecordId}`, row.title]));
for (const row of inventory) {
  const calTitle = calendarBySource.get(`content_item:${row.id}`);
  if (!calTitle) continue;
  const display = resolveDisplayTitleFromRecord({
    rawTitle: row.topic,
    sourceName: row.sourceName,
    venueName: row.locationName,
    sourceUrl: row.sourceUrl,
    summary: row.script ?? row.hook,
    metadata: withPageHints((row.metadata ?? {}) as Record<string, unknown>, row.sourceUrl),
  }).displayTitle;
  const calRow = calendar.find((item) => item.sourceRecordType === 'content_item' && item.sourceRecordId === row.id);
  const calDisplay = calRow
    ? resolveDisplayTitleFromRecord({
        rawTitle:
          typeof (calRow.metadata as Record<string, unknown> | null)?.rawTitle === 'string'
            ? String((calRow.metadata as Record<string, unknown>).rawTitle)
            : calRow.title,
        sourceName:
          typeof (calRow.metadata as Record<string, unknown> | null)?.sourceName === 'string'
            ? String((calRow.metadata as Record<string, unknown>).sourceName)
            : row.sourceName,
        venueName: calRow.location,
        sourceUrl: calRow.sourceUrl,
        summary: calRow.description,
        metadata: withPageHints((calRow.metadata ?? {}) as Record<string, unknown>, calRow.sourceUrl),
      }).displayTitle
    : display;
  if (calTitle && calDisplay !== display) {
    audit.defects.cross_surface_disagreement += 1;
  }
}

console.log(JSON.stringify({ ok: true, audit }, null, 2));
