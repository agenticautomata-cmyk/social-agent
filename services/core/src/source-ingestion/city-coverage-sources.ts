import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, sources } from '../schema.js';
import { normalizeScrapeUrl } from './register-scrape-source.js';

/** Curated recurring KC feeds — thrift/discounts through major events. */
export const KC_CITY_SCRAPE_SOURCES = [
  {
    name: 'Visit KC Events Calendar',
    listingUrl: 'https://www.visitkc.com/events/',
    pillar: 'major_events',
  },
  {
    name: 'Crossroads Events Calendar',
    listingUrl: 'https://kccrossroads.org/events/',
    pillar: 'major_events',
  },
  {
    name: 'Rainy Day Books Signings',
    listingUrl: 'https://rainydaybooks.com/events',
    pillar: 'celebrity_charity',
  },
  {
    name: 'Do816 Ameristar Concerts',
    listingUrl: 'https://do816.com/venues/ameristar/events',
    pillar: 'major_events',
  },
  {
    name: 'Do816 Hollywood Casino Events',
    listingUrl: 'https://do816.com/venues/hollywood-casino/events',
    pillar: 'major_events',
  },
  {
    name: 'Powell Gardens Events',
    listingUrl: 'https://powellgardens.org/events-and-classes/',
    pillar: 'major_events',
  },
  {
    name: 'KC Zoo Events',
    listingUrl: 'https://kansascityzoo.org/events',
    pillar: 'major_events',
  },
  {
    name: 'Nelson-Atkins Calendar',
    listingUrl: 'https://nelson-atkins.org/calendar/',
    pillar: 'free_events',
  },
  {
    name: 'KC Convention Center Events',
    listingUrl: 'https://kcconvention.com/events/',
    pillar: 'major_events',
  },
  {
    name: 'Country Club Plaza Events',
    listingUrl: 'https://www.countryclubplaza.com/events',
    pillar: 'shopping_retail',
  },
  {
    name: 'CardShows.io KC Metro',
    listingUrl: 'https://cardshows.io/missouri/greater-kansas-city',
    pillar: 'collector',
  },
  {
    name: 'Union Station Event Calendar',
    listingUrl: 'https://unionstation.org/event-calendar/',
    pillar: 'major_events',
  },
] as const;

export const KC_THRIFT_SOURCE = {
  name: 'KC Thrift & Discount Stores',
  type: 'consignment_kc' as const,
  config: {
    shops: 'thrift_defaults',
  },
};

const CALENDAR_URL_RE =
  /\/(events|calendar|schedule|festivals|concerts|classes|signings?)(\/|$|\?)/i;

export function looksLikeRecurringCalendarUrl(url: string): boolean {
  const normalized = normalizeScrapeUrl(url);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    if (CALENDAR_URL_RE.test(parsed.pathname)) return true;
    return /events?|calendar|schedule|festivals?/i.test(parsed.hostname + parsed.pathname);
  } catch {
    return false;
  }
}

async function defaultCampaignId(): Promise<string> {
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.active, true))
    .orderBy(desc(campaigns.createdAt))
    .limit(1);
  if (!campaign) throw new Error('No active campaign found');
  return campaign.id;
}

export async function seedCityCoverageSources(): Promise<{
  created: number;
  skipped: number;
  thriftCreated: boolean;
}> {
  const campaignId = await defaultCampaignId();
  let created = 0;
  let skipped = 0;

  for (const entry of KC_CITY_SCRAPE_SOURCES) {
    const listingUrl = normalizeScrapeUrl(entry.listingUrl);
    if (!listingUrl) continue;

    const exists = await db.query.sources.findFirst({
      where: and(eq(sources.campaignId, campaignId), eq(sources.name, entry.name)),
    });
    if (exists) {
      skipped += 1;
      continue;
    }

    await db.insert(sources).values({
      campaignId,
      type: 'scrape',
      name: entry.name,
      config: {
        listingUrl,
        discoveredVia: 'city_coverage_seed',
        pillar: entry.pillar,
        registeredAt: new Date().toISOString(),
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    created += 1;
  }

  let thriftCreated = false;
  const thriftExists = await db.query.sources.findFirst({
    where: and(eq(sources.campaignId, campaignId), eq(sources.name, KC_THRIFT_SOURCE.name)),
  });
  if (!thriftExists) {
    await db.insert(sources).values({
      campaignId,
      type: KC_THRIFT_SOURCE.type,
      name: KC_THRIFT_SOURCE.name,
      config: { useThriftDefaults: true },
      active: true,
      pollIntervalCron: '0 0 * * 0',
    });
    thriftCreated = true;
  }

  return { created, skipped, thriftCreated };
}

export async function registerDiscoveryCalendarSource(input: {
  campaignId: string;
  url: string;
  title?: string | null;
}): Promise<{ registered: boolean; sourceId?: string }> {
  const normalized = normalizeScrapeUrl(input.url);
  if (!normalized || !looksLikeRecurringCalendarUrl(normalized)) {
    return { registered: false };
  }

  const host = new URL(normalized).hostname.replace(/^www\./i, '');
  const name = input.title?.trim()
    ? input.title.trim().slice(0, 72)
    : `${host} events`;

  const exists = await db.query.sources.findFirst({
    where: and(eq(sources.campaignId, input.campaignId), eq(sources.name, name)),
  });
  if (exists) return { registered: false, sourceId: exists.id };

  const [row] = await db
    .insert(sources)
    .values({
      campaignId: input.campaignId,
      type: 'scrape',
      name,
      config: {
        listingUrl: normalized,
        discoveredVia: 'benson_discovery',
        registeredAt: new Date().toISOString(),
      },
      active: true,
      pollIntervalCron: '0 9 * * *',
    })
    .returning({ id: sources.id });

  return { registered: true, sourceId: row!.id };
}
