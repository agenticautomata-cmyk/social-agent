/**
 * Phase 1 visual proof harness — deterministic Weekend Drop + Hotel kit renders.
 * No paid image generation. No email / Telegram / social publish.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { and, eq, gte, lt, notInArray } from 'drizzle-orm';

import { bensonRepoRoot } from '../playwright-runtime/index.js';
import { db } from '../db.js';
import { contentItems, sources } from '../schema.js';
import {
  buildWeekendList,
  type WeekendListSource,
} from '../creator-calendar/weekend-list.js';
import { getChicagoWeekendDayKeys } from '../creator-calendar/weekend-things-to-do.js';
import { resolvePitchAudienceEvidence } from '../hospitality-pitch/creator-evidence.js';
import { examplesForVariant } from '../media-kit/build.js';
import { loadWeekendDropTheme } from '../visual-production/brand/index.js';
import {
  lockWeekendFactSheet,
  packWeekendSlides,
} from '../visual-production/facts/weekend-facts.js';
import { renderWeekendSlideHtml } from '../visual-production/slides/weekend-slides.js';
import {
  renderEditorialHotelKitHtml,
  type EditorialHotelKitContent,
} from '../visual-production/kits/editorial-hotel.js';
import {
  exportHtmlToPdf,
  exportHtmlToPng,
  proofDir,
  writeTextArtifact,
} from '../visual-production/export/playwright-export.js';
import {
  applyPlaywrightBrowsersEnv,
  launchManagedChromium,
} from '../playwright-runtime/index.js';

const HOTEL_TOPIC =
  /\b(hotel|stay|staycation|suite|resort|rooftop|lobby|check[- ]?in|overnight)\b/i;

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function loadVerifiedWeekendSources(now = new Date()): Promise<{
  sources: WeekendListSource[];
  provenance: string;
}> {
  const window = getChicagoWeekendDayKeys(now);
  const from = new Date(`${window.friday}T05:00:00.000Z`);
  const to = new Date(new Date(`${window.sunday}T05:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      item: contentItems,
      sourceName: sources.name,
    })
    .from(contentItems)
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(
      and(
        gte(contentItems.eventStartsAt, from),
        lt(contentItems.eventStartsAt, to),
        notInArray(contentItems.lifecycleStatus, ['expired', 'archived']),
      ),
    )
    .orderBy(contentItems.eventStartsAt)
    .limit(80);

  const scored = rows.map((row) => {
    const item = row.item;
    const raw = (item.rawPayload ?? {}) as Record<string, unknown>;
    const extracted = (raw.extracted ?? {}) as Record<string, unknown>;
    const title = asString(extracted.title) ?? asString(item.topic) ?? 'Untitled';
    const venue =
      asString(extracted.venue) ?? asString(extracted.locationName) ?? asString(item.locationName);
    const blob = `${title} ${venue ?? ''} ${item.locationName ?? ''} ${item.formattedAddress ?? ''} ${JSON.stringify(raw)}`.toLowerCase();
    const outOfMarket = /\borlando\b|\btampa\b|\bmiami\b|\bchicago\b|\bnyc\b|\bnew york\b/.test(blob);
    const kc =
      /\bkansas city\b|\bkc\b|\boverland park\b|\bleawood\b|\blenexa\b|\bmissouri\b|\bjohnson county\b|\bcrossroads\b|\bwest bottoms\b|\bunion station\b|\bpower & light\b|\bplaza\b|\bhistoric west bottoms\b/.test(
        blob,
      ) ||
      Boolean(item.locationVerifiedAt) ||
      item.locationStatus === 'resolved';
    return { row, title, venue, outOfMarket, kc, extracted, item };
  });

  const kcRows = scored.filter((s) => s.kc && !s.outOfMarket);
  const deduped: typeof scored = [];
  const seen = new Set<string>();
  for (const row of kcRows.length >= 4 ? kcRows : scored.filter((s) => !s.outOfMarket)) {
    const key = `${row.title.toLowerCase()}|${(row.venue ?? '').toLowerCase()}`;
    if (seen.has(key)) continue;
    // Skip thin venue-as-title noise.
    if (/^park place\b/i.test(row.title) && !row.venue) continue;
    seen.add(key);
    deduped.push(row);
  }
  const picked = deduped.slice(0, 8);

  const listSources: WeekendListSource[] = picked.map(({ item, row, title, venue, extracted }) => ({
    id: item.id,
    title,
    eventDate: item.eventStartsAt?.toISOString() ?? null,
    eventEndDate: item.eventEndsAt?.toISOString() ?? null,
    venue,
    businessName: asString(extracted.businessName),
    locationName: asString(item.locationName),
    neighborhood: asString(extracted.neighborhood),
    address: asString(item.formattedAddress),
    formattedAddress: asString(item.formattedAddress),
    summary: asString(extracted.summary) ?? asString(item.hook),
    whyItMatters: asString(item.creatorRelevanceExplanation),
    category: asString(item.contentCategory),
    sourceName: asString(row.sourceName),
    sourceUrl: asString(item.sourceUrl),
    locationStatus: asString(item.locationStatus),
    locationVerifiedAt: item.locationVerifiedAt?.toISOString() ?? null,
    notes: null,
    temporalEvidence: {
      eventDate: asString(extracted.eventDate) ?? item.eventStartsAt?.toISOString().slice(0, 10) ?? null,
      eventEndDate: asString(extracted.eventEndDate),
      startTime: asString(extracted.startTime),
    },
  }));

  return {
    sources: listSources,
    provenance:
      kcRows.length >= 4
        ? 'Verified KC-relevant content_items in the current Fri–Sun window (operator weekend board empty).'
        : 'content_items in the current Fri–Sun window (KC filter sparse; still deterministic facts).',
  };
}

async function portraitDataUrl(repoRoot: string): Promise<string | null> {
  const path = join(
    repoRoot,
    'docs/ops/proofs/visual-production-2026-09-07/assets/kellie-approved-print.jpg',
  );
  try {
    const buf = await readFile(path);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function buildHotelProofContent(repoRoot: string): Promise<EditorialHotelKitContent> {
  const audience = await resolvePitchAudienceEvidence();
  const { examples, note } = await examplesForVariant('hotel', 8);
  const onTopic = examples.filter((ex) => HOTEL_TOPIC.test(ex.title));
  const examplesStatus = onTopic.length >= 2 ? 'ready' : 'needs_evidence_review';

  return {
    creatorName: 'Kellie',
    market: 'Kansas City metro (Missouri and Kansas)',
    headline: 'Overnight stays, told as one continuous evening — for people who live here.',
    positioning:
      'Kellie films Kansas City in her own voice the same day she experiences it. For hotels she covers the full arc of a stay — arrival, room, restaurant, and neighborhood — so the property reads as somewhere locals would choose, not only somewhere visitors land.',
    partnershipConcept: {
      title: 'One evening, one continuous stay story',
      body: 'Host Kellie for a single evening stay. She films arrival through the room, a meal or lounge moment, and a short neighborhood beat — then publishes an in-feed video plus Stories while she is still on property.',
      deliverables: [
        'One in-feed short covering arrival, room, and property in a single evening',
        'Story set published live during the stay',
        'Stills of the room and public spaces for the property’s own organic channels',
        'Paid amplification and extended usage licensed separately when needed',
      ],
    },
    audience: {
      platform: audience.platform,
      handle: audience.handle,
      followersCount: audience.followersCount,
      medianViewsPerPost: audience.medianViewsPerPost,
      totalViews: audience.totalViews,
      postsWithMetrics: audience.postsWithMetrics,
      engagementRatePercent: audience.engagementRatePercent,
      lastSyncedAt: audience.lastSyncedAt,
      followersAvailable: audience.followersAvailable,
    },
    examples: examplesStatus === 'ready' ? onTopic.slice(0, 4) : [],
    examplesStatus,
    examplesNote:
      examplesStatus === 'ready'
        ? note
        : `Fewer than 2 hotel-relevant evidenced posts were available (${onTopic.length} matched). Thrift/top-views filler was not used.`,
    collaborationTermsPublic: [
      'Paid and hosted collaborations considered.',
      'Every paid or hosted collaboration is disclosed in-video and in the caption, as the FTC requires.',
      'Kellie keeps editorial control of the edit. Businesses can flag factual errors before posting.',
      'Organic posting rights on the business’s own channels are included. Paid amplification is licensed separately.',
    ],
    contactEmail: null,
    handle: audience.handle ? `${audience.platform} ${audience.handle}` : 'TikTok @kckellie',
    portraitDataUrl: await portraitDataUrl(repoRoot),
    portraitAlt: 'Kellie, Kansas City creator',
    generatedAt: new Date().toISOString(),
  };
}

async function exportHotelPageShots(html: string, out: string): Promise<string[]> {
  applyPlaywrightBrowsersEnv(bensonRepoRoot());
  const browser = await launchManagedChromium();
  const paths: string[] = [];
  try {
    for (const [label, width] of [
      ['desktop', 1200],
      ['phone', 390],
    ] as const) {
      const page = await browser.newPage({
        viewport: { width, height: label === 'phone' ? 844 : 900 },
        deviceScaleFactor: 2,
        isMobile: label === 'phone',
        hasTouch: label === 'phone',
      });
      try {
        await page.setContent(html, { waitUntil: 'networkidle' });
        await page.waitForTimeout(900);
        const coverPath = join(out, `hotel-kit-cover-${label}.png`);
        await page.screenshot({ path: coverPath, type: 'png', fullPage: false });
        paths.push(coverPath);

        await page.evaluate('window.scrollTo(0, Math.min(1100, document.body.scrollHeight * 0.38))');
        await page.waitForTimeout(300);
        const interiorPath = join(out, `hotel-kit-interior-${label}.png`);
        await page.screenshot({ path: interiorPath, type: 'png', fullPage: false });
        paths.push(interiorPath);

        const fullPath = join(out, `hotel-kit-full-${label}.png`);
        await page.screenshot({ path: fullPath, type: 'png', fullPage: true });
        paths.push(fullPath);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  return paths;
}

async function main(): Promise<void> {
  const repoRoot = bensonRepoRoot();
  const out = proofDir(repoRoot);
  const theme = loadWeekendDropTheme();
  const now = new Date();
  const window = getChicagoWeekendDayKeys(now);

  const { sources: listSources, provenance } = await loadVerifiedWeekendSources(now);
  const list = buildWeekendList(listSources, now, window.friday);
  const sheet = lockWeekendFactSheet(list);
  const slides = packWeekendSlides(sheet);

  const cover = slides.find((s) => s.role === 'cover')!;
  const daySlides = slides.filter((s) => s.role === 'day' && s.events.length > 0);
  const daily =
    [...daySlides].sort((a, b) => b.events.length - a.events.length)[0] ??
    daySlides[0];

  if (!daily) {
    throw new Error('No daily slide could be packed — need at least one verified weekend event.');
  }

  const coverCarouselHtml = renderWeekendSlideHtml({ sheet, slide: cover, format: 'carousel' });
  const dailyCarouselHtml = renderWeekendSlideHtml({ sheet, slide: daily, format: 'carousel' });
  const coverStoryHtml = renderWeekendSlideHtml({ sheet, slide: cover, format: 'story' });
  const dailyStoryHtml = renderWeekendSlideHtml({ sheet, slide: daily, format: 'story' });

  await writeTextArtifact(join(out, 'weekend-drop-cover-carousel.html'), coverCarouselHtml);
  await writeTextArtifact(join(out, 'weekend-drop-daily-carousel.html'), dailyCarouselHtml);

  const weekendPaths = await exportHtmlToPng([
    {
      html: coverCarouselHtml,
      width: theme.layout.carousel.width,
      height: theme.layout.carousel.height,
      outPath: join(out, 'weekend-drop-cover-1080x1350.png'),
    },
    {
      html: dailyCarouselHtml,
      width: theme.layout.carousel.width,
      height: theme.layout.carousel.height,
      outPath: join(out, 'weekend-drop-daily-1080x1350.png'),
    },
    {
      html: coverStoryHtml,
      width: theme.layout.story.width,
      height: theme.layout.story.height,
      outPath: join(out, 'weekend-drop-cover-1080x1920.png'),
    },
    {
      html: dailyStoryHtml,
      width: theme.layout.story.width,
      height: theme.layout.story.height,
      outPath: join(out, 'weekend-drop-daily-1080x1920.png'),
    },
  ]);

  // Pass-2 refinement: tighten day-slide hierarchy (larger titles already); re-export v2.
  const refinedDaily = { ...daily, layoutPreset: 'split-band' as const };
  const refinedHtml = renderWeekendSlideHtml({
    sheet,
    slide: refinedDaily,
    format: 'carousel',
  });
  const refinedPaths = await exportHtmlToPng([
    {
      html: refinedHtml,
      width: theme.layout.carousel.width,
      height: theme.layout.carousel.height,
      outPath: join(out, 'weekend-drop-daily-1080x1350-v2.png'),
    },
  ]);

  const hotel = await buildHotelProofContent(repoRoot);
  const hotelHtml = renderEditorialHotelKitHtml(hotel);
  await writeTextArtifact(join(out, 'hotel-kit-editorial.html'), hotelHtml);
  const hotelPdf = await exportHtmlToPdf({
    html: hotelHtml,
    outPath: join(out, 'hotel-kit-editorial.pdf'),
  });
  const hotelPngs = await exportHotelPageShots(hotelHtml, out);

  const manifest = {
    generatedAt: new Date().toISOString(),
    phase: 1,
    weekend: {
      rangeLabel: sheet.rangeLabelFull,
      friday: sheet.friday,
      sunday: sheet.sunday,
      factsHash: sheet.factsHash,
      eventCount: sheet.events.length,
      provenance,
      events: sheet.events.map((e) => ({
        dayKey: e.dayKey,
        title: e.title,
        startTimeLabel: e.startTimeLabel,
        venue: e.venue,
      })),
      slides: slides.map((s) => ({
        role: s.role,
        dayKey: s.dayKey,
        eventCount: s.events.length,
        layoutPreset: s.layoutPreset,
      })),
      artifacts: [...weekendPaths, ...refinedPaths],
    },
    hotel: {
      examplesStatus: hotel.examplesStatus,
      examplesShown: hotel.examples.length,
      audienceFollowers: hotel.audience.followersCount,
      portraitComposited: Boolean(hotel.portraitDataUrl),
      portraitAssetId: 'b5831e43-2012-4bbb-953f-8fcfa01a8076',
      artifacts: [join(out, 'hotel-kit-editorial.html'), hotelPdf, ...hotelPngs],
    },
    notes: [
      'Weekend Drop reference PNGs were not filesystem-accessible; design follows written brief (navy/yellow/teal).',
      'No paid image generation in Phase 1.',
      'No email, Telegram, or social publish.',
      'Kellie portrait composited locally from approved asset derivatives; not regenerated.',
    ],
  };

  await writeTextArtifact(join(out, 'phase1-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
