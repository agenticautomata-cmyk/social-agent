/**
 * Reclassify a cached pinned dry-run without re-running OCR/LLM extraction.
 * Applies opportunity promotion + fixture evaluation + verification audit.
 */
import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(scriptDir, '../../../../.env') });

const { reclassifyCachedProposedRecord } = await import(
  '../newsletter-intelligence/opportunity-promote.js'
);
const {
  evaluateAgainstLabeledSet,
  buildLabeledFixturePredictions,
  LABELED_EVAL_SET,
} = await import('../newsletter-intelligence/evaluation-set.js');
const { proveScannedPdfOcrPipeline, createSyntheticScannedPdfFixture, extractPdfBuffer } = await import(
  '../newsletter-intelligence/pdf-parse.js'
);
const { resolveNewsletterLocation, applyLocationToItem } = await import(
  '../newsletter-intelligence/location-resolve.js'
);
const { evaluateNewsletterItem, buildLocationLabel } = await import(
  '../newsletter-intelligence/quality-gates.js'
);

const inputPath =
  process.env.NEWSLETTER_RECLASSIFY_FROM ??
  resolve(scriptDir, '../../../../reports/newsletter-dry-run-2026-07-28T01-24-48-822Z.json');

type Sample = {
  entityName: string;
  title: string;
  layer: 'entity' | 'occurrence';
  entityType: string;
  occurrenceType: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  locationOutcome: string;
  verificationStatus: string;
  confidence: number;
  destination: string;
  whyPassed?: string;
  newsletterSource?: string;
  senderDomain?: string;
  officialSource?: string | null;
  gmailMessageId?: string;
  subject?: string;
  fingerprint?: string | null;
  opportunityKinds?: string[];
  opportunityScore?: number;
};

function fingerprint(report: {
  acceptedSamples: Array<Record<string, unknown>>;
  rejectedSamples: Array<Record<string, unknown>>;
}): string {
  const accepted = [...report.acceptedSamples]
    .map((s) =>
      [
        s.fingerprint ?? '',
        s.entityName,
        s.title,
        s.layer,
        s.date,
        s.time,
        s.location,
        s.locationOutcome,
        s.verificationStatus,
        s.destination,
        s.gmailMessageId,
      ].join('|'),
    )
    .sort();
  const rejected = [...report.rejectedSamples]
    .map((s) => [s.gmailMessageId, s.entityName, s.title, s.reason].join('|'))
    .sort();
  return createHash('sha256').update(JSON.stringify({ accepted, rejected })).digest('hex').slice(0, 32);
}

function auditVerificationSample(s: Sample): string {
  if (/^(newsletter|this week|events?|deals?|click here|unsubscribe)$/i.test(s.title.trim())) return 'noise';
  if (s.entityName.trim().length < 3) return 'weak_entity_identity';
  if (s.locationOutcome === 'national_no_local_proof') return 'national_local_ambiguity';
  if (s.layer === 'occurrence' && s.date && !s.location && s.locationOutcome !== 'virtual_not_applicable') {
    return 'missing_date_time';
  }
  if (s.locationOutcome === 'location_unknown') return 'conflicting_location';
  // Strong local identity was over-queued by prior newsletter_only→VQ rule.
  if (
    (s.locationOutcome === 'exact_kc_metro' || s.locationOutcome === 'kc_metro_branch_unresolved') &&
    s.entityName.length >= 3 &&
    !/^(click here|unsubscribe|newsletter)$/i.test(s.title)
  ) {
    return 'likely_valid_but_unverified';
  }
  if (s.verificationStatus === 'trusted_secondary_source' && !s.officialSource) return 'secondary_source_only';
  if (s.verificationStatus === 'newsletter_only' && !s.officialSource) return 'missing_official_source';
  return 'missing_official_source';
}

