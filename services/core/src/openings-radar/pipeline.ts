import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { emitDataChange } from '../data-revision/index.js';
import { db } from '../db.js';
import { openingIngestRuns } from '../schema.js';
import { pickCanonicalArticleUrl } from '../newsletter-intelligence/editorial-opportunity/canonical-url.js';
import { fetchEditorialArticle } from '../newsletter-intelligence/editorial-opportunity/article-fetch.js';
import { buildSourceFingerprint, hashText } from './identity.js';
import { isOpeningRoundupDocument, parseOpeningRoundup } from './parse-roundup.js';
import { persistOpeningEntry } from './persist.js';
import type { OpeningIngestResult, OpeningSourceProvenance } from './types.js';

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Prefer richest legitimate public representation:
 * structured article text > email body > caption.
 */
export async function ingestOpeningRoundup(input: {
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  urls?: string[];
  gmailMessageId?: string | null;
  discoveryEmailMessageId?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  receivedAt?: Date;
  socialPostUrl?: string | null;
  channel?: OpeningSourceProvenance['channel'];
  dryRun?: boolean;
  fetchArticle?: boolean;
  force?: boolean;
  runId?: string;
}): Promise<OpeningIngestResult> {
  const runId = input.runId ?? randomUUID();
  const emailText = (input.bodyText || '').trim() || stripHtml(input.bodyHtml ?? '');
  const urls = input.urls ?? [];
  const canonicalArticleUrl = pickCanonicalArticleUrl(urls);
  const rejected: OpeningIngestResult['rejected'] = [];

  let articleText: string | null = null;
  let publicationDate: string | null = null;
  let articleTitle: string | null = input.subject;
  let author: string | null = input.senderName ?? null;

  if (input.fetchArticle !== false && canonicalArticleUrl) {
    const article = await fetchEditorialArticle(canonicalArticleUrl);
    if (article.access === 'fetched' && article.text) {
      articleText = article.text;
      publicationDate = article.publicationDate;
      articleTitle = article.headline ?? articleTitle;
      author = article.author ?? author;
    } else {
      rejected.push({
        reason: 'article_inaccessible',
        detail: article.blockedReason ?? article.access,
      });
    }
  }

  // Prefer article text when available (richer structured content)
  const primaryText = articleText?.trim() || emailText;
  const channel: OpeningSourceProvenance['channel'] =
    input.channel ?? (articleText ? 'article' : input.socialPostUrl ? 'social' : 'email');

  if (!input.force && !isOpeningRoundupDocument(input.subject, primaryText)) {
    await recordRun(runId, input, {
      entriesParsed: 0,
      locationsCreated: 0,
      locationsUpdated: 0,
      locationsMerged: 0,
      opportunitiesCreated: 0,
      eventsCreated: 0,
      alertsCreated: 0,
      decisions: [],
      rejected: [{ reason: 'not_opening_roundup' }],
    });
    return {
      runId,
      sourceFingerprint: '',
      entriesParsed: 0,
      locationsCreated: 0,
      locationsUpdated: 0,
      locationsMerged: 0,
      opportunitiesCreated: 0,
      eventsCreated: 0,
      alertsCreated: 0,
      decisions: [],
      rejected: [{ reason: 'not_opening_roundup' }],
    };
  }

  const sourceFingerprint = buildSourceFingerprint({
    canonicalArticleUrl,
    gmailMessageId: input.gmailMessageId,
    subject: input.subject,
    socialPostUrl: input.socialPostUrl,
    bodyHash: hashText(primaryText),
  });

  const year =
    (publicationDate ? Number(publicationDate.slice(0, 4)) : undefined) ||
    input.receivedAt?.getFullYear() ||
    new Date().getFullYear();

  const entries = parseOpeningRoundup({
    subject: input.subject,
    text: primaryText,
    publicationYear: year,
  });

  if (entries.length === 0) {
    const result: OpeningIngestResult = {
      runId,
      sourceFingerprint,
      entriesParsed: 0,
      locationsCreated: 0,
      locationsUpdated: 0,
      locationsMerged: 0,
      opportunitiesCreated: 0,
      eventsCreated: 0,
      alertsCreated: 0,
      decisions: [],
      rejected: [...rejected, { reason: 'no_establishment_entries' }],
    };
    await recordRun(runId, input, result);
    return result;
  }

  const provenance: OpeningSourceProvenance = {
    monitoredSource: input.senderEmail ?? input.senderName ?? null,
    articleTitle,
    author,
    publicationDate,
    canonicalArticleUrl,
    gmailMessageId: input.gmailMessageId ?? null,
    discoveryEmailMessageId: input.discoveryEmailMessageId ?? null,
    socialPostUrl: input.socialPostUrl ?? null,
    sourceFingerprint,
    extractedAt: new Date().toISOString(),
    channel,
  };

  let locationsCreated = 0;
  let locationsUpdated = 0;
  let locationsMerged = 0;
  let opportunitiesCreated = 0;
  let eventsCreated = 0;
  let alertsCreated = 0;
  const decisions: OpeningIngestResult['decisions'] = [];

  // Bound concurrency — memory-tight host
  for (const entry of entries) {
    const decision = await persistOpeningEntry({
      entry,
      provenance,
      dryRun: input.dryRun,
    });
    decisions.push(decision);
    if (decision.created) locationsCreated += 1;
    if (decision.updated) locationsUpdated += 1;
    if (decision.duplicateMerged) locationsMerged += 1;
    if (decision.created && decision.opportunityContentItemId) opportunitiesCreated += 1;
    if (decision.created && decision.calendarItemId) eventsCreated += 1;
    if (decision.alertCreated) alertsCreated += 1;
  }

  const result: OpeningIngestResult = {
    runId,
    sourceFingerprint,
    entriesParsed: entries.length,
    locationsCreated,
    locationsUpdated,
    locationsMerged,
    opportunitiesCreated,
    eventsCreated,
    alertsCreated,
    decisions,
    rejected,
  };

  if (!input.dryRun && (locationsCreated > 0 || locationsUpdated > 0)) {
    await emitDataChange({
      eventType: 'manual_update',
      domains: ['discoveries', 'opportunities', 'recommendations', 'home_briefing'],
      completedAt: new Date().toISOString(),
      source: 'openings-radar',
      recordIds: decisions.map((d) => d.locationId),
      success: true,
      metadata: {
        runId,
        locationsCreated,
        locationsUpdated,
        opportunitiesCreated,
        eventsCreated,
      },
    });
  }

  await recordRun(runId, input, result);
  return result;
}

