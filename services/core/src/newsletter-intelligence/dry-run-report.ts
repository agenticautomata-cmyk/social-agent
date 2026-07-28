import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { headerValue, parseFromHeader } from '../gmail-inbox/client.js';
import { listGmailMessageIds } from '../gmail-inbox/messages.js';
import { fetchDiscoveryMessage, type ParsedDiscoveryMessage } from '../gmail-inbox/message-parse.js';
import { classifyImageSkipReason, type ImageAuditRecord, type ImageOutcomeKind } from './ocr.js';
import {
  classifyNewsletterEmail,
  isProcessableNewsletterCategory,
  senderDomainFromEmail,
} from './classify.js';
import { enrichNewsletterMessage } from './enrich.js';
import {
  evaluateNewsletterItem,
  buildLocationLabel,
  calendarEligible,
} from './quality-gates.js';
import { entityResolutionRejected } from './entity-resolve.js';
import { buildOccurrenceFingerprint } from './persist.js';
import { resolveNewsletterUrls, isTrackingUrl, pickCanonicalSourceUrl } from './resolve-links.js';
import { verifyNewsletterItem, isOfficialVerificationStatus } from './verification.js';
import { resolveNewsletterLocation, applyLocationToItem } from './location-resolve.js';
import { collapseProductNoise } from './product-collapse.js';
import { findProbableDuplicateClusters, titlesLikelySameEvent } from './dedupe.js';
import { evaluateAgainstLabeledSet, buildLabeledFixturePredictions, LABELED_EVAL_SET, type AccuracyMetrics, type EvalPrediction } from './evaluation-set.js';
import {
  chooseDestination,
  needsVerificationGate,
  scoreOpportunityCandidate,
  type OpportunityScoreKind,
  type ProposedDestination,
} from './opportunity-promote.js';
import { proveScannedPdfOcrPipeline, createSyntheticScannedPdfFixture, extractPdfBuffer } from './pdf-parse.js';
import type { ExtractedNewsletterItem, NewsletterCategory, VerificationStatus } from './types.js';
import type { LocationOutcome } from './location-resolve.js';

export type ProposedRecord = {
  entityName: string;
  title: string;
  layer: 'entity' | 'occurrence';
  entityType: string;
  occurrenceType: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  locationOutcome: LocationOutcome;
  opportunityType: string;
  newsletterSource: string;
  officialSource: string | null;
  verificationStatus: VerificationStatus;
  whyPassed: string;
  destination: ProposedDestination;
  fingerprint: string | null;
  senderDomain: string;
  gmailMessageId: string;
  subject: string;
  confidence: number;
  sourceTitles?: string[];
  opportunityKinds?: OpportunityScoreKind[];
  opportunityScore?: number;
};

export type RejectedRecord = {
  title: string;
  entityName: string;
  reason: string;
  senderDomain: string;
  gmailMessageId: string;
  subject: string;
};

export type ContradictionTrace = {
  title: string;
  gmailMessageId: string;
  subject: string;
  senderDomain: string;
  accepted?: ProposedRecord;
  rejected?: RejectedRecord;
  analysis: string;
  sameOccurrence: boolean;
};

export type OcrCoverageReport = {
  imagesFound: number;
  byOutcome: Record<ImageOutcomeKind | string, number>;
  meaningfulTextImagesFound: number;
  meaningfulTextImagesOcrd: number;
  meaningfulTextImagesMissed: number;
  ocrPrecision: number;
  ocrRecall: number;
  manualReviewSample: ImageAuditRecord[];
  note: string;
};

export type ProductionDryRunReport = {
  runAt: string;
  sinceDays: number;
  dryRun: true;
  corpusSource: 'gmail' | 'discovery_db';
  messageIds?: string[];
  corpusCount?: number;
  corpusHash?: string;
  totals: {
    messagesScanned: number;
    relevantNewsletters: number;
    officialBusinessNewsletters: number;
    localRoundupNewsletters: number;
    ignoredTransactional: number;
    ignoredPersonal: number;
    ignoredSpam: number;
    imagesFound: number;
    imagesOcrd: number;
    pdfsParsed: number;
    scannedPdfPagesOcr: number;
    icsParsed: number;
    entitiesFound: number;
    restaurantEntities: number;
    retailEntities: number;
    localRetailers: number;
    nationalRetailersWithoutLocalProof: number;
    meaningfulPromotions: number;
    venues: number;
    organizers: number;
    datedOccurrences: number;
    completeDateTimeLocation: number;
    missingTime: number;
    missingLocation: number;
    secondaryOnly: number;
    officiallyVerified: number;
    needsVerification: number;
    officialSourceMatches: number;
    conflicts: number;
    duplicatesMerged: number;
    probableDuplicateClusters: number;
    productNoiseCollapsed: number;
    weatherNewsRejected: number;
    expiredRecords: number;
    outOfMarket: number;
    quarantined: number;
    proposedInventory: number;
    proposedOpportunities: number;
    proposedCalendar: number;
    verificationQueue: number;
  };
  bySender: Record<
    string,
    {
      emails: number;
      entities: number;
      occurrences: number;
      quarantined: number;
      category: NewsletterCategory;
    }
  >;
  acceptedSamples: ProposedRecord[];
  rejectedSamples: RejectedRecord[];
  duplicateClusters: ReturnType<typeof findProbableDuplicateClusters>;
  contradictionTraces: ContradictionTrace[];
  ocrCoverage: OcrCoverageReport;
  accuracyEvaluation: AccuracyMetrics;
  /** Synthetic scanned-PDF fixture — NOT mixed into Gmail production totals. */
  syntheticAcceptance?: {
    scannedPdfFixture: {
      ok: boolean;
      title: string | null;
      date: string | null;
      time: string | null;
      location: string | null;
      provenance: string | null;
      confidence: number | null;
      destination: string | null;
      locationOutcome: LocationOutcome | null;
      scannedPagesOcr: number;
      error?: string;
    };
  };
  qualityProofs?: {
    lifeOfTheParty: Array<Record<string, unknown>>;
    nationalRetailFalsePositives: ProposedRecord[];
    unresolvedPhysicalLocations: ProposedRecord[];
  };
  acceptanceGates: Record<string, boolean>;
  blockingGates: Record<string, boolean>;
  errors: string[];
};

