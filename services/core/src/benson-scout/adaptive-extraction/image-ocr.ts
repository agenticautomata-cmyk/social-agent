/**
 * Optional image/flyer understanding.
 * Local OCR first; vision billable DISABLED by default.
 * Image-only without corroboration → reviewable, never auto-verified.
 */

import type { ExtractedEventListing } from '../event-listing-extract.js';

export type ImageOcrOptions = {
  /** Billable vision — must stay false unless explicitly enabled by operator budget. */
  enableBillableVision?: boolean;
  /** Local OCR hook — unused unless a local engine is injected. */
  localOcr?: (imageBytes: Buffer, imageUrl: string) => Promise<string | null>;
};

export type ImageOcrCandidate = {
  imageUrl: string;
  ocrText: string | null;
  candidateTitle: string | null;
  candidateDate: string | null;
  candidateTime: string | null;
  candidateVenue: string | null;
  candidatePrice: string | null;
  conflicts: string[];
  corroborated: boolean;
  reviewableOnly: boolean;
};

/**
 * Parse lightweight date/title hints from OCR text. Never invents missing fields.
 */
export function parseOcrEventHints(ocrText: string): Omit<
  ImageOcrCandidate,
  'imageUrl' | 'ocrText' | 'conflicts' | 'corroborated' | 'reviewableOnly'
> {
  const text = ocrText.replace(/\s+/g, ' ').trim();
  const date =
    text.match(/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2})\b/)?.[1]?.replace(/\//g, '-') ??
    text.match(
      /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+20\d{2})?)\b/i,
    )?.[1] ??
    null;
  const time =
    text.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\b/)?.[1] ??
    text.match(/\b(\d{1,2}\s*(?:AM|PM))\b/i)?.[1] ??
    null;
  const price = text.match(/\$\s?\d+(?:\.\d{2})?/)?.[0] ?? null;
  const lines = text.split(/[\n•|]/).map((l) => l.trim()).filter((l) => l.length > 3);
  const candidateTitle = lines[0]?.slice(0, 120) ?? null;
  return {
    candidateTitle,
    candidateDate: date,
    candidateTime: time,
    candidateVenue: null,
    candidatePrice: price,
  };
}

/**
 * Run optional OCR. Default: disabled / no-op (no billable AI).
 */
export async function extractFromPublicImages(input: {
  imageUrls: string[];
  sourceUrl: string;
  corroboratingEvents?: ExtractedEventListing[];
  opts?: ImageOcrOptions;
}): Promise<{
  candidates: ImageOcrCandidate[];
  events: ExtractedEventListing[];
  notes: string[];
}> {
  const notes: string[] = [];
  const candidates: ImageOcrCandidate[] = [];
  const events: ExtractedEventListing[] = [];

  if (input.opts?.enableBillableVision) {
    notes.push('billable_vision_requested_but_disabled_in_default_policy');
  }

  if (!input.opts?.localOcr) {
    notes.push('image_ocr_disabled_no_local_engine');
    return { candidates, events, notes };
  }

  // Local OCR path reserved for injected engines — fetch is caller-provided via OCR fn.
  for (const imageUrl of input.imageUrls.slice(0, 5)) {
    let ocrText: string | null = null;
    try {
      ocrText = await input.opts.localOcr(Buffer.alloc(0), imageUrl);
    } catch {
      notes.push(`ocr_failed:${imageUrl}`);
      continue;
    }
    if (!ocrText) {
      notes.push(`ocr_empty:${imageUrl}`);
      continue;
    }
    const hints = parseOcrEventHints(ocrText);
    const conflicts: string[] = [];
    const corroborated = Boolean(
      input.corroboratingEvents?.some(
        (e) =>
          (hints.candidateTitle &&
            e.title.toLowerCase().includes(hints.candidateTitle.slice(0, 20).toLowerCase())) ||
          (hints.candidateDate && e.startDate && e.startDate === hints.candidateDate),
      ),
    );
    candidates.push({
      imageUrl,
      ocrText,
      ...hints,
      conflicts,
      corroborated,
      reviewableOnly: !corroborated,
    });
    notes.push(
      corroborated
        ? `ocr_corroborated:${imageUrl}`
        : `ocr_reviewable_only:${imageUrl}`,
    );
  }

  return { candidates, events, notes };
}