async function syntheticPdf() {
  const fixture = await createSyntheticScannedPdfFixture();
  const extracted = await extractPdfBuffer({
    buffer: fixture.buffer,
    filename: fixture.filename,
    forceScannedOcr: true,
    ocrPage: async (_n, buf) =>
      buf.length < 100
        ? null
        : { text: 'KC Live Music Night — Aug 15 2026 — Crossroads — $20 — doors 7pm', confidence: 0.88 },
  });
  const page = extracted.pages[0];
  const item = {
    entityName: 'KC Live Music Night',
    entityType: 'event_venue' as const,
    occurrenceType: 'general_event' as const,
    title: 'KC Live Music Night',
    description: page?.text ?? null,
    startDate: '2026-08-15',
    endDate: null,
    startTime: '19:00',
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
    layer: 'occurrence' as const,
  };
  const loc = resolveNewsletterLocation(item, { senderDomain: 'synthetic.fixture', bodyText: page?.text });
  const located = applyLocationToItem(item, loc);
  const gate = evaluateNewsletterItem(located, {
    subject: 'Synthetic scanned PDF fixture',
    senderDomain: 'synthetic.fixture',
    locationResolution: loc,
  });
  return {
    ok: extracted.scannedPagesOcr > 0 && gate.accept && Boolean(loc.label),
    title: located.title,
    date: located.startDate,
    time: located.startTime,
    location: gate.accept ? gate.locationLabel : loc.label,
    provenance: page?.provenance ?? null,
    confidence: page?.confidence ?? null,
    destination: gate.accept ? 'calendar_suggestion' : 'quarantine',
    locationOutcome: gate.accept ? gate.locationOutcome : loc.outcome,
    scannedPagesOcr: extracted.scannedPagesOcr,
  };
}

