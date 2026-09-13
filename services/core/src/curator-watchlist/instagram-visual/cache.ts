/**
 * Content-addressed media + OCR cache for Instagram visual reader.
 * Reuses OCR when media hash unchanged. Does not delete user uploads.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SlideOcrEvidence } from './types.js';

const CACHE_VERSION = 1;

function cacheRoot(): string {
  return (
    process.env.INSTAGRAM_VISUAL_CACHE_DIR?.trim() ||
    resolve(process.cwd(), '../../.cache/instagram-visual')
  );
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function mediaContentHash(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function shortMediaHash(buf: Buffer): string {
  return mediaContentHash(buf).slice(0, 16);
}

/** Simple average perceptual hash (8×8) for near-duplicate flyer detection. */
export function averagePerceptualHash(gray8x8: Uint8Array): string {
  if (gray8x8.length < 64) return createHash('sha256').update(gray8x8).digest('hex').slice(0, 16);
  let sum = 0;
  for (let i = 0; i < 64; i++) sum += gray8x8[i]!;
  const avg = sum / 64;
  let bits = '';
  for (let i = 0; i < 64; i++) bits += gray8x8[i]! >= avg ? '1' : '0';
  // Pack to hex
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    const nibble = parseInt(bits.slice(i, i + 4), 2);
    hex += nibble.toString(16);
  }
  return hex;
}

export function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const xa = parseInt(a[i]!, 16);
    const xb = parseInt(b[i]!, 16);
    let x = xa ^ xb;
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

type CachedOcr = SlideOcrEvidence & { cacheVersion: number };

function ocrPath(mediaHash: string): string {
  return join(cacheRoot(), 'ocr', `${mediaHash.slice(0, 16)}.json`);
}

export function readCachedOcr(mediaHash: string): SlideOcrEvidence | null {
  try {
    const path = ocrPath(mediaHash);
    if (!existsSync(path)) return null;
    const raw = JSON.parse(readFileSync(path, 'utf8')) as CachedOcr;
    if (raw.cacheVersion !== CACHE_VERSION) return null;
    const { cacheVersion: _, ...rest } = raw;
    return { ...rest, fromCache: true };
  } catch {
    return null;
  }
}

export function writeCachedOcr(evidence: SlideOcrEvidence): void {
  try {
    ensureDir(join(cacheRoot(), 'ocr'));
    const payload: CachedOcr = { ...evidence, fromCache: false, cacheVersion: CACHE_VERSION };
    writeFileSync(ocrPath(evidence.mediaHash), JSON.stringify(payload));
  } catch {
    /* best-effort */
  }
}

export function writeMediaBlob(mediaHash: string, buf: Buffer, ext = 'jpg'): string | null {
  try {
    const dir = join(cacheRoot(), 'media');
    ensureDir(dir);
    const path = join(dir, `${mediaHash.slice(0, 16)}.${ext}`);
    if (!existsSync(path)) writeFileSync(path, buf);
    return path;
  } catch {
    return null;
  }
}

/** Delete temp/ephemeral files older than retentionDays. Preserves OCR JSON + compact evidence. */
export function cleanupExpiredTempMedia(retentionDays = 14): { deleted: number } {
  const tempDir = join(cacheRoot(), 'temp');
  if (!existsSync(tempDir)) return { deleted: 0 };
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;
  try {
    for (const name of readdirSync(tempDir)) {
      const path = join(tempDir, name);
      try {
        const st = statSync(path);
        if (st.mtimeMs < cutoff) {
          unlinkSync(path);
          deleted += 1;
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }
  return { deleted };
}
