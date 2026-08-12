/**
 * Token-efficient newsletter pipeline — prefilter → reduce → selective OCR → single compact extract.
 */

import {
  classifyNewsletterEmail,
  isProcessableNewsletterCategory,
  senderDomainFromEmail,
} from './classify.js';
import { extractCompactNewsletterItems } from './compact-extract.js';
import { reduceNewsletterContent } from './content-reducer.js';
import { applyEntityResolution } from './entity-resolve.js';
import { evaluateNewsletterItem } from './quality-gates.js';
import { collapseProductNoise } from './product-collapse.js';
import { computePrefilterContentHash, prefilterNewsletterEmail } from './prefilter.js';
import type { PrimaryEmailOutcome } from './outcomes.js';
import {
  estimateLegacyPipelineTokens,
  estimateTokenEfficientPipelineTokens,
  TokenUsageAccumulator,
  type EmailTokenRecord,
} from './token-metrics.js';
import type { ExtractedNewsletterItem, NewsletterCategory } from './types.js';
import { resolveNewsletterLocation, applyLocationToItem } from './location-resolve.js';
import { shouldResearchNewsletterItem, recordResearchCall } from './research-budget.js';
import { verifyNewsletterItem } from './verification.js';
import { resolveNewsletterUrls } from './resolve-links.js';
import { runSelectiveNewsletterOcr } from './selective-ocr.js';
import { resolveSenderPolicy } from './sender-policies.js';
import {
  beginProviderAttemptLedger,
  endProviderAttemptLedger,
} from './provider-attempts.js';

export type TokenEfficientEmailResult = {
  gmailMessageId: string;
  subject: string;
  senderDomain: string;
  newsletterCategory: NewsletterCategory;
  primaryOutcome: PrimaryEmailOutcome;
  skipReason: string | null;
  items: ExtractedNewsletterItem[];
  acceptedItems: ExtractedNewsletterItem[];
  qualifyingEvents: number;
  eventsFromOcrOnly: number;
  tokenRecord: EmailTokenRecord;
  contentReduction?: {
    originalChars: number;
    reducedChars: number;
    reductionPercent: number;
  };
};

function countInlineImages(html: string): number {
  return (html.match(/<img\b/gi) ?? []).length;
}

function buildTokenRecord(input: {
  gmailMessageId: string;
  subject: string;
  senderDomain: string;
  primaryOutcome: PrimaryEmailOutcome;
  prefilterReason: string | null;
  legacyEstimatedTokens: number;
  newEstimatedTokens: number;
  providerCallsAttempted: number;
  providerCallsCompleted: number;
  llmCalls: number;
  extractCacheHit: boolean;
  inputTokens: number;
  outputTokens: number;
  retryTokens: number;
  providerOcrCalls: number;
  localOcrRuns: number;
  localOcrCacheHits: number;
  localOcrFailures: number;
  ocrInputTokens: number;
  ocrOutputTokens: number;
  researchCalls: number;
  qualifyingEvents: number;
  eventsFromOcrOnly: number;
}): EmailTokenRecord {
  return {
    gmailMessageId: input.gmailMessageId,
    subject: input.subject,
    senderDomain: input.senderDomain,
    primaryOutcome: input.primaryOutcome,
    prefilterReason: input.prefilterReason,
    providerCallsAttempted: input.providerCallsAttempted,
    providerCallsCompleted: input.providerCallsCompleted,
    llmCalls: input.llmCalls,
    extractCacheHit: input.extractCacheHit,
    providerOcrCalls: input.providerOcrCalls,
    localOcrRuns: input.localOcrRuns,
    localOcrCacheHits: input.localOcrCacheHits,
    localOcrFailures: input.localOcrFailures,
    researchCalls: input.researchCalls,
    retryTokens: input.retryTokens,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    ocrInputTokens: input.ocrInputTokens,
    ocrOutputTokens: input.ocrOutputTokens,
    legacyEstimatedTokens: input.legacyEstimatedTokens,
    newEstimatedTokens: input.newEstimatedTokens,
    qualifyingEvents: input.qualifyingEvents,
    eventsFromOcrOnly: input.eventsFromOcrOnly,
  };
}

