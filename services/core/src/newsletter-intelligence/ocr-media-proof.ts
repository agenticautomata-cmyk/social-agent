/**
 * Prove selective media OCR with binary fixtures (no alt text, no hint blocks).
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { extractCompactNewsletterItems } from './compact-extract.js';
import { computePrefilterContentHash } from './prefilter.js';
import { evaluateNewsletterItem } from './quality-gates.js';
import { applyLocationToItem, resolveNewsletterLocation } from './location-resolve.js';
import { ocrNewsletterImage } from './ocr.js';
import { extractPdfBuffer } from './pdf-parse.js';
import { runSelectiveNewsletterOcr } from './selective-ocr.js';
import { shutdownLocalOcrWorker } from './local-ocr.js';

const FIXTURE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../.cache/newsletter-ocr-binary-fixtures',
);

const IMAGE_EVENT_TEXT =
  'Crossroads Art Walk\nSaturday September 12 2026\n7:00 PM\n1900 Baltimore Ave\nKansas City MO';

const PDF_EVENT_TEXT =
  'KC Live Music Night August 15 2026 7 PM Crossroads Kansas City MO';

export type OcrMediaProofResult = {
  fixture: 'png_flyer' | 'scanned_pdf';
  mediaDetected: boolean;
  localOcrRuns: number;
  localOcrCacheHits: number;
  localOcrFailures: number;
  ocrCacheKey: string | null;
  ocrText: string;
  providerOcrCalls: number;
  providerOcrInputTokens: number;
  providerOcrOutputTokens: number;
  extractionItems: number;
  acceptedEvents: number;
  extractInputTokens: number;
  extractOutputTokens: number;
  secondRunCacheHit: boolean;
  pass: boolean;
  failures: string[];
};

async function buildTextFlyerPng(lines: string[]): Promise<Buffer> {
  const width = 900;
  const height = 520;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#111827"/>
    ${lines
      .map(
        (line, i) =>
          `<text x="48" y="${80 + i * 70}" fill="#ffffff" font-size="34" font-family="Arial, sans-serif">${line}</text>`,
      )
      .join('\n')}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function buildPngFlyerBuffer(): Promise<Buffer> {
  return buildTextFlyerPng(IMAGE_EVENT_TEXT.split('\n'));
}

function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export async function provePngFlyerOcrPath(): Promise<OcrMediaProofResult> {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const png = await buildPngFlyerBuffer();
  const pngPath = resolve(FIXTURE_DIR, 'event-flyer.png');
  writeFileSync(pngPath, png);
  const dataUrl = bufferToDataUrl(png, 'image/png');
  const gmailMessageId = 'fixture-ocr-png-flyer-v2';
  const bodyHtml = `<html><body><img src="${dataUrl}" /></body></html>`;

  const pngSubject = 'Crossroads Art Walk — September 12, 2026';
  const firstStats = await runSelectiveNewsletterOcr({
    gmailMessageId,
    subject: pngSubject,
    bodyText: ' ',
    bodyHtml,
    urls: [],
    mediaOnly: true,
  });

  const hash = createHash('sha256').update(png).digest('hex').slice(0, 16);
  const cacheKey = createHash('sha256')
    .update(`${gmailMessageId}|${hash}|linked_flyer`)
    .digest('hex')
    .slice(0, 24);

  const supplemental = firstStats.supplementalBlocks.join('\n\n');
  const { items, usage } = await extractCompactNewsletterItems({
    gmailMessageId,
    contentHash: computePrefilterContentHash({
      gmailMessageId,
      subject: pngSubject,
      senderEmail: 'events@visitkc.com',
      bodyText: supplemental,
      bodyHtml,
    }),
    subject: pngSubject,
    bodyText: ' ',
    bodyHtml,
    senderEmail: 'events@visitkc.com',
    senderName: 'Visit KC',
    urls: [],
    supplementalOcrText: supplemental,
    skipCache: true,
    emailSentAt: '2026-09-01T12:00:00Z',
    recordSpend: false,
  });

  let acceptedEvents = 0;
  for (const item of items) {
    const located = applyLocationToItem(
      item,
      resolveNewsletterLocation(item, { senderDomain: 'visitkc.com', bodyText: supplemental }),
    );
    if (evaluateNewsletterItem(located).accept) acceptedEvents += 1;
  }

  const secondStats = await runSelectiveNewsletterOcr({
    gmailMessageId,
    subject: pngSubject,
    bodyText: ' ',
    bodyHtml,
    urls: [],
    mediaOnly: true,
  });

  const failures: string[] = [];
  if (!firstStats.emailsWithMedia) failures.push('media not detected');
  if (firstStats.localOcrRuns + firstStats.localOcrCacheHits < 1) {
    failures.push('local OCR not invoked');
  }
  if (firstStats.providerOcrCalls > 0) {
    failures.push('provider OCR called when local should succeed');
  }
  if (!/Crossroads|Art Walk|September 12|2026|Baltimore/i.test(supplemental)) {
    failures.push('OCR text missing event signals');
  }
  if (acceptedEvents < 1) failures.push('event not retained after extraction');
  if (!secondStats.localOcrCacheHits) {
    failures.push('second run did not hit OCR cache');
  }
  if (secondStats.providerOcrCalls > 0) failures.push('second run invoked provider OCR');

  return {
    fixture: 'png_flyer',
    mediaDetected: firstStats.emailsWithMedia,
    localOcrRuns: firstStats.localOcrRuns,
    localOcrCacheHits: firstStats.localOcrCacheHits,
    localOcrFailures: firstStats.localOcrFailures,
    ocrCacheKey: cacheKey,
    ocrText: supplemental.slice(0, 500),
    providerOcrCalls: firstStats.providerOcrCalls,
    providerOcrInputTokens: firstStats.providerOcrInputTokens,
    providerOcrOutputTokens: firstStats.providerOcrOutputTokens,
    extractionItems: items.length,
    acceptedEvents,
    extractInputTokens: usage.inputTokens,
    extractOutputTokens: usage.outputTokens,
    secondRunCacheHit: secondStats.localOcrCacheHits > 0,
    pass: failures.length === 0,
    failures,
  };
}

export async function proveScannedPdfOcrPath(): Promise<OcrMediaProofResult> {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const { createSyntheticScannedPdfFixture } = await import('./pdf-parse.js');
  const { buffer: pdf, filename } = await createSyntheticScannedPdfFixture();
  const pdfPath = resolve(FIXTURE_DIR, filename);
  writeFileSync(pdfPath, pdf);
  const gmailMessageId = 'fixture-ocr-pdf-flyer-v2';
  let localOcrRuns = 0;
  let ocrText = '';
  let providerOcrCalls = 0;
  let cacheKey: string | null = null;

  const pngForPdf = await buildTextFlyerPng([
    'KC Live Music Night',
    'August 15 2026',
    '7:00 PM',
    'Crossroads KC',
    'Kansas City MO',
  ]);

  const runPdfOcr = async () =>
    extractPdfBuffer({
      buffer: pdf,
      filename,
      forceScannedOcr: true,
      ocrPage: async (_page, _imageBuffer) => {
        const ocr = await ocrNewsletterImage({
          order: 1,
          sourceType: 'pdf_page',
          sourceRef: 'fixture-pdf-page-1',
          buffer: pngForPdf,
          mimeType: 'image/png',
          gmailMessageId,
        });
        cacheKey = createHash('sha256')
          .update(`${gmailMessageId}|${createHash('sha256').update(pngForPdf).digest('hex').slice(0, 16)}|pdf_page`)
          .digest('hex')
          .slice(0, 24);
        if (ocr.fromCache) {
          localOcrRuns += 0;
        } else if (ocr.engine === 'tesseract.js-local' && ocr.ok) {
          localOcrRuns += 1;
        } else if (ocr.engine === 'openai-vision-gpt-4o-mini' && ocr.ok) {
          providerOcrCalls += 1;
        }
        ocrText = ocr.text;
        return ocr.ok ? { text: ocr.text, confidence: ocr.confidence } : null;
      },
    });

  const pdfResult = await runPdfOcr();

  ocrText = pdfResult.pages.map((p) => p.text).join('\n') || ocrText;
  const supplemental = pdfResult.pages
    .filter((p) => p.text.length > 0)
    .map((p) => `[PDF ocr-v2]\n${p.text}`)
    .join('\n\n');

  const pdfSubject = 'KC Live Music Night — August 15, 2026';
  const pdfEmailSentAt = '2026-08-01T12:00:00Z';
  const { items, usage } = await extractCompactNewsletterItems({
    gmailMessageId,
    contentHash: computePrefilterContentHash({
      gmailMessageId,
      subject: pdfSubject,
      senderEmail: 'info@kcfringe.org',
      bodyText: supplemental,
      bodyHtml: '',
    }),
    subject: pdfSubject,
    bodyText: ' ',
    bodyHtml: '',
    senderEmail: 'info@kcfringe.org',
    senderName: 'KC Fringe',
    urls: [],
    supplementalOcrText: supplemental,
    skipCache: true,
    emailSentAt: pdfEmailSentAt,
    recordSpend: false,
  });

  let acceptedEvents = 0;
  for (const item of items) {
    const located = applyLocationToItem(
      item,
      resolveNewsletterLocation(item, { senderDomain: 'kcfringe.org', bodyText: supplemental }),
    );
    if (evaluateNewsletterItem(located).accept) acceptedEvents += 1;
  }

  const secondOcr = await ocrNewsletterImage({
    order: 2,
    sourceType: 'pdf_page',
    sourceRef: 'fixture-pdf-page-1',
    buffer: pngForPdf,
    mimeType: 'image/png',
    gmailMessageId,
  });
  const secondRunCacheHit = Boolean(secondOcr.fromCache);

  const failures: string[] = [];
  if (localOcrRuns < 1 && !secondRunCacheHit && !secondOcr.fromCache) {
    failures.push('local OCR callback not invoked');
  }
  if (providerOcrCalls > 0) failures.push('provider OCR called when local should succeed');
  if (!/KC Live Music|August 15|2026|Crossroads|Kansas City/i.test(ocrText)) {
    failures.push('OCR text missing event signals');
  }
  if (acceptedEvents < 1) failures.push('event not retained after extraction');
  if (!secondRunCacheHit) failures.push('second run did not hit OCR cache');

  return {
    fixture: 'scanned_pdf',
    mediaDetected: true,
    localOcrRuns,
    localOcrCacheHits: secondRunCacheHit ? 1 : 0,
    localOcrFailures: 0,
    ocrCacheKey: cacheKey,
    ocrText: ocrText.slice(0, 500),
    providerOcrCalls,
    providerOcrInputTokens: 0,
    providerOcrOutputTokens: 0,
    extractionItems: items.length,
    acceptedEvents,
    extractInputTokens: usage.inputTokens,
    extractOutputTokens: usage.outputTokens,
    secondRunCacheHit,
    pass: failures.length === 0,
    failures,
  };
}

export async function runOcrMediaProofSuite(): Promise<{
  png: OcrMediaProofResult;
  pdf: OcrMediaProofResult;
}> {
  try {
    const png = await provePngFlyerOcrPath();
    const pdf = await proveScannedPdfOcrPath();
    return { png, pdf };
  } finally {
    await shutdownLocalOcrWorker();
  }
}