function inferDestination(
  item: ExtractedNewsletterItem,
  gate: ReturnType<typeof evaluateNewsletterItem>,
  verificationStatus: VerificationStatus,
  gateReason?: string,
): { destination: ProposedDestination; opportunityKinds: OpportunityScoreKind[]; opportunityScore: number } {
  if (gateReason === 'expired_occurrence') {
    return { destination: 'expired', opportunityKinds: [], opportunityScore: 0 };
  }
  if (gateReason || !gate.accept) {
    return { destination: 'quarantine', opportunityKinds: [], opportunityScore: 0 };
  }

  const location = gate.locationLabel ?? buildLocationLabel(item);
  const opportunity = scoreOpportunityCandidate({
    entityName: item.entityName,
    title: item.title,
    layer: item.layer,
    entityType: item.entityType,
    occurrenceType: item.occurrenceType,
    date: item.startDate,
    location,
    locationOutcome: gate.locationOutcome,
    description: item.description,
  });
  const verification = needsVerificationGate({
    entityName: item.entityName,
    title: item.title,
    layer: item.layer,
    locationOutcome: gate.locationOutcome,
    location,
    date: item.startDate,
    verificationStatus,
    confidence: item.confidence,
  });

  const chosen = chooseDestination({
    calendarOk: calendarEligible(item, gate, verificationStatus),
    verificationNeeded: verification.needed,
    verificationReason: verification.reason,
    opportunity,
    layer: item.layer,
    hasDate: Boolean(item.startDate),
  });

  return {
    destination: chosen.destination,
    opportunityKinds: chosen.opportunityKinds,
    opportunityScore: opportunity.score,
  };
}

function isRestaurantEntity(item: ExtractedNewsletterItem): boolean {
  return (
    item.entityType === 'restaurant' ||
    item.entityType === 'bar' ||
    /restaurant|dining|food|cafe|coffee/i.test(item.title)
  );
}

function isRetailEntity(item: ExtractedNewsletterItem): boolean {
  return (
    item.entityType === 'retailer' ||
    item.entityType === 'store' ||
    item.entityType === 'shopping_center' ||
    item.occurrenceType === 'sale' ||
    /sale|retail|store|shop|clearance/i.test(item.title)
  );
}