export async function processTokenEfficientNewsletterEmail(input: {
  gmailMessageId: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  senderEmail: string | null;
  senderName: string | null;
  urls: string[];
  fromActiveSubscription?: boolean;
  senderPolicyStatus?: 'enabled' | 'paused' | 'ignored' | 'suggested' | null;
  recordSpend?: boolean;
  skipSelectiveOcr?: boolean;
  skipExtractCache?: boolean;
  emailSentAt?: Date | string | null;
}): Promise<TokenEfficientEmailResult> {
  const senderDomain = senderDomainFromEmail(input.senderEmail) ?? 'unknown';
  const imageCount = countInlineImages(input.bodyHtml);
  const newsletterCategory = classifyNewsletterEmail({
    subject: input.subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    senderEmail: input.senderEmail,
    senderName: input.senderName,
    fromActiveSubscription: input.fromActiveSubscription,
  });

  const processable = isProcessableNewsletterCategory(newsletterCategory);
  const legacyEstimatedTokens = estimateLegacyPipelineTokens({
    processable,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    imageCount,
  });

  const baseReduction = reduceNewsletterContent({
    subject: input.subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    urls: input.urls,
  });

  const newEstimatedTokens = estimateTokenEfficientPipelineTokens({
    processable,
    reducedChars: baseReduction.report.reducedChars,
    selectiveOcrCandidates: Math.min(imageCount, 2),
  });

  if (!processable) {
    const outcome: PrimaryEmailOutcome = 'rejected_pre_llm';
    return {
      gmailMessageId: input.gmailMessageId,
      subject: input.subject,
      senderDomain,
      newsletterCategory,
      primaryOutcome: outcome,
      skipReason: newsletterCategory,
      items: [],
      acceptedItems: [],
      qualifyingEvents: 0,
      eventsFromOcrOnly: 0,
      tokenRecord: buildTokenRecord({
        gmailMessageId: input.gmailMessageId,
        subject: input.subject,
        senderDomain,
        primaryOutcome: outcome,
        prefilterReason: newsletterCategory,
        legacyEstimatedTokens,
        newEstimatedTokens: 0,
        providerCallsAttempted: 0,
        providerCallsCompleted: 0,
        llmCalls: 0,
        extractCacheHit: false,
        inputTokens: 0,
        outputTokens: 0,
        retryTokens: 0,
        providerOcrCalls: 0,
        localOcrRuns: 0,
        localOcrCacheHits: 0,
        localOcrFailures: 0,
        ocrInputTokens: 0,
        ocrOutputTokens: 0,
        researchCalls: 0,
        qualifyingEvents: 0,
        eventsFromOcrOnly: 0,
      }),
    };
  }

  const senderPolicy = resolveSenderPolicy(input.senderEmail, senderDomain);
  if (input.senderPolicyStatus === 'ignored' || senderPolicy.policy === 'always_ignore') {
    const outcome: PrimaryEmailOutcome = 'rejected_pre_llm';
    return {
      gmailMessageId: input.gmailMessageId,
      subject: input.subject,
      senderDomain,
      newsletterCategory,
      primaryOutcome: outcome,
      skipReason: 'previously_ignored_sender',
      items: [],
      acceptedItems: [],
      qualifyingEvents: 0,
      eventsFromOcrOnly: 0,
      tokenRecord: buildTokenRecord({
        gmailMessageId: input.gmailMessageId,
        subject: input.subject,
        senderDomain,
        primaryOutcome: outcome,
        prefilterReason: 'previously_ignored_sender',
        legacyEstimatedTokens,
        newEstimatedTokens: 0,
        providerCallsAttempted: 0,
        providerCallsCompleted: 0,
        llmCalls: 0,
        extractCacheHit: false,
        inputTokens: 0,
        outputTokens: 0,
        retryTokens: 0,
        providerOcrCalls: 0,
        localOcrRuns: 0,
        localOcrCacheHits: 0,
        localOcrFailures: 0,
        ocrInputTokens: 0,
        ocrOutputTokens: 0,
        researchCalls: 0,
        qualifyingEvents: 0,
        eventsFromOcrOnly: 0,
      }),
    };
  }

  if (input.senderPolicyStatus === 'paused') {
    const outcome: PrimaryEmailOutcome = 'rejected_pre_llm';
    return {
      gmailMessageId: input.gmailMessageId,
      subject: input.subject,
      senderDomain,
      newsletterCategory,
      primaryOutcome: outcome,
      skipReason: 'source_paused',
      items: [],
      acceptedItems: [],
      qualifyingEvents: 0,
      eventsFromOcrOnly: 0,
      tokenRecord: buildTokenRecord({
        gmailMessageId: input.gmailMessageId,
        subject: input.subject,
        senderDomain,
        primaryOutcome: outcome,
        prefilterReason: 'source_paused',
        legacyEstimatedTokens,
        newEstimatedTokens: 0,
        providerCallsAttempted: 0,
        providerCallsCompleted: 0,
        llmCalls: 0,
        extractCacheHit: false,
        inputTokens: 0,
        outputTokens: 0,
        retryTokens: 0,
        providerOcrCalls: 0,
        localOcrRuns: 0,
        localOcrCacheHits: 0,
        localOcrFailures: 0,
        ocrInputTokens: 0,
        ocrOutputTokens: 0,
        researchCalls: 0,
        qualifyingEvents: 0,
        eventsFromOcrOnly: 0,
      }),
    };
  }

  const prefilter = prefilterNewsletterEmail({
    gmailMessageId: input.gmailMessageId,
    subject: input.subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    senderEmail: input.senderEmail,
    senderName: input.senderName,
    urls: input.urls,
    newsletterCategory,
    senderPolicyStatus: input.senderPolicyStatus,
    persistReject: true,
  });

  if (!prefilter.pass) {
    const outcome: PrimaryEmailOutcome = 'rejected_pre_llm';
    return {
      gmailMessageId: input.gmailMessageId,
      subject: input.subject,
      senderDomain,
      newsletterCategory,
      primaryOutcome: outcome,
      skipReason: prefilter.reason,
      items: [],
      acceptedItems: [],
      qualifyingEvents: 0,
      eventsFromOcrOnly: 0,
      tokenRecord: buildTokenRecord({
        gmailMessageId: input.gmailMessageId,
        subject: input.subject,
        senderDomain,
        primaryOutcome: outcome,
        prefilterReason: prefilter.reason,
        legacyEstimatedTokens,
        newEstimatedTokens: 0,
        providerCallsAttempted: 0,
        providerCallsCompleted: 0,
        llmCalls: 0,
        extractCacheHit: false,
        inputTokens: 0,
        outputTokens: 0,
        retryTokens: 0,
        providerOcrCalls: 0,
        localOcrRuns: 0,
        localOcrCacheHits: 0,
        localOcrFailures: 0,
        ocrInputTokens: 0,
        ocrOutputTokens: 0,
        researchCalls: 0,
        qualifyingEvents: 0,
        eventsFromOcrOnly: 0,
      }),
    };
  }

  const ocrStats = input.skipSelectiveOcr
    ? null
    : await runSelectiveNewsletterOcr({
        gmailMessageId: input.gmailMessageId,
        subject: input.subject,
        bodyText: input.bodyText,
        bodyHtml: input.bodyHtml,
        urls: input.urls,
      });

  const supplementalOcrText = ocrStats?.supplementalBlocks.join('\n\n') ?? '';
  const contentHash = computePrefilterContentHash({
    ...input,
    bodyText: [input.bodyText, supplementalOcrText].filter(Boolean).join('\n\n'),
  });

  const { items: rawItems, usage } = await extractCompactNewsletterItems({
    gmailMessageId: input.gmailMessageId,
    contentHash,
    subject: input.subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    senderEmail: input.senderEmail,
    senderName: input.senderName,
    urls: input.urls,
    supplementalOcrText,
    recordSpend: input.recordSpend,
    skipCache: input.skipExtractCache,
    emailSentAt: input.emailSentAt,
  });

  const primaryOutcome: PrimaryEmailOutcome = usage.status;

  const collapsed = collapseProductNoise(rawItems, senderDomain);
  const items = collapsed.kept.map((item) =>
    applyEntityResolution(item, {
      senderName: input.senderName,
      senderDomain,
    }),
  );

  const resolvedLinks = await resolveNewsletterUrls(input.urls);
  let perEmailResearch = 0;
  const acceptedItems: ExtractedNewsletterItem[] = [];

  if (primaryOutcome === 'llm_extracted' || primaryOutcome === 'cache_hit') {
    for (const item of items) {
      const located = applyLocationToItem(
        item,
        resolveNewsletterLocation(item, { senderDomain, bodyText: input.bodyText }),
      );
      const gate = evaluateNewsletterItem(located);
      if (!gate.accept) continue;

      const verification = await verifyNewsletterItem({
        item: located,
        senderDomain,
        senderEmail: input.senderEmail,
        resolvedLinks,
      });

      const researchDecision = shouldResearchNewsletterItem({
        item: located,
        perEmailResearchCalls: perEmailResearch,
        gateAccept: gate.accept,
        verificationStatus: verification.status,
        locationOutcome: gate.locationOutcome,
      });

      if (researchDecision.allow) {
        recordResearchCall();
        perEmailResearch += 1;
      }

      acceptedItems.push(located);
    }
  }

  const textHadEvents = acceptedItems.some((i) => i.layer === 'occurrence' && i.startDate);
  const eventsFromOcrOnly =
    supplementalOcrText.length > 0 && !textHadEvents && acceptedItems.length > 0
      ? acceptedItems.filter((i) => i.layer === 'occurrence').length
      : 0;

  const tokenRecord = buildTokenRecord({
    gmailMessageId: input.gmailMessageId,
    subject: input.subject,
    senderDomain,
    primaryOutcome,
    prefilterReason: null,
    legacyEstimatedTokens,
    newEstimatedTokens,
    providerCallsAttempted: usage.providerCallsAttempted + (ocrStats?.providerOcrCalls ?? 0),
    providerCallsCompleted:
      usage.providerCallsCompleted + (ocrStats?.providerOcrCalls ?? 0),
    llmCalls: usage.llmCalls,
    extractCacheHit: usage.cacheHit,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    retryTokens: usage.retryTokens,
    providerOcrCalls: ocrStats?.providerOcrCalls ?? 0,
    localOcrRuns: ocrStats?.localOcrRuns ?? 0,
    localOcrCacheHits: ocrStats?.localOcrCacheHits ?? 0,
    localOcrFailures: ocrStats?.localOcrFailures ?? 0,
    ocrInputTokens: ocrStats?.providerOcrInputTokens ?? 0,
    ocrOutputTokens: ocrStats?.providerOcrOutputTokens ?? 0,
    researchCalls: perEmailResearch,
    qualifyingEvents: acceptedItems.filter((i) => i.layer === 'occurrence' && i.startDate).length,
    eventsFromOcrOnly,
  });

  return {
    gmailMessageId: input.gmailMessageId,
    subject: input.subject,
    senderDomain,
    newsletterCategory,
    primaryOutcome,
    skipReason:
      primaryOutcome === 'provider_blocked'
        ? 'provider_quota_exhausted'
        : primaryOutcome === 'extraction_failed'
          ? 'extraction_failed'
          : null,
    items: primaryOutcome === 'provider_blocked' ? [] : items,
    acceptedItems: primaryOutcome === 'provider_blocked' ? [] : acceptedItems,
    qualifyingEvents: tokenRecord.qualifyingEvents,
    eventsFromOcrOnly,
    tokenRecord,
    contentReduction: {
      originalChars: usage.contentReduction.originalChars,
      reducedChars: usage.contentReduction.reducedChars,
      reductionPercent: usage.contentReduction.reductionPercent,
    },
  };
}

