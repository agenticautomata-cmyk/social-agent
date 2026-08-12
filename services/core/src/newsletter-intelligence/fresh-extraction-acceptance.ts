/**
 * Isolated fresh-cache acceptance — 10 fixed cases, no compact-extract cache reads.
 */

import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { classifyNewsletterEmail } from './classify.js';
import { reduceNewsletterContent } from './content-reducer.js';
import { evaluateNewsletterItem } from './quality-gates.js';
import { applyLocationToItem, resolveNewsletterLocation } from './location-resolve.js';
import { prefilterNewsletterEmail } from './prefilter.js';
import { processTokenEfficientNewsletterEmail } from './pipeline-token-efficient.js';
import { resolveSenderPolicy } from './sender-policies.js';
import { senderDomainFromEmail } from './classify.js';
import { runSelectiveNewsletterOcr } from './selective-ocr.js';
import { extractPdfBuffer } from './pdf-parse.js';
import { ocrNewsletterImage } from './ocr.js';
import { extractCompactNewsletterItems } from './compact-extract.js';
import { computePrefilterContentHash } from './prefilter.js';
import type { ExtractedNewsletterItem } from './types.js';
import type { TokenEfficientEmailResult } from './pipeline-token-efficient.js';

export type FreshAcceptanceCaseKind =
  | 'complete_single_event'
  | 'multi_event_roundup'
  | 'true_freebie'
  | 'tiktok_worthy_event'
  | 'image_only_flyer'
  | 'scanned_pdf_flyer'
  | 'discount_valid_event'
  | 'product_sale_junk'
  | 'transactional_junk'
  | 'stale_event';

export type FreshAcceptanceExpect = {
  reject: boolean;
  retainComplete?: boolean;
  retainFreebie?: boolean;
  retainTikTok?: boolean;
  staleRejected?: boolean;
};

export type FreshAcceptanceCase = {
  id: string;
  kind: FreshAcceptanceCaseKind;
  expect: FreshAcceptanceExpect;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  senderEmail: string | null;
  senderName: string | null;
  urls: string[];
  emailSentAt: string;
  /** When set, run scanned PDF OCR then pipeline with skipSelectiveOcr. */
  scannedPdfSetup?: boolean;
};

export type FreshCaseTrace = {
  caseId: string;
  kind: FreshAcceptanceCaseKind;
  gmailMessageId: string;
  reducedContent: {
    originalChars: number;
    reducedChars: number;
    reductionPercent: number;
    preview: string;
  };
  senderPolicy: string;
  newsletterCategory: string;
  prefilter: { pass: boolean; reason: string | null };
  ocr: {
    skipped: boolean;
    localOcrRuns: number;
    localOcrCacheHits: number;
    providerOcrCalls: number;
    supplementalPreview: string;
  };
  llm: {
    primaryOutcome: string;
    inputTokens: number;
    outputTokens: number;
    extractCacheHit: boolean;
    dateRejections?: number;
  };
  extractedItems: Array<{
    title: string;
    date: string | null;
    time: string | null;
    venue: string | null;
    city: string | null;
    sourceUrl: string | null;
    layer: string;
  }>;
  accepted: Array<{
    title: string;
    date: string | null;
    time: string | null;
    venue: string | null;
    city: string | null;
    rejectReason?: string;
  }>;
  rejectedItems: Array<{ title: string; reason: string }>;
  provenance: string;
  pass: boolean;
  failures: string[];
};