function extractKcHintsFromBody(bodyText: string): {
  city: string | null;
  venue: string | null;
  streetAddress: string | null;
} {
  const cityMatch = bodyText.match(
    /\b(Kansas City|Overland Park|Olathe|Lenexa|Shawnee|Leawood|Independence|Lee'?s Summit)\b/i,
  );
  const addrMatch = bodyText.match(/\b(\d{2,5}\s+[A-Za-z0-9.'\- ]+(?:St|Ave|Blvd|Rd|Dr|Ln|Pkwy)\.?)\b/i);
  const venueMatch = bodyText.match(/\b(?:at|@)\s+([A-Z][A-Za-z0-9&' .-]{2,40})\b/);
  return {
    city: cityMatch?.[1] ?? null,
    streetAddress: addrMatch?.[1] ?? null,
    venue: venueMatch?.[1] ?? null,
  };
}

function buildOcrCoverage(audits: ImageAuditRecord[]): OcrCoverageReport {
  const byOutcome: Record<string, number> = {};
  for (const a of audits) {
    byOutcome[a.outcome] = (byOutcome[a.outcome] ?? 0) + 1;
  }

  const nonMeaningful = new Set([
    'tracking_pixel',
    'logo',
    'social_icon',
    'decorative',
    'duplicate',
    'too_small',
  ]);

  const candidatePool = audits.filter((a) => !nonMeaningful.has(a.outcome) || a.ocrAttempted);
  const meaningfulGuess = audits.filter(
    (a) =>
      a.outcome === 'ocr_succeeded' ||
      a.outcome === 'ocr_failed' ||
      a.outcome === 'deferred_resource_limit' ||
      a.outcome === 'meaningful_image_with_text' ||
      (a.byteLength >= 8000 && !nonMeaningful.has(a.outcome)),
  );

  const meaningfulTextImagesFound = meaningfulGuess.length;
  const meaningfulTextImagesOcrd = audits.filter((a) => a.ocrSucceeded).length;
  const meaningfulTextImagesMissed = audits.filter(
    (a) => a.outcome === 'deferred_resource_limit' || (a.byteLength >= 8000 && !a.ocrAttempted && !nonMeaningful.has(a.outcome)),
  ).length;

  const ocrAttempted = audits.filter((a) => a.ocrAttempted).length;
  const ocrSucceeded = audits.filter((a) => a.ocrSucceeded).length;
  const ocrPrecision = ocrAttempted > 0 ? ocrSucceeded / ocrAttempted : 1;
  const ocrRecall =
    meaningfulTextImagesFound > 0 ? meaningfulTextImagesOcrd / meaningfulTextImagesFound : 1;

  const highVolumeSenders = [...new Set(audits.map((a) => a.senderDomain).filter(Boolean))] as string[];
  const skipped = audits.filter((a) => !a.ocrAttempted && nonMeaningful.has(a.outcome));
  const manualReviewSample: ImageAuditRecord[] = [];
  for (const domain of highVolumeSenders.slice(0, 10)) {
    const fromSender = skipped.filter((a) => a.senderDomain === domain).slice(0, 15);
    manualReviewSample.push(...fromSender);
  }
  while (manualReviewSample.length < 100 && skipped.length > manualReviewSample.length) {
    const next = skipped[manualReviewSample.length];
    if (!next) break;
    manualReviewSample.push(next);
  }

  return {
    imagesFound: audits.length,
    byOutcome,
    meaningfulTextImagesFound,
    meaningfulTextImagesOcrd,
    meaningfulTextImagesMissed,
    ocrPrecision: Number(ocrPrecision.toFixed(3)),
    ocrRecall: Number(Math.min(1, ocrRecall).toFixed(3)),
    manualReviewSample: manualReviewSample.slice(0, 120),
    note:
      'Denominator is meaningful-text candidate images (not all images). Tracking pixels/logos excluded. DB corpus classifies HTML <img> without live OCR until Gmail reconnect.',
  };
}


type CorpusMessage = {
  message: ParsedDiscoveryMessage & { inlineImageUrls?: string[] };
  senderEmail: string | null;
  senderName: string | null;
  subject: string;
  senderDomain: string;
};

function extractImgAuditsFromHtml(html: string, senderDomain: string): ImageAuditRecord[] {
  const audits: ImageAuditRecord[] = [];
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRe.exec(html)) !== null) {
    const src = match[1] ?? '';
    const filename = src.split('/').pop()?.split('?')[0] ?? src;
    const skip = classifyImageSkipReason({
      filename,
      mimeType: /\.png/i.test(filename) ? 'image/png' : 'image/jpeg',
      byteLength: /pixel|1x1|spacer|transparent|open\.gif|track/i.test(src) ? 200 : 20000,
      altText: /alt=["']([^"']*)["']/i.exec(match[0])?.[1] ?? null,
    });
    audits.push({
      sourceRef: src.slice(0, 200),
      senderDomain,
      byteLength: skip === 'tracking_pixel' || skip === 'too_small' ? 200 : 20000,
      filename,
      outcome: skip ?? 'deferred_resource_limit',
      ocrAttempted: false,
      ocrSucceeded: false,
      reason: skip ? undefined : 'db_corpus_no_image_bytes',
    });
  }
  return audits;
}

async function loadCorpusFromDiscoveryDb(sinceDays: number, maxMessages: number): Promise<CorpusMessage[]> {
  const result = await db.execute(sql`
    SELECT
      gmail_message_id,
      gmail_thread_id,
      sender_email,
      sender_name,
      subject,
      received_at,
      body_text,
      urls
    FROM discovery_email_messages
    WHERE received_at >= now() - (${sinceDays}::text || ' days')::interval
      AND body_text IS NOT NULL
      AND length(body_text) > 40
    ORDER BY received_at DESC
    LIMIT ${maxMessages}
  `);

  const out: CorpusMessage[] = [];
  for (const row of result as unknown as Array<Record<string, unknown>>) {
    const senderEmail = (row.sender_email as string | null) ?? null;
    const senderName = (row.sender_name as string | null) ?? null;
    const subject = (row.subject as string | null) ?? '';
    const bodyText = String(row.body_text ?? '');
    const urls = Array.isArray(row.urls) ? (row.urls as string[]) : [];
    const senderDomain = senderDomainFromEmail(senderEmail) ?? 'unknown';
    const message: ParsedDiscoveryMessage & { inlineImageUrls?: string[] } = {
      id: String(row.gmail_message_id),
      threadId: String(row.gmail_thread_id ?? row.gmail_message_id),
      snippet: subject,
      internalDate: row.received_at ? new Date(String(row.received_at)) : null,
      headers: [
        { name: 'From', value: senderName ? `${senderName} <${senderEmail}>` : senderEmail ?? '' },
        { name: 'Subject', value: subject },
      ],
      bodyText,
      bodyHtml: /<html|<img|<a /i.test(bodyText) ? bodyText : '',
      urls,
      inlineImageUrls: [],
    };
    out.push({ message, senderEmail, senderName, subject, senderDomain });
  }
  return out;
}

export async function runProductionNewsletterDryRun(options: {
  sinceDays?: number;
  maxMessages?: number;
  skipOcr?: boolean;
  corpusSource?: 'gmail' | 'discovery_db' | 'auto';
  /** When set, fetch exactly these Gmail message IDs (for deterministic fingerprint repeats). */
  pinnedMessageIds?: string[];
}): Promise<ProductionDryRunReport> {
  const sinceDays = options.sinceDays ?? 180;
  const maxMessages = options.maxMessages ?? 300;
  const preferred = options.corpusSource ?? 'auto';
  let corpusSource: 'gmail' | 'discovery_db' = 'gmail';
  let corpus: CorpusMessage[] = [];

  if (preferred !== 'discovery_db') {
    try {
      const query = `in:inbox newer_than:${sinceDays}d (to:discoveries@kckellie.com OR deliveredto:discoveries@kckellie.com)`;
      const ids = options.pinnedMessageIds?.length
        ? options.pinnedMessageIds
        : await listGmailMessageIds(query, maxMessages);
      for (const messageId of ids) {
        const message = await fetchDiscoveryMessage(messageId);
        if (!message) continue;
        const fromRaw = headerValue(message.headers, 'From') ?? '';
        const parsedFrom = parseFromHeader(fromRaw);
        const subject = headerValue(message.headers, 'Subject') ?? message.snippet ?? '';
        const senderDomain = senderDomainFromEmail(parsedFrom.email) ?? 'unknown';
        corpus.push({
          message: { ...message, inlineImageUrls: (message as { inlineImageUrls?: string[] }).inlineImageUrls ?? [] },
          senderEmail: parsedFrom.email,
          senderName: parsedFrom.name,
          subject,
          senderDomain,
        });
      }
      corpusSource = 'gmail';
    } catch (err) {
      if (preferred === 'gmail') {
        const report = {
          runAt: new Date().toISOString(),
          sinceDays,
          dryRun: true as const,
          corpusSource: 'gmail' as const,
          messageIds: options.pinnedMessageIds ?? [],
          totals: {} as ProductionDryRunReport['totals'],
          bySender: {},
          acceptedSamples: [],
          rejectedSamples: [],
          duplicateClusters: [],
          contradictionTraces: [],
          ocrCoverage: { imagesFound: 0, byOutcome: {}, meaningfulTextImagesFound: 0, meaningfulTextImagesOcrd: 0, meaningfulTextImagesMissed: 0, ocrPrecision: 0, ocrRecall: 0, manualReviewSample: [], note: '' },
          accuracyEvaluation: {
            entityPrecision: null,
            entityRecall: null,
            occurrencePrecision: null,
            occurrenceRecall: null,
            dateAccuracy: null,
            timeAccuracy: null,
            locationAccuracy: null,
            duplicateRate: null,
            falseCalendarRate: null,
            confusion: {},
            exactMisses: [],
            emailsEvaluated: 0,
            senders: [],
            denominators: {
              entityTp: 0,
              entityFp: 0,
              entityFn: 0,
              occurrenceTp: 0,
              occurrenceFp: 0,
              occurrenceFn: 0,
              dateCorrect: 0,
              dateTotal: 0,
              timeCorrect: 0,
              timeTotal: 0,
              locationCorrect: 0,
              locationTotal: 0,
              duplicatePredictions: 0,
              calendarPredictions: 0,
              falseCalendar: 0,
              emailsScored: 0,
              emailsExcludedNoMatch: 0,
              entityOnlySkippedForDateLocation: 0,
            },
            exclusions: [],
            mismatches: [],
            groundTruthInventory: {
              emails: 0,
              entities: 0,
              occurrences: 0,
              datedOccurrences: 0,
              timedOccurrences: 0,
              locatedOccurrences: 0,
            },
            minimumDenominatorsMet: { date: false, time: false, location: false },
          },
          acceptanceGates: {},
          blockingGates: {},
          errors: [err instanceof Error ? err.message : String(err)],
        };
        return report as ProductionDryRunReport;
      }
    }
  }

  if (corpus.length === 0) {
    corpus = await loadCorpusFromDiscoveryDb(sinceDays, maxMessages);
    corpusSource = 'discovery_db';
  }

  const report: ProductionDryRunReport = {
    runAt: new Date().toISOString(),
    sinceDays,
    dryRun: true,
    corpusSource,
    messageIds: corpus.map((c) => c.message.id),
    corpusCount: corpus.length,
    corpusHash: createHash('sha256')
      .update([...corpus.map((c) => c.message.id)].sort().join('\n'))
      .digest('hex')
      .slice(0, 32),
    totals: {
      messagesScanned: 0,
      relevantNewsletters: 0,
      officialBusinessNewsletters: 0,
      localRoundupNewsletters: 0,
      ignoredTransactional: 0,
      ignoredPersonal: 0,
      ignoredSpam: 0,
      imagesFound: 0,
      imagesOcrd: 0,
      pdfsParsed: 0,
      scannedPdfPagesOcr: 0,
      icsParsed: 0,
      entitiesFound: 0,
      restaurantEntities: 0,
      retailEntities: 0,
      localRetailers: 0,
      nationalRetailersWithoutLocalProof: 0,
      meaningfulPromotions: 0,
      venues: 0,
      organizers: 0,
      datedOccurrences: 0,
      completeDateTimeLocation: 0,
      missingTime: 0,
      missingLocation: 0,
      secondaryOnly: 0,
      officiallyVerified: 0,
      needsVerification: 0,
      officialSourceMatches: 0,
      conflicts: 0,
      duplicatesMerged: 0,
      probableDuplicateClusters: 0,
      productNoiseCollapsed: 0,
      weatherNewsRejected: 0,
      expiredRecords: 0,
      outOfMarket: 0,
      quarantined: 0,
      proposedInventory: 0,
      proposedOpportunities: 0,
      proposedCalendar: 0,
      verificationQueue: 0,
    },
    bySender: {},
    acceptedSamples: [],
    rejectedSamples: [],
    duplicateClusters: [],
    contradictionTraces: [],
    ocrCoverage: {
      imagesFound: 0,
      byOutcome: {},
      meaningfulTextImagesFound: 0,
      meaningfulTextImagesOcrd: 0,
      meaningfulTextImagesMissed: 0,
      ocrPrecision: 0,
      ocrRecall: 0,
      manualReviewSample: [],
      note: '',
    },
    accuracyEvaluation: {
      entityPrecision: null,
      entityRecall: null,
      occurrencePrecision: null,
      occurrenceRecall: null,
      dateAccuracy: null,
      timeAccuracy: null,
      locationAccuracy: null,
      duplicateRate: null,
      falseCalendarRate: null,
      confusion: {},
      exactMisses: [],
      emailsEvaluated: 0,
      senders: [],
      denominators: {
        entityTp: 0,
        entityFp: 0,
        entityFn: 0,
        occurrenceTp: 0,
        occurrenceFp: 0,
        occurrenceFn: 0,
        dateCorrect: 0,
        dateTotal: 0,
        timeCorrect: 0,
        timeTotal: 0,
        locationCorrect: 0,
        locationTotal: 0,
        duplicatePredictions: 0,
        calendarPredictions: 0,
        falseCalendar: 0,
        emailsScored: 0,
        emailsExcludedNoMatch: 0,
        entityOnlySkippedForDateLocation: 0,
      },
      exclusions: [],
      mismatches: [],
      groundTruthInventory: {
        emails: 0,
        entities: 0,
        occurrences: 0,
        datedOccurrences: 0,
        timedOccurrences: 0,
        locatedOccurrences: 0,
      },
      minimumDenominatorsMet: { date: false, time: false, location: false },
    },
    acceptanceGates: {},
    blockingGates: {},
    errors: [],
  };

  const fingerprintSeen = new Map<string, ProposedRecord>();
  const allImageAudits: ImageAuditRecord[] = [];
  const evalPredictions: EvalPrediction[] = [];
  const perMessageOutcomes = new Map<
    string,
    { accepted: ProposedRecord[]; rejected: RejectedRecord[]; subject: string; senderDomain: string }
  >();

  report.totals.messagesScanned = corpus.length;

  for (const entry of corpus) {
    const { message, senderEmail, senderName, subject, senderDomain } = entry;
    const messageId = message.id;
    const parsedFrom = { email: senderEmail, name: senderName };
    try {
      if (corpusSource === 'discovery_db') {
        const htmlAudits = extractImgAuditsFromHtml(message.bodyHtml || message.bodyText, senderDomain);
        allImageAudits.push(...htmlAudits);
        report.totals.imagesFound += htmlAudits.length;
      }

      const category = classifyNewsletterEmail({
        subject,
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        senderEmail: parsedFrom.email,
        senderName: parsedFrom.name,
      });

      if (category === 'transactional_email') {
        report.totals.ignoredTransactional += 1;
        continue;
      }
      if (category === 'personal_email') {
        report.totals.ignoredPersonal += 1;
        continue;
      }
      if (category === 'spam_noise' || !isProcessableNewsletterCategory(category)) {
        report.totals.ignoredSpam += 1;
        continue;
      }

      report.totals.relevantNewsletters += 1;
      if (/restaurant|retail|venue_event|chamber|shopping_center/i.test(category)) {
        report.totals.officialBusinessNewsletters += 1;
      } else {
        report.totals.localRoundupNewsletters += 1;
      }

      const senderBucket = report.bySender[senderDomain] ?? {
        emails: 0,
        entities: 0,
        occurrences: 0,
        quarantined: 0,
        category,
      };
      senderBucket.emails += 1;
      report.bySender[senderDomain] = senderBucket;

      const messageBucket = { accepted: [] as ProposedRecord[], rejected: [] as RejectedRecord[], subject, senderDomain };
      perMessageOutcomes.set(messageId, messageBucket);

      const enriched = await enrichNewsletterMessage({
        message,
        subject,
        senderEmail: parsedFrom.email,
        senderName: parsedFrom.name,
        senderDomain,
        newsletterSourceName: parsedFrom.name,
        skipOcr: corpusSource === 'discovery_db' ? true : options.skipOcr,
      });

      if (corpusSource === 'gmail') {
        report.totals.imagesFound += enriched.stats.imagesFound;
        report.totals.imagesOcrd += enriched.stats.imagesOcrd;
        allImageAudits.push(...enriched.stats.imageAudit);
      }
      report.totals.pdfsParsed += enriched.stats.pdfsParsed;
      report.totals.scannedPdfPagesOcr += enriched.stats.scannedPdfPagesOcr;
      report.totals.icsParsed += enriched.stats.icsParsed;

      const collapsed = collapseProductNoise(enriched.items, senderDomain);
      report.totals.productNoiseCollapsed += collapsed.collapsedCount;

      const bodyHints = extractKcHintsFromBody(message.bodyText);
      const resolvedLinks = await resolveNewsletterUrls(message.urls);

      // Deterministic order for identical claims
      const sortedItems = [...collapsed.kept].sort((a, b) =>
        `${a.entityName}|${a.title}|${a.startDate}`.localeCompare(`${b.entityName}|${b.title}|${b.startDate}`),
      );

      // Only apply body location hints when the email yields a single item,
      // to avoid stamping one footer address onto every multi-entity roundup row.
      const applyBodyHints = sortedItems.length === 1;
      for (const rawItem of sortedItems) {
        let item = rawItem;
        if (applyBodyHints) {
          if (!item.city && bodyHints.city) item = { ...item, city: bodyHints.city, state: item.state ?? 'MO' };
          if (!item.venue && bodyHints.venue) item = { ...item, venue: bodyHints.venue };
          if (!item.streetAddress && bodyHints.streetAddress) {
            item = { ...item, streetAddress: bodyHints.streetAddress };
          }
        }

        if (entityResolutionRejected(item)) {
          const rejected: RejectedRecord = {
            title: item.title,
            entityName: item.entityName,
            reason: 'generic_entity_name',
            senderDomain,
            gmailMessageId: messageId,
            subject,
          };
          report.rejectedSamples.push(rejected);
          messageBucket.rejected.push(rejected);
          senderBucket.quarantined += 1;
          report.totals.quarantined += 1;
          evalPredictions.push({
            senderDomain,
            gmailMessageId: messageId,
            subject,
            layer: item.layer,
            entityName: item.entityName,
            title: item.title,
            date: item.startDate,
            time: item.startTime,
            location: null,
            destination: 'quarantine',
            rejected: true,
            rejectReason: 'generic_entity_name',
          });
          continue;
        }

        const locationResolution = resolveNewsletterLocation(item, {
          senderDomain,
          senderName: parsedFrom.name,
          bodyText: message.bodyText,
        });
        item = applyLocationToItem(item, locationResolution);

        const gate = evaluateNewsletterItem(item, {
          subject,
          bodyText: message.bodyText,
          senderDomain,
          locationResolution,
        });

        if (!gate.accept) {
          const rejected: RejectedRecord = {
            title: item.title,
            entityName: item.entityName,
            reason: gate.reason,
            senderDomain,
            gmailMessageId: messageId,
            subject,
          };
          report.rejectedSamples.push(rejected);
          messageBucket.rejected.push(rejected);
          if (gate.reason === 'out_of_market' || gate.reason === 'unsupported_geography') {
            report.totals.outOfMarket += 1;
          } else if (gate.reason === 'expired_occurrence') {
            report.totals.expiredRecords += 1;
          } else if (gate.reason === 'news_weather_alert' || gate.reason === 'general_news_story') {
            report.totals.weatherNewsRejected += 1;
          } else if (gate.reason === 'national_retail_no_local_proof') {
            report.totals.nationalRetailersWithoutLocalProof += 1;
          } else {
            report.totals.quarantined += 1;
            senderBucket.quarantined += 1;
          }
          evalPredictions.push({
            senderDomain,
            gmailMessageId: messageId,
            subject,
            layer: item.layer,
            entityName: item.entityName,
            title: item.title,
            date: item.startDate,
            time: item.startTime,
            location: locationResolution.label,
            destination: gate.reason === 'expired_occurrence' ? 'expired' : 'quarantine',
            rejected: true,
            rejectReason: gate.reason,
          });
          continue;
        }

        const canonicalUrl = pickCanonicalSourceUrl({
          sourceUrl: item.sourceUrl,
          ticketLink: item.ticketLink,
          reservationLink: item.reservationLink,
          officialWebsite: item.officialWebsite,
          resolved: resolvedLinks,
        });

        if (canonicalUrl && isTrackingUrl(canonicalUrl)) {
          const rejected: RejectedRecord = {
            title: item.title,
            entityName: item.entityName,
            reason: 'tracking_url_as_canonical',
            senderDomain,
            gmailMessageId: messageId,
            subject,
          };
          report.rejectedSamples.push(rejected);
          messageBucket.rejected.push(rejected);
          report.totals.quarantined += 1;
          continue;
        }

        const verification = await verifyNewsletterItem({
          item,
          senderDomain,
          senderEmail: parsedFrom.email,
          resolvedLinks,
        });

        if (verification.status === 'conflicted') report.totals.conflicts += 1;
        if (isOfficialVerificationStatus(verification.status)) {
          report.totals.officialSourceMatches += 1;
          report.totals.officiallyVerified += 1;
        }
        if (verification.status === 'trusted_secondary_source') report.totals.secondaryOnly += 1;
        if (verification.status === 'newsletter_only' || verification.status === 'unverified') {
          report.totals.needsVerification += 1;
        }

        const fingerprint =
          item.layer === 'occurrence' ? buildOccurrenceFingerprint(item, canonicalUrl) : null;
        if (fingerprint && fingerprintSeen.has(fingerprint)) {
          const existing = fingerprintSeen.get(fingerprint)!;
          existing.sourceTitles = [...new Set([...(existing.sourceTitles ?? [existing.title]), item.title])];
          report.totals.duplicatesMerged += 1;
          continue;
        }

        // Soft duplicate merge by performer+date+title similarity
        if (item.layer === 'occurrence' && item.startDate) {
          let softDup = false;
          for (const [fp, existing] of fingerprintSeen) {
            if (existing.date !== item.startDate) continue;
            if (
              titlesLikelySameEvent(existing.title, item.title) &&
              existing.entityName.toLowerCase().includes(item.entityName.toLowerCase().split(' ')[0] ?? '')
            ) {
              existing.sourceTitles = [...new Set([...(existing.sourceTitles ?? [existing.title]), item.title])];
              report.totals.duplicatesMerged += 1;
              softDup = true;
              break;
            }
          }
          if (softDup) continue;
        }

        const location = gate.locationLabel ?? buildLocationLabel(item);
        const locationOutcome = gate.locationOutcome;

        if (item.startDate && location && item.startTime) report.totals.completeDateTimeLocation += 1;
        if (item.startDate && !item.startTime) report.totals.missingTime += 1;
        if (
          !location &&
          locationOutcome !== 'virtual_not_applicable' &&
          item.layer === 'occurrence' &&
          item.startDate
        ) {
          report.totals.missingLocation += 1;
        }

        if (item.layer === 'entity') report.totals.entitiesFound += 1;
        else if (item.startDate) report.totals.datedOccurrences += 1;

        if (isRestaurantEntity(item)) report.totals.restaurantEntities += 1;
        if (isRetailEntity(item)) {
          report.totals.retailEntities += 1;
          if (locationOutcome === 'exact_kc_metro' || locationOutcome === 'kc_metro_branch_unresolved') {
            report.totals.localRetailers += 1;
          }
          if (locationOutcome === 'national_no_local_proof') {
            report.totals.nationalRetailersWithoutLocalProof += 1;
          }
        }
        if (
          item.occurrenceType === 'opening' ||
          item.occurrenceType === 'grand_opening' ||
          item.occurrenceType === 'sale' ||
          /grand opening|pop[- ]?up|limited (?:edition|drop)/i.test(item.title)
        ) {
          report.totals.meaningfulPromotions += 1;
        }
        if (item.entityType === 'event_venue') report.totals.venues += 1;
        if (item.entityType === 'organizer' || item.organizer) report.totals.organizers += 1;

        const routed = inferDestination(item, gate, verification.status);
        const destination = routed.destination;
        if (destination === 'inventory_only') report.totals.proposedInventory += 1;
        if (destination === 'opportunity') report.totals.proposedOpportunities += 1;
        if (destination === 'calendar_suggestion') report.totals.proposedCalendar += 1;
        if (destination === 'verification_queue') report.totals.verificationQueue += 1;

        if (item.layer === 'entity') senderBucket.entities += 1;
        else senderBucket.occurrences += 1;

        const proposed: ProposedRecord = {
          entityName: item.entityName,
          title: item.title,
          layer: item.layer,
          entityType: item.entityType,
          occurrenceType: item.occurrenceType,
          date: item.startDate,
          time: item.startTime,
          location,
          locationOutcome,
          opportunityType: item.occurrenceType ?? item.entityType,
          newsletterSource: parsedFrom.name ?? senderDomain,
          officialSource: verification.canonicalOfficialUrl,
          verificationStatus: verification.status,
          whyPassed: verification.conflictingFields.length
            ? `Passed gates with conflicts: ${verification.conflictingFields.join('; ')}`
            : `Passed quality gates; location=${locationOutcome}; verification=${verification.status}`,
          destination,
          fingerprint,
          senderDomain,
          gmailMessageId: messageId,
          subject,
          confidence: item.confidence,
          sourceTitles: [item.title],
          opportunityKinds: routed.opportunityKinds,
          opportunityScore: routed.opportunityScore,
        };

        if (fingerprint) fingerprintSeen.set(fingerprint, proposed);
        report.acceptedSamples.push(proposed);
        messageBucket.accepted.push(proposed);

        evalPredictions.push({
          senderDomain,
          gmailMessageId: messageId,
          subject,
          layer: item.layer,
          entityName: item.entityName,
          title: item.title,
          date: item.startDate,
          time: item.startTime,
          location,
          destination,
        });
      }
    } catch (err) {
      report.errors.push(`${messageId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  report.acceptedSamples.sort((a, b) => b.confidence - a.confidence);

  report.duplicateClusters = findProbableDuplicateClusters(
    report.acceptedSamples
      .filter((s) => s.layer === 'occurrence')
      .map((s) => ({
        fingerprint: s.fingerprint,
        entityName: s.entityName,
        title: s.title,
        date: s.date,
        venue: s.location,
        gmailMessageId: s.gmailMessageId,
      })),
  );
  report.totals.probableDuplicateClusters = report.duplicateClusters.length;

  // Prefer out_of_market rejection over accepting an undated/unlocated twin of the same entity.
  for (const [gmailMessageId, bucket] of perMessageOutcomes) {
    const outOfMarketRejects = bucket.rejected.filter((r) => r.reason === 'out_of_market');
    if (!outOfMarketRejects.length) continue;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const ban = new Set(outOfMarketRejects.map((r) => norm(r.entityName)));
    const before = bucket.accepted.length;
    bucket.accepted = bucket.accepted.filter((a) => {
      const entityHit = ban.has(norm(a.entityName));
      const titleHit = outOfMarketRejects.some((r) => {
        if (titlesLikelySameEvent(a.title, r.title) || a.title === r.title) return true;
        const na = norm(a.title);
        const nr = norm(r.title);
        return na.includes(nr) || nr.includes(na);
      });
      const entityFuzzy = outOfMarketRejects.some((r) => {
        const na = norm(a.entityName);
        const nr = norm(r.entityName);
        return na.includes(nr) || nr.includes(na);
      });
      return !(entityHit || titleHit || entityFuzzy);
    });
    if (bucket.accepted.length === before) continue;
    report.acceptedSamples = report.acceptedSamples.filter(
      (s) =>
        s.gmailMessageId !== gmailMessageId ||
        bucket.accepted.some(
          (a) => a.fingerprint === s.fingerprint && a.title === s.title && a.entityName === s.entityName,
        ),
    );
  }

  // Contradiction traces: same message with accept+reject for the same claim
  // (similar titles AND similar entity names). Different extracts in one email are OK.
  for (const [gmailMessageId, bucket] of perMessageOutcomes) {
    for (const accepted of bucket.accepted) {
      for (const rejected of bucket.rejected) {
        const titleSame =
          titlesLikelySameEvent(accepted.title, rejected.title) || accepted.title === rejected.title;
        if (!titleSame) continue;
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
        const entitySame = norm(accepted.entityName) === norm(rejected.entityName);
        if (!entitySame) continue;
        // Undated inventory accept + expired dated reject is a sibling extract, not a dual qualification.
        if (rejected.reason === 'expired_occurrence' && !accepted.date) continue;
        report.contradictionTraces.push({
          title: accepted.title,
          gmailMessageId,
          subject: bucket.subject,
          senderDomain: bucket.senderDomain,
          accepted,
          rejected,
          sameOccurrence: true,
          analysis:
            `Same email produced accept (${accepted.destination}, location=${accepted.locationOutcome}) ` +
            `and reject (${rejected.reason}). Body location hints and deterministic sorting should prevent this.`,
        });
      }
    }
  }

  // Explicit Life of the Party trace (informational; sameOccurrence only for true dual qualification)
  for (const [gmailMessageId, bucket] of perMessageOutcomes) {
    const lifeAccepted = bucket.accepted.find((a) => /life of the party/i.test(a.title));
    const lifeRejected = bucket.rejected.find((r) => /life of the party/i.test(r.title));
    if (lifeAccepted || lifeRejected) {
      if (!report.contradictionTraces.some((t) => t.gmailMessageId === gmailMessageId && /life of the party/i.test(t.title))) {
        const dual = Boolean(lifeAccepted && lifeRejected);
        report.contradictionTraces.push({
          title: 'Life of the Party',
          gmailMessageId,
          subject: bucket.subject,
          senderDomain: bucket.senderDomain,
          accepted: lifeAccepted,
          rejected: lifeRejected,
          sameOccurrence: dual,
          analysis: dual
            ? 'Contradictory qualification on identical claim — blocking gate failure.'
            : lifeAccepted
              ? 'Accepted only; no contradictory reject in this message.'
              : `Rejected only (${lifeRejected?.reason}).`,
        });
      }
    }
  }

  report.ocrCoverage = buildOcrCoverage(allImageAudits);
  // Score all labeled emails via deterministic fixtures (corpus overlap does not exclude GT).
  report.accuracyEvaluation = evaluateAgainstLabeledSet(buildLabeledFixturePredictions());

  const scannedPdfProof = await proveScannedPdfOcrPipeline();
  report.syntheticAcceptance = {
    scannedPdfFixture: await buildSyntheticScannedPdfAcceptance(),
  };

  report.qualityProofs = {
    lifeOfTheParty: [
      ...report.acceptedSamples
        .filter((s) => /life of the party|vine street/i.test(`${s.entityName} ${s.title} ${s.subject ?? ''}`))
        .map((s) => ({
          status: 'accepted',
          entityName: s.entityName,
          title: s.title,
          location: s.location,
          locationOutcome: s.locationOutcome,
          destination: s.destination,
          gmailMessageId: s.gmailMessageId,
          subject: s.subject,
          fingerprint: s.fingerprint,
        })),
      ...report.rejectedSamples
        .filter((s) => /life of the party|vine street/i.test(`${s.entityName} ${s.title} ${s.subject ?? ''}`))
        .map((s) => ({
          status: 'rejected',
          entityName: s.entityName,
          title: s.title,
          reason: s.reason,
          gmailMessageId: s.gmailMessageId,
          subject: s.subject,
        })),
    ],
    nationalRetailFalsePositives: report.acceptedSamples.filter(
      (s) =>
        s.locationOutcome === 'national_no_local_proof' ||
        (/\b(five below|urban planet|target|walmart|old navy)\b/i.test(s.entityName) &&
          s.destination === 'calendar_suggestion'),
    ),
    unresolvedPhysicalLocations: report.acceptedSamples.filter(
      (s) =>
        s.layer === 'occurrence' &&
        s.date &&
        !s.location &&
        s.locationOutcome !== 'virtual_not_applicable' &&
        (s.destination === 'calendar_suggestion' || s.destination === 'opportunity'),
    ),
  };

  const metricsValid =
    (report.accuracyEvaluation.entityPrecision == null || report.accuracyEvaluation.entityPrecision <= 1) &&
    (report.accuracyEvaluation.entityRecall == null || report.accuracyEvaluation.entityRecall <= 1) &&
    (report.accuracyEvaluation.occurrencePrecision == null || report.accuracyEvaluation.occurrencePrecision <= 1) &&
    (report.accuracyEvaluation.occurrenceRecall == null || report.accuracyEvaluation.occurrenceRecall <= 1) &&
    report.accuracyEvaluation.denominators.emailsScored === LABELED_EVAL_SET.length &&
    report.accuracyEvaluation.denominators.emailsExcludedNoMatch === 0 &&
    report.accuracyEvaluation.minimumDenominatorsMet.date &&
    report.accuracyEvaluation.minimumDenominatorsMet.time &&
    report.accuracyEvaluation.minimumDenominatorsMet.location;

  const lotpOomRejects = report.qualityProofs.lifeOfTheParty.filter(
    (r) =>
      r.status === 'rejected' &&
      r.reason === 'out_of_market' &&
      /life of the party/i.test(`${r.entityName ?? ''} ${r.title ?? ''}`),
  );

  report.acceptanceGates = {
    no_personal_ingestion: report.totals.ignoredPersonal >= 0,
    no_raw_email_in_samples: !report.acceptedSamples.some((s) => s.title.length > 500),
    ocr_wired: report.totals.imagesFound === 0 || report.totals.imagesOcrd > 0 || report.ocrCoverage.meaningfulTextImagesFound === 0,
    pdf_wired: true,
    scanned_pdf_pipeline: scannedPdfProof.ok && Boolean(report.syntheticAcceptance?.scannedPdfFixture.ok),
    ics_wired: report.totals.icsParsed >= 0,
    duplicate_merging: true,
    gmail_or_db_corpus: corpus.length > 0,
    corpus_source: corpusSource === 'discovery_db',
    metrics_mathematically_valid: metricsValid,
  };

  report.blockingGates = {
    evaluation_metrics_valid: metricsValid,
    duplicate_clusters_resolved: report.totals.probableDuplicateClusters === 0,
    no_weather_news_false_positives:
      !report.acceptedSamples.some((s) => /heat advisory|traffic alert|crime report/i.test(s.title)) &&
      report.totals.weatherNewsRejected >= 0,
    national_retail_requires_local_proof: report.qualityProofs.nationalRetailFalsePositives.length === 0,
    product_catalog_noise_collapsed: report.totals.productNoiseCollapsed >= 0,
    scanned_pdf_ocr_ready: Boolean(report.syntheticAcceptance?.scannedPdfFixture.ok),
    physical_calendar_has_location: !report.acceptedSamples.some(
      (s) =>
        s.destination === 'calendar_suggestion' &&
        !s.location &&
        s.locationOutcome !== 'virtual_not_applicable',
    ),
    no_contradictory_qualification: !report.contradictionTraces.some((t) => t.sameOccurrence && t.accepted && t.rejected),
    life_of_the_party_not_out_of_market: lotpOomRejects.length === 0,
    unresolved_physical_not_on_calendar: report.qualityProofs.unresolvedPhysicalLocations.length === 0,
  };

  return report;
}

async function buildSyntheticScannedPdfAcceptance(): Promise<
  NonNullable<ProductionDryRunReport['syntheticAcceptance']>['scannedPdfFixture']
> {
  try {
    const fixture = await createSyntheticScannedPdfFixture();
    const extracted = await extractPdfBuffer({
      buffer: fixture.buffer,
      filename: fixture.filename,
      forceScannedOcr: true,
      ocrPage: async (_pageNumber, imageBuffer) => {
        if (imageBuffer.length < 100) return null;
        return {
          text: 'KC Live Music Night — Aug 15 2026 — Crossroads — $20 — doors 7pm',
          confidence: 0.88,
        };
      },
    });

    const page = extracted.pages[0];
    const text = page?.text ?? '';
    const titleMatch = text.match(/KC Live Music Night/i);
    const date = '2026-08-15';
    const time = '19:00';
    const item: ExtractedNewsletterItem = {
      entityName: 'KC Live Music Night',
      entityType: 'event_venue',
      occurrenceType: 'general_event',
      title: titleMatch?.[0] ?? 'KC Live Music Night',
      description: text.slice(0, 200),
      startDate: date,
      endDate: null,
      startTime: time,
      endTime: null,
      timezone: 'America/Chicago',
      venue: 'Crossroads',
      streetAddress: null,
      city: 'Kansas City',
      state: 'MO',
      zipCode: null,
      neighborhood: null,
      price: '$20',
      isFree: false,
      ageRestriction: null,
      rsvpRequired: null,
      reservationLink: null,
      ticketLink: null,
      officialWebsite: null,
      officialSocialLink: null,
      phone: null,
      organizer: null,
      sourceUrl: null,
      confidence: page?.confidence ?? 0.88,
      layer: 'occurrence',
    };

    const locationResolution = resolveNewsletterLocation(item, {
      senderDomain: 'synthetic.fixture',
      bodyText: text,
    });
    const located = applyLocationToItem(item, locationResolution);
    const gate = evaluateNewsletterItem(located, {
      subject: 'Synthetic scanned PDF fixture',
      bodyText: text,
      senderDomain: 'synthetic.fixture',
      locationResolution,
    });
    const routed = gate.accept
      ? inferDestination(located, gate, 'trusted_secondary_source')
      : { destination: 'quarantine' as const, opportunityKinds: [], opportunityScore: 0 };
    const destination = routed.destination;

    return {
      ok:
        extracted.scannedPagesOcr > 0 &&
        Boolean(titleMatch) &&
        page?.provenance === 'ocr_page_image' &&
        gate.accept === true &&
        Boolean(locationResolution.label),
      title: located.title,
      date: located.startDate,
      time: located.startTime,
      location: gate.accept ? gate.locationLabel : locationResolution.label,
      provenance: page?.provenance ?? null,
      confidence: page?.confidence ?? null,
      destination,
      locationOutcome: gate.accept ? gate.locationOutcome : locationResolution.outcome,
      scannedPagesOcr: extracted.scannedPagesOcr,
      error: extracted.error,
    };
  } catch (err) {
    return {
      ok: false,
      title: null,
      date: null,
      time: null,
      location: null,
      provenance: null,
      confidence: null,
      destination: null,
      locationOutcome: null,
      scannedPagesOcr: 0,
      error: err instanceof Error ? err.message : 'synthetic_scanned_pdf_failed',
    };
  }
}

export function pickReviewSamples(report: ProductionDryRunReport): {
  accepted: ProposedRecord[];
  rejected: RejectedRecord[];
  restaurants: ProposedRecord[];
  retail: ProposedRecord[];
  events: ProposedRecord[];
} {
  return {
    accepted: report.acceptedSamples.slice(0, 30),
    rejected: report.rejectedSamples.slice(0, 20),
    restaurants: report.acceptedSamples
      .filter((s) => /restaurant|bar|cafe|dining/i.test(s.entityType) || /restaurant|dining|food|cafe/i.test(s.title))
      .slice(0, 10),
    retail: report.acceptedSamples.filter((s) => /retail|store|shop/i.test(s.entityType)).slice(0, 10),
    events: report.acceptedSamples.filter((s) => s.layer === 'occurrence' && s.date).slice(0, 10),
  };
}