export async function runTokenEfficientBatch(
  emails: Array<{
    gmailMessageId: string;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    senderEmail: string | null;
    senderName: string | null;
    urls: string[];
    fromActiveSubscription?: boolean;
    senderPolicyStatus?: 'enabled' | 'paused' | 'ignored' | 'suggested' | null;
  }>,
  options?: { recordSpend?: boolean; skipSelectiveOcr?: boolean; skipExtractCache?: boolean },
): Promise<{ results: TokenEfficientEmailResult[]; totals: ReturnType<TokenUsageAccumulator['totals']>; providerLedger: ReturnType<typeof endProviderAttemptLedger> }> {
  beginProviderAttemptLedger();
  const acc = new TokenUsageAccumulator();
  const results: TokenEfficientEmailResult[] = [];

  for (const email of emails) {
    const result = await processTokenEfficientNewsletterEmail({
      ...email,
      recordSpend: options?.recordSpend,
      skipSelectiveOcr: options?.skipSelectiveOcr,
      skipExtractCache: options?.skipExtractCache,
    });
    results.push(result);
    acc.add(result.tokenRecord);
  }

  const providerBlocked = results.some((r) => r.primaryOutcome === 'provider_blocked');
  const providerCompleted = acc.records.some((r) => r.providerCallsCompleted > 0);
  const totals = acc.totals({
    providerQuotaBlockedRun: providerBlocked && !providerCompleted,
  });
  const providerLedger = endProviderAttemptLedger();
  if (providerLedger && totals.providerCallsAttempted > 0) {
    providerLedger.assertReconciles(totals.providerCallsAttempted);
  }
  return {
    results,
    totals,
    providerLedger,
  };
}
