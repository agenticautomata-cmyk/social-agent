/**
 * Local OCR pipeline for Instagram flyers.
 * Preprocess with sharp → tesseract.js. Billable vision never called here.
 */

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { averagePerceptualHash, readCachedOcr, shortMediaHash, writeCachedOcr } from './cache.js';
import type { SlideOcrEvidence } from './types.js';

let workerPromise: ReturnType<typeof createWorker> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, { logger: () => undefined });
  }
  return workerPromise;
}

export async function shutdownInstagramLocalOcr(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}

export type PreprocessVariant = {
  method: string;
  buffer: Buffer;
};

/** Multi-pass preprocess for stylized flyers (orientation, contrast, threshold, etc.). */
export async function preprocessFlyerVariants(input: Buffer): Promise<PreprocessVariant[]> {
  const variants: PreprocessVariant[] = [];
  const base = sharp(input, { failOn: 'none' }).rotate(); // EXIF orientation

  const meta = await base.metadata();
  const width = meta.width ?? 1080;
  const targetW = Math.min(1200, Math.max(640, width));

  const resized = await base
    .clone()
    .resize({ width: targetW, withoutEnlargement: false })
    .jpeg({ quality: 85 })
    .toBuffer();
  variants.push({ method: 'resize', buffer: resized });

  const gray = await sharp(resized).grayscale().normalize().sharpen().jpeg({ quality: 85 }).toBuffer();
  variants.push({ method: 'gray_contrast_sharpen', buffer: gray });

  // Only add threshold/invert when first passes are weak — caller may still run all;
  // keep threshold as third optional pass for stylized flyers.
  if (process.env.INSTAGRAM_OCR_FULL_PREPROCESS === '1') {
    const thresh = await sharp(resized)
      .grayscale()
      .normalize()
      .threshold(140)
      .jpeg({ quality: 85 })
      .toBuffer();
    variants.push({ method: 'threshold', buffer: thresh });

    const inverted = await sharp(resized)
      .grayscale()
      .negate()
      .normalize()
      .sharpen()
      .jpeg({ quality: 85 })
      .toBuffer();
    variants.push({ method: 'invert_contrast', buffer: inverted });
  }

  return variants;
}

export async function perceptualHashFromBuffer(buf: Buffer): Promise<string> {
  const raw = await sharp(buf, { failOn: 'none' })
    .rotate()
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();
  return averagePerceptualHash(raw);
}

function normalizeOcrText(raw: string): string {
  return raw
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function recognizeOnce(buf: Buffer): Promise<{ text: string; confidence: number; words: SlideOcrEvidence['bboxes'] }> {
  const dir = await mkdtemp(join(tmpdir(), 'ig-visual-ocr-'));
  const path = join(dir, 'slide.jpg');
  try {
    await writeFile(path, buf);
    const worker = await getWorker();
    const result = await worker.recognize(path);
    const words: SlideOcrEvidence['bboxes'] = [];
    for (const w of result.data.words ?? []) {
      if (!w.text?.trim()) continue;
      words.push({
        text: w.text,
        x0: w.bbox?.x0 ?? 0,
        y0: w.bbox?.y0 ?? 0,
        x1: w.bbox?.x1 ?? 0,
        y1: w.bbox?.y1 ?? 0,
      });
    }
    return {
      text: result.data.text ?? '',
      confidence: (result.data.confidence ?? 0) / 100,
      words,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function runLocalFlyerOcr(input: {
  buffer: Buffer;
  slideNumber: number;
  kind?: 'image' | 'cover' | 'frame';
  frameTimestampSeconds?: number | null;
  maxBytes?: number;
}): Promise<SlideOcrEvidence> {
  const capped =
    input.maxBytes && input.buffer.length > input.maxBytes
      ? input.buffer.subarray(0, input.maxBytes)
      : input.buffer;
  const mediaHash = shortMediaHash(capped);

  const cached = readCachedOcr(mediaHash);
  if (cached) {
    return {
      ...cached,
      slideNumber: input.slideNumber,
      kind: input.kind ?? cached.kind,
      frameTimestampSeconds: input.frameTimestampSeconds ?? cached.frameTimestampSeconds,
      fromCache: true,
    };
  }

  let bestText = '';
  let bestConf = 0;
  let bestMethod = 'none';
  let bestWords: SlideOcrEvidence['bboxes'] = [];

  try {
    const variants = await preprocessFlyerVariants(capped);
    for (const v of variants) {
      const rec = await recognizeOnce(v.buffer);
      const norm = normalizeOcrText(rec.text);
      // Prefer longer event-bearing text; break ties on confidence
      const score = norm.length * 0.01 + rec.confidence;
      const bestScore = bestText.length * 0.01 + bestConf;
      if (score > bestScore && norm.length >= 4) {
        bestText = norm;
        bestConf = rec.confidence;
        bestMethod = v.method;
        bestWords = rec.words;
      }
      // Early exit when we already have strong readable text
      if (bestText.length > 40 && bestConf >= 0.45) break;
    }
  } catch (err) {
    const evidence: SlideOcrEvidence = {
      slideNumber: input.slideNumber,
      mediaHash,
      rawText: '',
      normalizedText: '',
      confidence: 0,
      engine: 'tesseract.js-local',
      preprocessMethod: 'failed',
      fromCache: false,
      bboxes: [],
      timestamp: new Date().toISOString(),
      kind: input.kind ?? 'image',
      frameTimestampSeconds: input.frameTimestampSeconds ?? null,
    };
    void err;
    return evidence;
  }

  const evidence: SlideOcrEvidence = {
    slideNumber: input.slideNumber,
    mediaHash,
    rawText: bestText,
    normalizedText: normalizeOcrText(bestText),
    confidence: bestConf,
    engine: 'tesseract.js-local',
    preprocessMethod: bestMethod,
    fromCache: false,
    bboxes: bestWords.slice(0, 200),
    timestamp: new Date().toISOString(),
    kind: input.kind ?? 'image',
    frameTimestampSeconds: input.frameTimestampSeconds ?? null,
  };

  if (evidence.normalizedText.length >= 8) {
    writeCachedOcr(evidence);
  }
  return evidence;
}

/** Stable content identity independent of CDN query params. */
export function bufferIdentity(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 24);
}