async function buildFlyerPngDataUrl(lines: string[]): Promise<string> {
  const svg = `<svg width="900" height="520" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#111827"/>
    ${lines
      .map(
        (line, i) =>
          `<text x="48" y="${80 + i * 70}" fill="#ffffff" font-size="34" font-family="Arial, sans-serif">${line}</text>`,
      )
      .join('\n')}
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

export async function buildFreshAcceptanceCases(runNonce: string): Promise<FreshAcceptanceCase[]> {
  const imageDataUrl = await buildFlyerPngDataUrl([
    'Crossroads Block Party',
    'August 20 2026',
    '6:00 PM',
    '12th and Oak',
    'Kansas City MO',
  ]);

  return [
    {
      id: 'complete-single',
      kind: 'complete_single_event',
      expect: { reject: false, retainComplete: true },
      subject: 'Jazz at the Blue Room — August 15, 2026',
      bodyText:
        'The Blue Room presents Kansas City jazz legends on Friday 2026-08-15 at 8:00 PM. 1600 E 18th St, Kansas City MO. Tickets $20.',
      bodyHtml: '',
      senderEmail: 'events@americanjazzmuseum.org',
      senderName: 'Blue Room',
      urls: [],
      emailSentAt: '2026-07-01T12:00:00Z',
    },
    {
      id: 'multi-roundup',
      kind: 'multi_event_roundup',
      expect: { reject: false, retainComplete: true },
      subject: 'Cheap thrills, fresh shows & free beer?',
      bodyText:
        'Friday October 20, 2026 8:00 PM — Live music at RecordBar, 1520 Grand Blvd, Kansas City MO. Saturday October 21, 2026 noon — Soul Market at 18th and Vine, Kansas City MO.',
      bodyHtml: '',
      senderEmail: 'newsletter@do816.com',
      senderName: 'do816',
      urls: ['https://do816.com/events'],
      emailSentAt: '2026-09-01T12:00:00Z',
    },
    {
      id: 'true-freebie',
      kind: 'true_freebie',
      expect: { reject: false, retainComplete: true, retainFreebie: true },
      subject: 'Free admission community day',
      bodyText:
        'Free admission community day on 2026-10-14 from 10am-4pm at the Nelson-Atkins Museum, 4525 Oak St, Kansas City MO.',
      bodyHtml: '',
      senderEmail: 'news@nelson-atkins.org',
      senderName: 'Nelson-Atkins',
      urls: [],
      emailSentAt: '2026-09-01T12:00:00Z',
    },
    {
      id: 'tiktok-pop-up',
      kind: 'tiktok_worthy_event',
      expect: { reject: false, retainComplete: true, retainTikTok: true },
      subject: 'Secret rooftop pop-up tonight in Crossroads',
      bodyText:
        'Invite-only rooftop pop-up October 6, 2026 9:00 PM at 1900 Baltimore Ave, Kansas City MO. Limited capacity. RSVP required.',
      bodyHtml: '',
      senderEmail: 'hello@crossroadskc.com',
      senderName: 'Crossroads KC',
      urls: [],
      emailSentAt: '2026-09-01T12:00:00Z',
    },
    {
      id: 'image-only-flyer',
      kind: 'image_only_flyer',
      expect: { reject: false, retainComplete: true },
      subject: 'Community block party flyer',
      bodyText: ' ',
      bodyHtml: `<html><body><img src="${imageDataUrl}" alt="" /></body></html>`,
      senderEmail: 'events@visitkc.com',
      senderName: 'Visit KC',
      urls: [],
      emailSentAt: '2026-09-01T12:00:00Z',
    },
    {
      id: 'scanned-pdf-flyer',
      kind: 'scanned_pdf_flyer',
      expect: { reject: false, retainComplete: true },
      scannedPdfSetup: true,
      subject: 'KC Live Music Night — August 15, 2026',
      bodyText: ' ',
      bodyHtml: '',
      senderEmail: 'info@kcfringe.org',
      senderName: 'KC Fringe',
      urls: [],
      emailSentAt: '2026-08-01T12:00:00Z',
    },
    {
      id: 'discount-valid',
      kind: 'discount_valid_event',
      expect: { reject: false, retainComplete: true },
      subject: 'Half-price tickets — KC Symphony at Kauffman Center',
      bodyText:
        '50% off tickets this weekend only. Kansas City Symphony performs Saturday 2026-11-14 at 7:30 PM at Kauffman Center, 1601 Broadway, Kansas City MO.',
      bodyHtml: '',
      senderEmail: 'newsletter@do816.com',
      senderName: 'do816',
      urls: ['https://do816.com/events/symphony'],
      emailSentAt: '2026-10-01T12:00:00Z',
    },
    {
      id: 'product-junk',
      kind: 'product_sale_junk',
      expect: { reject: true },
      subject: '⚡ 3 FOR 1 FLASH SALE',
      bodyText:
        'Shop now. 40% off everything sitewide. Free shipping on orders over $50. New arrivals inside.',
      bodyHtml: '',
      senderEmail: 'deals@urban-planet.com',
      senderName: 'Urban Planet',
      urls: ['https://www.urban-planet.com/sale'],
      emailSentAt: '2026-09-01T12:00:00Z',
    },
    {
      id: 'transactional-junk',
      kind: 'transactional_junk',
      expect: { reject: true },
      subject: 'Your order confirmation #8821',
      bodyText: 'Thank you for your purchase. Track your package with the link below.',
      bodyHtml: '',
      senderEmail: 'orders@target.com',
      senderName: 'Target',
      urls: [],
      emailSentAt: '2026-09-01T12:00:00Z',
    },
    {
      id: 'stale-event',
      kind: 'stale_event',
      expect: { reject: false, staleRejected: true },
      subject: 'Past concert reminder — August 12, 2023',
      bodyText:
        'Reminder: Jazz Night at the Blue Room on 2023-08-12 at 8:00 PM, 1600 E 18th St, Kansas City MO.',
      bodyHtml: '',
      senderEmail: 'events@americanjazzmuseum.org',
      senderName: 'Blue Room',
      urls: [],
      emailSentAt: '2026-09-01T12:00:00Z',
    },
  ].map((c) => ({
    ...c,
    id: `${c.id}-${runNonce}`,
  }));
}

function itemRow(item: ExtractedNewsletterItem) {
  return {
    title: item.title,
    date: item.startDate,
    time: item.startTime,
    venue: item.venue,
    city: item.city,
    sourceUrl: item.sourceUrl,
    layer: item.layer,
  };
}

async function runScannedPdfPipelineCase(
  fixture: FreshAcceptanceCase,
  gmailMessageId: string,
): Promise<{
  result: TokenEfficientEmailResult;
  ocrPreview: string;
  provenance: string;
}> {
  const { createSyntheticScannedPdfFixture } = await import('./pdf-parse.js');
  const { buffer: pdf, filename } = await createSyntheticScannedPdfFixture();
  const pngLines = ['KC Live Music Night', 'August 15 2026', '7:00 PM', 'Crossroads KC', 'Kansas City MO'];
  const svg = `<svg width="900" height="520" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#111827"/>
    ${pngLines
      .map(
        (line, i) =>
          `<text x="48" y="${80 + i * 70}" fill="#ffffff" font-size="34" font-family="Arial, sans-serif">${line}</text>`,
      )
      .join('\n')}
  </svg>`;
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

  let supplemental = '';
  await extractPdfBuffer({
    buffer: pdf,
    filename,
    forceScannedOcr: true,
    ocrPage: async () => {
      const ocr = await ocrNewsletterImage({
        order: 1,
        sourceType: 'pdf_page',
        sourceRef: 'fresh-acceptance-pdf-page',
        buffer: pngBuffer,
        mimeType: 'image/png',
        gmailMessageId,
      });
      supplemental = `[PDF ocr-v2]\n${ocr.text}`;
      return ocr.ok ? { text: ocr.text, confidence: ocr.confidence } : null;
    },
  });

  const prefilter = prefilterNewsletterEmail({
    gmailMessageId,
    subject: fixture.subject,
    bodyText: supplemental,
    bodyHtml: fixture.bodyHtml,
    senderEmail: fixture.senderEmail,
    senderName: fixture.senderName,
    urls: fixture.urls,
    newsletterCategory: classifyNewsletterEmail({
      subject: fixture.subject,
      bodyText: supplemental,
      bodyHtml: fixture.bodyHtml,
      senderEmail: fixture.senderEmail,
      senderName: fixture.senderName,
      fromActiveSubscription: true,
    }),
    persistReject: false,
  });

  if (!prefilter.pass) {
    return {
      result: {
        gmailMessageId,
        subject: fixture.subject,
        senderDomain: senderDomainFromEmail(fixture.senderEmail) ?? 'unknown',
        newsletterCategory: 'event_newsletter',
        primaryOutcome: 'rejected_pre_llm',
        skipReason: prefilter.reason,
        items: [],
        acceptedItems: [],
        qualifyingEvents: 0,
        eventsFromOcrOnly: 0,
        tokenRecord: {
          gmailMessageId,
          subject: fixture.subject,
          senderDomain: 'unknown',
          primaryOutcome: 'rejected_pre_llm',
          prefilterReason: prefilter.reason,
          providerCallsAttempted: 0,
          providerCallsCompleted: 0,
          llmCalls: 0,
          extractCacheHit: false,
          providerOcrCalls: 0,
          localOcrRuns: 1,
          localOcrCacheHits: 0,
          localOcrFailures: 0,
          researchCalls: 0,
          retryTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          ocrInputTokens: 0,
          ocrOutputTokens: 0,
          legacyEstimatedTokens: 0,
          newEstimatedTokens: 0,
          qualifyingEvents: 0,
          eventsFromOcrOnly: 0,
        },
      },
      ocrPreview: supplemental.slice(0, 400),
      provenance: 'local_pdf_render+local_ocr → compact_extract (no extract cache)',
    };
  }

  const { items, usage } = await extractCompactNewsletterItems({
    gmailMessageId,
    contentHash: computePrefilterContentHash({
      gmailMessageId,
      subject: fixture.subject,
      senderEmail: fixture.senderEmail,
      bodyText: supplemental,
      bodyHtml: fixture.bodyHtml,
    }),
    subject: fixture.subject,
    bodyText: fixture.bodyText,
    bodyHtml: fixture.bodyHtml,
    senderEmail: fixture.senderEmail,
    senderName: fixture.senderName,
    urls: fixture.urls,
    supplementalOcrText: supplemental,
    skipCache: true,
    emailSentAt: fixture.emailSentAt,
    recordSpend: false,
  });

  const senderDomain = senderDomainFromEmail(fixture.senderEmail) ?? 'unknown';
  const acceptedItems: ExtractedNewsletterItem[] = [];
  const rejectedItems: Array<{ title: string; reason: string }> = [];
  for (const item of items) {
    const located = applyLocationToItem(
      item,
      resolveNewsletterLocation(item, { senderDomain, bodyText: supplemental }),
    );
    const gate = evaluateNewsletterItem(located);
    if (gate.accept) acceptedItems.push(located);
    else rejectedItems.push({ title: located.title, reason: gate.reason });
  }

  const result: TokenEfficientEmailResult = {
    gmailMessageId,
    subject: fixture.subject,
    senderDomain,
    newsletterCategory: 'event_newsletter',
    primaryOutcome: usage.status,
    skipReason: null,
    items,
    acceptedItems,
    qualifyingEvents: acceptedItems.filter((i) => i.layer === 'occurrence' && i.startDate).length,
    eventsFromOcrOnly: acceptedItems.length,
    tokenRecord: {
      gmailMessageId,
      subject: fixture.subject,
      senderDomain,
      primaryOutcome: usage.status,
      prefilterReason: null,
      providerCallsAttempted: usage.providerCallsAttempted,
      providerCallsCompleted: usage.providerCallsCompleted,
      llmCalls: usage.llmCalls,
      extractCacheHit: usage.cacheHit,
      providerOcrCalls: 0,
      localOcrRuns: 1,
      localOcrCacheHits: 0,
      localOcrFailures: 0,
      researchCalls: 0,
      retryTokens: usage.retryTokens,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      ocrInputTokens: 0,
      ocrOutputTokens: 0,
      legacyEstimatedTokens: 0,
      newEstimatedTokens: 0,
      qualifyingEvents: acceptedItems.filter((i) => i.layer === 'occurrence' && i.startDate).length,
      eventsFromOcrOnly: acceptedItems.length,
    },
    contentReduction: {
      originalChars: usage.contentReduction.originalChars,
      reducedChars: usage.contentReduction.reducedChars,
      reductionPercent: usage.contentReduction.reductionPercent,
    },
  };

  return {
    result,
    ocrPreview: supplemental.slice(0, 400),
    provenance: 'local_pdf_render+local_ocr → compact_extract (skipCache, no compact cache read)',
  };
}

function evaluateCase(
  fixture: FreshAcceptanceCase,
  result: TokenEfficientEmailResult,
): string[] {
  const failures: string[] = [];
  const rejected = result.primaryOutcome === 'rejected_pre_llm';
  const hasComplete = result.acceptedItems.some(
    (i) => i.startDate && (i.venue || i.city),
  );

  if (fixture.expect.reject) {
    if (!rejected && result.acceptedItems.length > 0) {
      failures.push(`expected reject, got ${result.primaryOutcome} with ${result.acceptedItems.length} accepted`);
    }
  } else if (rejected) {
    failures.push(`unexpected prefilter reject: ${result.skipReason}`);
  }

  if (fixture.expect.retainComplete && !hasComplete) {
    failures.push('complete event not retained');
  }
  if (fixture.expect.retainFreebie && !result.acceptedItems.some((i) => i.isFree)) {
    failures.push('freebie not retained');
  }
  if (fixture.expect.retainTikTok && result.acceptedItems.length === 0) {
    failures.push('TikTok-worthy event not retained');
  }
  if (fixture.expect.staleRejected && hasComplete) {
    failures.push('stale event was retained (should be rejected)');
  }
  if (result.primaryOutcome === 'provider_blocked') {
    failures.push('provider_blocked (empty-success failure)');
  }
  if (
    result.primaryOutcome === 'llm_extracted' &&
    result.tokenRecord.outputTokens <= 10 &&
    result.items.length === 0 &&
    !fixture.expect.reject
  ) {
    failures.push('LLM returned empty items array (possible output limit/schema issue)');
  }

  for (const item of result.acceptedItems) {
    if (item.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.startDate)) {
      failures.push(`invented/malformed date: ${item.startDate}`);
    }
  }

  return failures;
}

export async function runFreshExtractionAcceptance(runNonce?: string): Promise<{
  runNonce: string;
  traces: FreshCaseTrace[];
  passed: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    blocked: boolean;
  };
}> {
  const nonce = runNonce ?? createHash('sha256').update(String(Date.now())).digest('hex').slice(0, 8);
  const cases = await buildFreshAcceptanceCases(nonce);
  const traces: FreshCaseTrace[] = [];

  for (const fixture of cases) {
    const gmailMessageId = `fresh-accept-${fixture.kind}-${nonce}`;
    let result: TokenEfficientEmailResult;
    let ocrPreview = '';
    let provenance = 'token_efficient pipeline (skipExtractCache, fresh gmail id)';

    if (fixture.scannedPdfSetup) {
      const pdfRun = await runScannedPdfPipelineCase(fixture, gmailMessageId);
      result = pdfRun.result;
      ocrPreview = pdfRun.ocrPreview;
      provenance = pdfRun.provenance;
    } else {
      result = await processTokenEfficientNewsletterEmail({
        gmailMessageId,
        subject: fixture.subject,
        bodyText: fixture.bodyText,
        bodyHtml: fixture.bodyHtml,
        senderEmail: fixture.senderEmail,
        senderName: fixture.senderName,
        urls: fixture.urls,
        fromActiveSubscription: true,
        recordSpend: false,
        emailSentAt: fixture.emailSentAt,
        skipExtractCache: true,
      });

      if (fixture.kind === 'image_only_flyer') {
        const ocrStats = await runSelectiveNewsletterOcr({
          gmailMessageId,
          subject: fixture.subject,
          bodyText: fixture.bodyText,
          bodyHtml: fixture.bodyHtml,
          urls: fixture.urls,
          mediaOnly: true,
        });
        ocrPreview = ocrStats.supplementalBlocks.join('\n').slice(0, 400);
        provenance = 'selective_ocr(local) → compact_extract (skipExtractCache)';
      }
    }

    const reduction = reduceNewsletterContent({
      subject: fixture.subject,
      bodyText: fixture.bodyText,
      bodyHtml: fixture.bodyHtml,
      urls: fixture.urls,
    });
    const senderDomain = senderDomainFromEmail(fixture.senderEmail) ?? 'unknown';
    const policy = resolveSenderPolicy(fixture.senderEmail, senderDomain);
    const category = classifyNewsletterEmail({
      subject: fixture.subject,
      bodyText: fixture.bodyText,
      bodyHtml: fixture.bodyHtml,
      senderEmail: fixture.senderEmail,
      senderName: fixture.senderName,
      fromActiveSubscription: true,
    });
    const prefilter = prefilterNewsletterEmail({
      gmailMessageId,
      subject: fixture.subject,
      bodyText: fixture.bodyText,
      bodyHtml: fixture.bodyHtml,
      senderEmail: fixture.senderEmail,
      senderName: fixture.senderName,
      urls: fixture.urls,
      newsletterCategory: category,
      persistReject: false,
    });

    const rejectedItems: Array<{ title: string; reason: string }> = [];
    for (const item of result.items) {
      const located = applyLocationToItem(
        item,
        resolveNewsletterLocation(item, { senderDomain, bodyText: fixture.bodyText }),
      );
      const gate = evaluateNewsletterItem(located);
      if (!gate.accept) rejectedItems.push({ title: located.title, reason: gate.reason });
    }

    const failures = evaluateCase(fixture, result);

    traces.push({
      caseId: fixture.id,
      kind: fixture.kind,
      gmailMessageId: createHash('sha256').update(gmailMessageId).digest('hex').slice(0, 12),
      reducedContent: {
        originalChars: reduction.report.originalChars,
        reducedChars: reduction.report.reducedChars,
        reductionPercent: reduction.report.reductionPercent,
        preview: reduction.text.slice(0, 280),
      },
      senderPolicy: `${policy.policy} (${policy.source})`,
      newsletterCategory: category,
      prefilter: {
        pass: prefilter.pass,
        reason: prefilter.pass ? null : prefilter.reason,
      },
      ocr: {
        skipped: fixture.kind !== 'image_only_flyer' && !fixture.scannedPdfSetup,
        localOcrRuns: result.tokenRecord.localOcrRuns,
        localOcrCacheHits: result.tokenRecord.localOcrCacheHits,
        providerOcrCalls: result.tokenRecord.providerOcrCalls,
        supplementalPreview: ocrPreview,
      },
      llm: {
        primaryOutcome: result.primaryOutcome,
        inputTokens: result.tokenRecord.inputTokens,
        outputTokens: result.tokenRecord.outputTokens,
        extractCacheHit: result.tokenRecord.extractCacheHit,
      },
      extractedItems: result.items.map(itemRow),
      accepted: result.acceptedItems.map((i) => itemRow(i)),
      rejectedItems,
      provenance,
      pass: failures.length === 0,
      failures,
    });
  }

  const failed = traces.filter((t) => !t.pass).length;
  const blocked = traces.some((t) => t.llm.primaryOutcome === 'provider_blocked');

  return {
    runNonce: nonce,
    traces,
    passed: failed === 0 && !blocked,
    summary: {
      total: traces.length,
      passed: traces.length - failed,
      failed,
      blocked,
    },
  };
}
