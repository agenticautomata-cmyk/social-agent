import { eq } from 'drizzle-orm';
import OpenAI from 'openai';
import { db } from '../db.js';
import { contentItems, greenScreenPackages, plannerItems } from '../schema.js';
import { env } from '../env.js';
import { formatIsoDate } from '../datetime.js';
import { isGreenScreenFormat, type CoverageFormat } from '../coverage-format/constants.js';
import { extractOpportunityFacts, validateOpportunityFacts } from './validate-facts.js';
import { findDuplicateOpportunity } from './duplicates.js';
import { buildFallbackGreenScreenPackage } from './fallback-package.js';
import { buildGreenScreenPlannerPatch } from './planner-patch.js';

export type GreenScreenPackageRecord = {
  contentItemId: string;
  status: 'draft' | 'prepared' | 'completed';
  suggestedHeadline: string | null;
  openingHook: string | null;
  spokenScript: string | null;
  keyFacts: string[];
  eventDates: string | null;
  location: string | null;
  priceOrOffer: string | null;
  restrictions: string | null;
  backgroundSources: Array<{ label: string; url: string | null }>;
  onScreenText: string[];
  caption: string | null;
  hashtags: string[];
  callToAction: string | null;
  sourceAttribution: string | null;
  verificationStatus: 'verified' | 'partial' | 'unverified' | 'expired';
  verificationFlags: string[];
  visitLaterNotes: string | null;
  duplicateOfContentItemId: string | null;
  duplicateOfTitle: string | null;
  preparedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

function rowToRecord(
  row: typeof greenScreenPackages.$inferSelect,
  duplicateTitle?: string | null,
): GreenScreenPackageRecord {
  return {
    contentItemId: row.contentItemId,
    status: row.status as GreenScreenPackageRecord['status'],
    suggestedHeadline: row.suggestedHeadline,
    openingHook: row.openingHook,
    spokenScript: row.spokenScript,
    keyFacts: (row.keyFacts as string[]) ?? [],
    eventDates: row.eventDates,
    location: row.location,
    priceOrOffer: row.priceOrOffer,
    restrictions: row.restrictions,
    backgroundSources: (row.backgroundSources as Array<{ label: string; url: string | null }>) ?? [],
    onScreenText: (row.onScreenText as string[]) ?? [],
    caption: row.caption,
    hashtags: (row.hashtags as string[]) ?? [],
    callToAction: row.callToAction,
    sourceAttribution: row.sourceAttribution,
    verificationStatus: row.verificationStatus as GreenScreenPackageRecord['verificationStatus'],
    verificationFlags: (row.verificationFlags as string[]) ?? [],
    visitLaterNotes: row.visitLaterNotes,
    duplicateOfContentItemId: row.duplicateOfContentItemId,
    duplicateOfTitle: duplicateTitle ?? null,
    preparedAt: row.preparedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function announcementVoicePrefix(firsthandVisited: boolean, coverageFormat: CoverageFormat | null): string {
  if (firsthandVisited) return '';
  if (coverageFormat === 'green_screen_then_visit') {
    return 'Use announcement language — e.g. "Here\'s what was announced", "According to the business", "I haven\'t visited yet", "I\'ll follow up after it opens". ';
  }
  return 'Use announcement language — e.g. "Here\'s what was announced", "According to the business". Do NOT imply Kellie has visited or tried the experience. ';
}

async function generateWithOpenAi(input: {
  facts: ReturnType<typeof extractOpportunityFacts>;
  validation: ReturnType<typeof validateOpportunityFacts>;
  coverageFormat: CoverageFormat | null;
}): Promise<Partial<GreenScreenPackageRecord> | null> {
  if (!env.OPENAI_API_KEY?.trim() || env.DEMO_MODE) return null;

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const voice = announcementVoicePrefix(input.facts.firsthandVisited, input.coverageFormat);

  const response = await client.chat.completions.create({
    model: env.BENSON_ASK_MODEL,
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You write Green Screen TikTok packages for Kellie, a Kansas City creator. ' +
          voice +
          'Return JSON: suggestedHeadline, openingHook, spokenScript, keyFacts (array), eventDates, location, priceOrOffer, restrictions, backgroundSources ([{label,url}]), onScreenText (array), caption, hashtags (array), callToAction, sourceAttribution, visitLaterNotes. Only use provided facts — never invent dates, prices, or restrictions.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          facts: input.facts,
          validation: input.validation,
          coverageFormat: input.coverageFormat,
        }),
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<GreenScreenPackageRecord>;
  } catch {
    return null;
  }
}

export async function loadGreenScreenPackage(contentItemId: string): Promise<GreenScreenPackageRecord | null> {
  const row = await db.query.greenScreenPackages.findFirst({
    where: eq(greenScreenPackages.contentItemId, contentItemId),
  });
  if (!row) return null;

  let duplicateTitle: string | null = null;
  if (row.duplicateOfContentItemId) {
    const dup = await db.query.contentItems.findFirst({
      where: eq(contentItems.id, row.duplicateOfContentItemId),
    });
    duplicateTitle = dup?.topic ?? null;
  }

  return rowToRecord(row, duplicateTitle);
}

export async function prepareGreenScreenPackage(contentItemId: string): Promise<GreenScreenPackageRecord> {
  const item = await db.query.contentItems.findFirst({
    where: eq(contentItems.id, contentItemId),
  });
  if (!item) throw new Error('Content item not found');

  const coverageFormat = item.coverageFormat as CoverageFormat | null;
  if (!isGreenScreenFormat(coverageFormat)) {
    throw new Error('Coverage format must be Green Screen from Home or Green Screen Now, Visit Later');
  }

  const facts = extractOpportunityFacts(item);
  const validation = validateOpportunityFacts(facts);
  const duplicate = await findDuplicateOpportunity({
    contentItemId,
    title: facts.title,
    sourceUrl: facts.sourceUrl,
  });

  const ai = await generateWithOpenAi({ facts, validation, coverageFormat });
  const fallback = buildFallbackGreenScreenPackage(facts, validation, coverageFormat);
  const merged = { ...fallback, ...ai, status: 'draft' as const };

  const flags = [
    ...validation.missingFields.map((f) => `Missing: ${f}`),
    ...validation.unverifiedFields.map((f) => `Unverified: ${f}`),
    ...validation.warnings,
    ...(duplicate ? [`Possible duplicate: ${duplicate.title}`] : []),
  ];

  const now = new Date();
  const values = {
    contentItemId,
    status: 'draft' as const,
    suggestedHeadline: merged.suggestedHeadline,
    openingHook: merged.openingHook,
    spokenScript: merged.spokenScript,
    keyFacts: merged.keyFacts,
    eventDates: merged.eventDates ?? facts.eventDate ? formatIsoDate(facts.eventDate) : null,
    location: merged.location ?? facts.location,
    priceOrOffer: merged.priceOrOffer ?? facts.priceOrOffer,
    restrictions: merged.restrictions ?? facts.restrictions,
    backgroundSources: merged.backgroundSources?.length
      ? merged.backgroundSources
      : fallback.backgroundSources,
    onScreenText: merged.onScreenText ?? fallback.onScreenText,
    caption: merged.caption,
    hashtags: merged.hashtags ?? fallback.hashtags,
    callToAction: merged.callToAction,
    sourceAttribution: merged.sourceAttribution ?? facts.sourceAttribution ?? facts.sourceUrl,
    verificationStatus: validation.verificationStatus,
    verificationFlags: flags,
    visitLaterNotes: merged.visitLaterNotes ?? fallback.visitLaterNotes,
    duplicateOfContentItemId: duplicate?.id ?? null,
    updatedAt: now,
  };

  const existing = await db.query.greenScreenPackages.findFirst({
    where: eq(greenScreenPackages.contentItemId, contentItemId),
  });

  if (existing) {
    await db
      .update(greenScreenPackages)
      .set(values)
      .where(eq(greenScreenPackages.id, existing.id));
  } else {
    await db.insert(greenScreenPackages).values(values);
  }

  const pkg = await loadGreenScreenPackage(contentItemId);
  if (!pkg) throw new Error('Failed to save green screen package');
  return pkg;
}

export async function saveGreenScreenPackage(
  contentItemId: string,
  patch: Partial<Omit<GreenScreenPackageRecord, 'contentItemId' | 'updatedAt'>>,
): Promise<GreenScreenPackageRecord> {
  const existing = await db.query.greenScreenPackages.findFirst({
    where: eq(greenScreenPackages.contentItemId, contentItemId),
  });
  if (!existing) throw new Error('Green screen package not found — run Prepare Green Screen Post first');

  await db
    .update(greenScreenPackages)
    .set({
      suggestedHeadline: patch.suggestedHeadline ?? undefined,
      openingHook: patch.openingHook ?? undefined,
      spokenScript: patch.spokenScript ?? undefined,
      keyFacts: patch.keyFacts ?? undefined,
      eventDates: patch.eventDates ?? undefined,
      location: patch.location ?? undefined,
      priceOrOffer: patch.priceOrOffer ?? undefined,
      restrictions: patch.restrictions ?? undefined,
      backgroundSources: patch.backgroundSources ?? undefined,
      onScreenText: patch.onScreenText ?? undefined,
      caption: patch.caption ?? undefined,
      hashtags: patch.hashtags ?? undefined,
      callToAction: patch.callToAction ?? undefined,
      sourceAttribution: patch.sourceAttribution ?? undefined,
      visitLaterNotes: patch.visitLaterNotes ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(greenScreenPackages.id, existing.id));

  const pkg = await loadGreenScreenPackage(contentItemId);
  if (!pkg) throw new Error('Failed to load package');
  return pkg;
}

export async function markGreenScreenStatus(
  contentItemId: string,
  status: 'prepared' | 'completed',
): Promise<GreenScreenPackageRecord> {
  const item = await db.query.contentItems.findFirst({
    where: eq(contentItems.id, contentItemId),
  });
  if (!item) throw new Error('Content item not found');

  const pkgRow = await db.query.greenScreenPackages.findFirst({
    where: eq(greenScreenPackages.contentItemId, contentItemId),
  });
  if (!pkgRow) throw new Error('Green screen package not found');

  const now = new Date();
  await db
    .update(greenScreenPackages)
    .set({
      status,
      preparedAt: status === 'prepared' || status === 'completed' ? now : pkgRow.preparedAt,
      completedAt: status === 'completed' ? now : null,
      updatedAt: now,
    })
    .where(eq(greenScreenPackages.id, pkgRow.id));

  const coverageFormat = item.coverageFormat as CoverageFormat | null;
  const plannerPatch = buildGreenScreenPlannerPatch({
    coverageFormat,
    status,
    eventStartsAt: item.eventStartsAt ?? null,
  });

  const plannerRowPatch: Partial<typeof plannerItems.$inferInsert> = {
    ...plannerPatch,
    updatedAt: now,
  };

  const planner = await db.query.plannerItems.findFirst({
    where: eq(plannerItems.contentItemId, contentItemId),
  });
  if (planner) {
    await db
      .update(plannerItems)
      .set(plannerRowPatch)
      .where(eq(plannerItems.id, planner.id));
  } else if (Object.keys(plannerRowPatch).length > 1) {
    await db.insert(plannerItems).values({
      contentItemId,
      listName: 'Saved For Later',
      status: plannerRowPatch.status ?? 'saved',
      greenScreenStatus: status,
      visitReminderAt: plannerRowPatch.visitReminderAt ?? null,
      followUpAt: plannerRowPatch.followUpAt ?? null,
    });
  }

  const pkg = await loadGreenScreenPackage(contentItemId);
  if (!pkg) throw new Error('Failed to load package');
  return pkg;
}