async function recordRun(
  runId: string,
  input: {
    subject: string;
    gmailMessageId?: string | null;
    dryRun?: boolean;
    urls?: string[];
  },
  result: Omit<OpeningIngestResult, 'runId' | 'sourceFingerprint'> & {
    sourceFingerprint?: string;
    rejected: OpeningIngestResult['rejected'];
  },
) {
  try {
    await db.insert(openingIngestRuns).values({
      id: runId,
      runKind: 'editorial_roundup',
      sourceFingerprint: result.sourceFingerprint ?? null,
      gmailMessageId: input.gmailMessageId ?? null,
      sourceUrl: input.urls?.[0] ?? null,
      subject: input.subject,
      dryRun: Boolean(input.dryRun),
      completedAt: new Date(),
      report: result as unknown as Record<string, unknown>,
      status: 'completed',
    });
  } catch {
    // Non-fatal — table may not exist until migration
  }
}

export async function processOpeningsFromEditorialEmail(input: {
  gmailMessageId: string;
  discoveryEmailMessageId?: string | null;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  urls: string[];
  senderEmail?: string | null;
  senderName?: string | null;
  receivedAt?: Date;
  dryRun?: boolean;
  fetchArticle?: boolean;
}): Promise<OpeningIngestResult | null> {
  if (!isOpeningRoundupDocument(input.subject, input.bodyText)) {
    return null;
  }
  return ingestOpeningRoundup({
    ...input,
    channel: 'email',
  });
}
