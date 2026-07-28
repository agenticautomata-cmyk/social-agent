import type { ParsedDiscoveryMessage } from '../gmail-inbox/message-parse.js';
import { extractNewsletterItems } from './extract.js';
import {
  calendarRawFromPart,
  extractInlineImageUrls,
  fetchLinkedImageBuffer,
  fetchMessageAttachments,
  isCalendarPart,
  isImagePart,
  isPdfPart,
} from './attachments.js';
import {
  classifyImageSkipReason,
  ocrFieldsToNewsletterItem,
  ocrNewsletterImage,
  type ImageAuditRecord,
} from './ocr.js';
import { extractPdfBuffer, extractLinkedPdfUrl, pdfPagesToSupplementalText } from './pdf-parse.js';
import { icsEventsToNewsletterItems, parseIcsContent } from './ics-parse.js';
import { applyEntityResolution } from './entity-resolve.js';
import type { ExtractedNewsletterItem } from './types.js';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENRICH_CACHE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../.cache/newsletter-enrich',
);
export type EnrichmentStats = {
  imagesFound: number;
  imagesOcrd: number;
  pdfsParsed: number;
  pdfPagesOcr: number;
  scannedPdfPagesOcr: number;
  icsParsed: number;
  supplementalTextLength: number;
  imageAudit: ImageAuditRecord[];
};

export type EnrichmentResult = {
  items: ExtractedNewsletterItem[];
  supplementalText: string;
  stats: EnrichmentStats;
  ocrEvidence: Array<{ sourceRef: string; confidence: number }>;
};

const MAX_OCR_PER_MESSAGE = 12;
const seenImageHashes = new Set<string>();