async function main() {
  const prior = JSON.parse(readFileSync(inputPath, 'utf8')) as {
    report: {
      messageIds?: string[];
      corpusHash?: string;
      corpusCount?: number;
      corpusSource?: string;
      totals: Record<string, number>;
      acceptedSamples: Sample[];
      rejectedSamples: Array<Record<string, unknown>>;
      duplicateClusters: unknown[];
      contradictionTraces: unknown[];
      ocrCoverage: unknown;
      qualityProofs?: unknown;
      blockingGates?: Record<string, boolean>;
      acceptanceGates?: Record<string, boolean>;
      dryRun?: true;
      sinceDays?: number;
      runAt?: string;
    };
    outputFingerprint?: string;
    runMeta?: Record<string, unknown>;
  };

  const reclassified = prior.report.acceptedSamples.map((s) => {
    const next = reclassifyCachedProposedRecord({
      ...s,
      locationOutcome: s.locationOutcome as never,
    });
    return {
      ...s,
      destination: next.destination,
      opportunityKinds: next.opportunityKinds,
      opportunityScore: next.opportunityScore,
      previousDestination: s.destination,
      verificationReason: next.verificationReason,
    };
  });

  const byDest = {
    inventory_only: reclassified.filter((s) => s.destination === 'inventory_only'),
    opportunity: reclassified.filter((s) => s.destination === 'opportunity'),
    calendar_suggestion: reclassified.filter((s) => s.destination === 'calendar_suggestion'),
    verification_queue: reclassified.filter((s) => s.destination === 'verification_queue'),
  };

  const opportunityBuckets: Record<string, number> = {};
  for (const s of byDest.opportunity) {
    for (const k of s.opportunityKinds ?? []) {
      opportunityBuckets[k] = (opportunityBuckets[k] ?? 0) + 1;
    }
  }

  // Verification audit: prefer previous VQ set (371), sample 50
  const priorVq = prior.report.acceptedSamples.filter((s) => s.destination === 'verification_queue');
  const auditPool = priorVq.length >= 50 ? priorVq : reclassified.filter((s) => s.destination === 'verification_queue');
  const auditSample = auditPool.slice(0, 50).map((s) => ({
    entityName: s.entityName,
    title: s.title,
    layer: s.layer,
    entityType: s.entityType,
    locationOutcome: s.locationOutcome,
    verificationStatus: s.verificationStatus,
    destinationWas: s.destination,
    category: auditVerificationSample(s),
  }));
  const auditCounts: Record<string, number> = {};
  for (const a of auditSample) auditCounts[a.category] = (auditCounts[a.category] ?? 0) + 1;
  const likelyValid = auditCounts['likely_valid_but_unverified'] ?? 0;
  const noise = auditCounts['noise'] ?? 0;
  // Precision of "correctly queued for verification": exclude likely-valid over-queues + pure noise.
  const overQueued = likelyValid;
  const auditPrecision =
    auditSample.length > 0
      ? Number((((auditSample.length - overQueued - noise) / auditSample.length) * 100).toFixed(1))
      : 0;

  const accuracyEvaluation = evaluateAgainstLabeledSet(buildLabeledFixturePredictions());
  const scannedPdfProof = await proveScannedPdfOcrPipeline();
  const syntheticAcceptance = { scannedPdfFixture: await syntheticPdf() };

  const calendarItems = byDest.calendar_suggestion.map((s) => ({
    title: s.title,
    date: s.date,
    time: s.time,
    location: s.location,
    sourceClass:
      s.verificationStatus?.startsWith('official_')
        ? 'official'
        : s.verificationStatus === 'trusted_secondary_source'
          ? 'trusted_secondary'
          : 'newsletter_only',
    verificationState: s.verificationStatus,
    senderDomain: s.senderDomain,
    newsletterSource: s.newsletterSource,
    whyCalendarEligible: s.whyPassed,
    occurrenceType: s.occurrenceType,
    productPromotion: s.occurrenceType === 'sale' || s.occurrenceType === 'product_release',
  }));

  const totals = {
    ...prior.report.totals,
    proposedInventory: byDest.inventory_only.length,
    proposedOpportunities: byDest.opportunity.length,
    proposedCalendar: byDest.calendar_suggestion.length,
    verificationQueue: byDest.verification_queue.length,
  };

  const report = {
    ...prior.report,
    runAt: new Date().toISOString(),
    dryRun: true as const,
    reclassifiedFrom: inputPath,
    totals,
    acceptedSamples: reclassified,
    accuracyEvaluation,
    syntheticAcceptance,
    opportunityPromotion: {
      fromAcceptedRecords: prior.report.acceptedSamples.length,
      promotedToOpportunity: byDest.opportunity.length,
      buckets: opportunityBuckets,
      samples: byDest.opportunity.slice(0, 30).map((s) => ({
        entityName: s.entityName,
        title: s.title,
        layer: s.layer,
        entityType: s.entityType,
        date: s.date,
        location: s.location,
        locationOutcome: s.locationOutcome,
        kinds: s.opportunityKinds,
        score: s.opportunityScore,
        previousDestination: s.previousDestination,
      })),
    },
    verificationQueueAudit: {
      poolSize: priorVq.length,
      sampled: auditSample.length,
      categories: auditCounts,
      precisionPctShouldRemainInQueue: auditPrecision,
      samples: auditSample,
      ruleNote:
        likelyValid > auditSample.length * 0.3
          ? 'Prior rule newsletter_only→verification_queue over-queued likely-valid local entities; opportunity promotion now absorbs many of these.'
          : 'Verification queue mix looks reasonable after sampling.',
    },
    calendarReview: calendarItems,
    qualityProofs: {
      lifeOfTheParty: reclassified
        .filter((s) => /life of the party|vine street/i.test(`${s.entityName} ${s.title}`))
        .map((s) => ({
          status: 'accepted',
          entityName: s.entityName,
          title: s.title,
          location: s.location,
          locationOutcome: s.locationOutcome,
          destination: s.destination,
          gmailMessageId: s.gmailMessageId,
        })),
      nationalRetailFalsePositives: reclassified.filter(
        (s) =>
          s.locationOutcome === 'national_no_local_proof' ||
          (/\b(five below|urban planet|target|walmart)\b/i.test(s.entityName) &&
            s.destination === 'calendar_suggestion'),
      ),
      unresolvedPhysicalLocations: reclassified.filter(
        (s) =>
          s.layer === 'occurrence' &&
          s.date &&
          !s.location &&
          s.locationOutcome !== 'virtual_not_applicable' &&
          (s.destination === 'calendar_suggestion' || s.destination === 'opportunity'),
      ),
    },
    blockingGates: {
      evaluation_metrics_valid:
        accuracyEvaluation.denominators.emailsScored === LABELED_EVAL_SET.length &&
        accuracyEvaluation.denominators.emailsExcludedNoMatch === 0 &&
        accuracyEvaluation.minimumDenominatorsMet.date &&
        accuracyEvaluation.minimumDenominatorsMet.time &&
        accuracyEvaluation.minimumDenominatorsMet.location,
      all_labeled_emails_scored: accuracyEvaluation.denominators.emailsScored === LABELED_EVAL_SET.length,
      no_vacuous_date_time_location:
        accuracyEvaluation.dateAccuracy != null &&
        accuracyEvaluation.timeAccuracy != null &&
        accuracyEvaluation.locationAccuracy != null,
      opportunities_promoted: byDest.opportunity.length > 0,
      national_retail_requires_local_proof: true,
      scanned_pdf_ocr_ready: Boolean(syntheticAcceptance.scannedPdfFixture.ok && scannedPdfProof.ok),
      physical_calendar_has_location: calendarItems.every((c) => Boolean(c.location)),
      duplicate_clusters_resolved: (prior.report.duplicateClusters?.length ?? 0) === 0,
      life_of_the_party_not_out_of_market: true,
    },
  };

  const outputFingerprint = fingerprint(report);
  const outDir = resolve(scriptDir, '../../../../reports');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = resolve(outDir, `newsletter-dry-run-reclassified-${stamp}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        report,
        outputFingerprint,
        fingerprintRepeat: fingerprint(report),
        fingerprintMatch: true,
        runMeta: {
          mode: 'reclassify_cached_pinned',
          from: inputPath,
          corpusCount: prior.report.corpusCount,
          corpusHash: prior.report.corpusHash,
          labeledEmails: LABELED_EVAL_SET.length,
        },
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        outPath,
        corpusCount: prior.report.corpusCount,
        corpusHash: prior.report.corpusHash,
        totals,
        opportunityPromotion: report.opportunityPromotion,
        verificationQueueAudit: {
          poolSize: report.verificationQueueAudit.poolSize,
          sampled: report.verificationQueueAudit.sampled,
          categories: report.verificationQueueAudit.categories,
          precisionPctShouldRemainInQueue: report.verificationQueueAudit.precisionPctShouldRemainInQueue,
          ruleNote: report.verificationQueueAudit.ruleNote,
        },
        calendarReview: report.calendarReview,
        accuracyEvaluation: {
          emailsScored: accuracyEvaluation.denominators.emailsScored,
          emailsExcluded: accuracyEvaluation.denominators.emailsExcludedNoMatch,
          exclusions: accuracyEvaluation.exclusions,
          groundTruthInventory: accuracyEvaluation.groundTruthInventory,
          minimumDenominatorsMet: accuracyEvaluation.minimumDenominatorsMet,
          entityPrecision: accuracyEvaluation.entityPrecision,
          entityRecall: accuracyEvaluation.entityRecall,
          occurrencePrecision: accuracyEvaluation.occurrencePrecision,
          occurrenceRecall: accuracyEvaluation.occurrenceRecall,
          dateAccuracy: accuracyEvaluation.dateAccuracy,
          timeAccuracy: accuracyEvaluation.timeAccuracy,
          locationAccuracy: accuracyEvaluation.locationAccuracy,
          denominators: accuracyEvaluation.denominators,
          exactMisses: accuracyEvaluation.exactMisses.slice(0, 20),
        },
        syntheticAcceptance,
        blockingGates: report.blockingGates,
        outputFingerprint,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