function mergeUniqueItems(base: ExtractedNewsletterItem[], extra: ExtractedNewsletterItem[]): ExtractedNewsletterItem[] {
  const seen = new Set<string>();
  const out: ExtractedNewsletterItem[] = [];
  for (const item of [...base, ...extra]) {
    const key = `${item.entityName}|${item.title}|${item.startDate}|${item.startTime}|${item.venue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function enrichNewsletterMessage(input: {
  message: ParsedDiscoveryMessage;
  subject: string;
  senderEmail: string | null;
  senderName: string | null;
  senderDomain: string;
  newsletterSourceName: string | null;
  skipOcr?: boolean;
}): Promise<EnrichmentResult> {
  const cacheKey = createHash('sha256')
    .update(`${input.message.id}|ocr=${input.skipOcr ? '0' : '1'}`)
    .digest('hex')
    .slice(0, 24);
  const cachePath = resolve(ENRICH_CACHE_DIR, `${cacheKey}.json`);
  try {
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, 'utf8')) as EnrichmentResult;
    }
  } catch {
    // ignore cache read errors
  }

  const stats: EnrichmentStats = {
    imagesFound: 0,
    imagesOcrd: 0,
    pdfsParsed: 0,
    pdfPagesOcr: 0,
    scannedPdfPagesOcr: 0,
    icsParsed: 0,
    supplementalTextLength: 0,
    imageAudit: [],
  };
  const ocrEvidence: EnrichmentResult['ocrEvidence'] = [];
  const supplementalChunks: string[] = [];
  const attachmentItems: ExtractedNewsletterItem[] = [];

  const attachments = await fetchMessageAttachments(input.message);
  let imageOrder = 0;
  let ocrBudget = MAX_OCR_PER_MESSAGE;

  const ocrPdfPage = async (pageNumber: number, imageBuffer: Buffer, mimeType: string) => {
    if (input.skipOcr) return null;
    const ocr = await ocrNewsletterImage({
      order: pageNumber,
      sourceType: 'pdf_page',
      sourceRef: `pdf-page-${pageNumber}`,
      buffer: imageBuffer,
      mimeType,
      subjectContext: input.subject,
      gmailMessageId: input.message.id,
    });
    return ocr.ok ? { text: ocr.text, confidence: ocr.confidence } : null;
  };

  for (const { descriptor, buffer } of attachments) {
    if (isCalendarPart(descriptor)) {
      const raw = calendarRawFromPart(descriptor, buffer);
      const events = parseIcsContent(raw);
      stats.icsParsed += events.length;
      attachmentItems.push(
        ...icsEventsToNewsletterItems(events).map((item) =>
          applyEntityResolution(item, {
            senderName: input.senderName,
            senderDomain: input.senderDomain,
          }),
        ),
      );
      supplementalChunks.push(raw.slice(0, 8000));
      continue;
    }

    if (isPdfPart(descriptor)) {
      const pdf = await extractPdfBuffer({
        buffer,
        filename: descriptor.filename ?? 'attachment.pdf',
        ocrPage: ocrPdfPage,
      });
      if (pdf.ok || pdf.scannedPagesOcr > 0) {
        stats.pdfsParsed += 1;
        stats.scannedPdfPagesOcr += pdf.scannedPagesOcr;
        stats.pdfPagesOcr += pdf.scannedPagesOcr;
        supplementalChunks.push(pdfPagesToSupplementalText(pdf.pages));
      }
      continue;
    }

    if (isImagePart(descriptor)) {
      stats.imagesFound += 1;
      const skipKind = classifyImageSkipReason({
        filename: descriptor.filename,
        mimeType: descriptor.mimeType,
        byteLength: buffer.length,
      });
      const hash = `${buffer.length}:${descriptor.filename ?? ''}:${buffer.subarray(0, 32).toString('hex')}`;
      if (seenImageHashes.has(hash)) {
        stats.imageAudit.push({
          sourceRef: descriptor.filename ?? `image-${stats.imagesFound}`,
          senderDomain: input.senderDomain,
          byteLength: buffer.length,
          filename: descriptor.filename,
          mimeType: descriptor.mimeType,
          outcome: 'duplicate',
          ocrAttempted: false,
          ocrSucceeded: false,
        });
        continue;
      }
      seenImageHashes.add(hash);

      if (input.skipOcr || skipKind) {
        stats.imageAudit.push({
          sourceRef: descriptor.filename ?? `image-${stats.imagesFound}`,
          senderDomain: input.senderDomain,
          byteLength: buffer.length,
          filename: descriptor.filename,
          mimeType: descriptor.mimeType,
          outcome: skipKind ?? 'decorative',
          ocrAttempted: false,
          ocrSucceeded: false,
          reason: input.skipOcr ? 'skip_ocr_flag' : skipKind ?? undefined,
        });
        continue;
      }

      if (ocrBudget <= 0) {
        stats.imageAudit.push({
          sourceRef: descriptor.filename ?? `image-${stats.imagesFound}`,
          senderDomain: input.senderDomain,
          byteLength: buffer.length,
          filename: descriptor.filename,
          mimeType: descriptor.mimeType,
          outcome: 'deferred_resource_limit',
          ocrAttempted: false,
          ocrSucceeded: false,
        });
        continue;
      }

      imageOrder += 1;
      ocrBudget -= 1;
      const ocr = await ocrNewsletterImage({
        order: imageOrder,
        sourceType: descriptor.inline ? 'inline_image' : 'attachment',
        sourceRef: descriptor.filename ?? descriptor.contentId ?? `image-${imageOrder}`,
        buffer,
        mimeType: descriptor.mimeType,
        subjectContext: input.subject,
        gmailMessageId: input.message.id,
      });

      if (ocr.ok) {
        stats.imagesOcrd += 1;
        ocrEvidence.push({ sourceRef: ocr.sourceRef, confidence: ocr.confidence });
        supplementalChunks.push(ocr.text);
        stats.imageAudit.push({
          sourceRef: ocr.sourceRef,
          senderDomain: input.senderDomain,
          byteLength: buffer.length,
          filename: descriptor.filename,
          mimeType: descriptor.mimeType,
          outcome: 'ocr_succeeded',
          ocrAttempted: true,
          ocrSucceeded: true,
        });
        const item = ocrFieldsToNewsletterItem(ocr.fields, ocr.sourceRef);
        if (item) {
          attachmentItems.push(
            applyEntityResolution(item, {
              senderName: input.senderName,
              senderDomain: input.senderDomain,
            }),
          );
        }
      } else if (ocr.error === 'decorative_or_empty') {
        stats.imageAudit.push({
          sourceRef: ocr.sourceRef,
          senderDomain: input.senderDomain,
          byteLength: buffer.length,
          filename: descriptor.filename,
          mimeType: descriptor.mimeType,
          outcome: 'decorative',
          ocrAttempted: true,
          ocrSucceeded: false,
          reason: ocr.error,
        });
      } else {
        stats.imageAudit.push({
          sourceRef: descriptor.filename ?? `image-${imageOrder}`,
          senderDomain: input.senderDomain,
          byteLength: buffer.length,
          filename: descriptor.filename,
          mimeType: descriptor.mimeType,
          outcome: 'ocr_failed',
          ocrAttempted: true,
          ocrSucceeded: false,
          reason: ocr.error,
        });
      }
    }
  }

  for (const url of input.message.inlineImageUrls?.length
    ? input.message.inlineImageUrls
    : extractInlineImageUrls(input.message.bodyHtml)) {
    stats.imagesFound += 1;
    if (input.skipOcr) {
      stats.imageAudit.push({
        sourceRef: url,
        senderDomain: input.senderDomain,
        byteLength: 0,
        outcome: 'deferred_resource_limit',
        ocrAttempted: false,
        ocrSucceeded: false,
        reason: 'skip_ocr_flag',
      });
      continue;
    }
    const linked = await fetchLinkedImageBuffer(url);
    if (!linked) continue;
    const skipKind = classifyImageSkipReason({
      mimeType: linked.mimeType,
      byteLength: linked.buffer.length,
    });
    if (skipKind) {
      stats.imageAudit.push({
        sourceRef: url,
        senderDomain: input.senderDomain,
        byteLength: linked.buffer.length,
        mimeType: linked.mimeType,
        outcome: skipKind,
        ocrAttempted: false,
        ocrSucceeded: false,
      });
      continue;
    }
    if (ocrBudget <= 0) {
      stats.imageAudit.push({
        sourceRef: url,
        senderDomain: input.senderDomain,
        byteLength: linked.buffer.length,
        mimeType: linked.mimeType,
        outcome: 'deferred_resource_limit',
        ocrAttempted: false,
        ocrSucceeded: false,
      });
      continue;
    }
    imageOrder += 1;
    ocrBudget -= 1;
    const ocr = await ocrNewsletterImage({
      order: imageOrder,
      sourceType: 'linked_flyer',
      sourceRef: `linked-flyer-${imageOrder}-${createHash('sha256').update(linked.buffer).digest('hex').slice(0, 12)}`,
      buffer: linked.buffer,
      mimeType: linked.mimeType,
      subjectContext: input.subject,
      gmailMessageId: input.message.id,
    });
    if (ocr.ok) {
      stats.imagesOcrd += 1;
      ocrEvidence.push({ sourceRef: ocr.sourceRef, confidence: ocr.confidence });
      supplementalChunks.push(ocr.text);
      stats.imageAudit.push({
        sourceRef: url,
        senderDomain: input.senderDomain,
        byteLength: linked.buffer.length,
        mimeType: linked.mimeType,
        outcome: 'ocr_succeeded',
        ocrAttempted: true,
        ocrSucceeded: true,
      });
      const item = ocrFieldsToNewsletterItem(ocr.fields, url);
      if (item) {
        attachmentItems.push(
          applyEntityResolution(item, {
            senderName: input.senderName,
            senderDomain: input.senderDomain,
          }),
        );
      }
    } else {
      stats.imageAudit.push({
        sourceRef: url,
        senderDomain: input.senderDomain,
        byteLength: linked.buffer.length,
        mimeType: linked.mimeType,
        outcome: ocr.error === 'decorative_or_empty' ? 'decorative' : 'ocr_failed',
        ocrAttempted: true,
        ocrSucceeded: false,
        reason: ocr.error,
      });
    }
  }

  for (const url of input.message.urls) {
    if (!url.toLowerCase().includes('.pdf')) continue;
    const pdf = await extractLinkedPdfUrl(url, ocrPdfPage);
    if (pdf?.ok || (pdf && pdf.scannedPagesOcr > 0)) {
      stats.pdfsParsed += 1;
      stats.scannedPdfPagesOcr += pdf.scannedPagesOcr;
      supplementalChunks.push(pdfPagesToSupplementalText(pdf.pages));
    }
  }

  const supplementalText = supplementalChunks.join('\n\n').slice(0, 20000);
  stats.supplementalTextLength = supplementalText.length;

  const bodyForExtract = [input.message.bodyText, supplementalText].filter(Boolean).join('\n\n');
  const { items: textItems } = await extractNewsletterItems({
    gmailMessageId: input.message.id,
    subject: input.subject,
    bodyText: bodyForExtract,
    bodyHtml: input.message.bodyHtml,
    senderName: input.senderName,
    senderEmail: input.senderEmail,
    newsletterSourceName: input.newsletterSourceName,
    urls: input.message.urls,
  });

  const resolvedTextItems = textItems.map((item) =>
    applyEntityResolution(item, {
      senderName: input.senderName,
      senderDomain: input.senderDomain,
    }),
  );

  const result: EnrichmentResult = {
    items: mergeUniqueItems(resolvedTextItems, attachmentItems),
    supplementalText,
    stats,
    ocrEvidence,
  };
  try {
    mkdirSync(ENRICH_CACHE_DIR, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(result));
  } catch {
    // best-effort
  }
  return result;
}
