/**
 * Durable creator-asset storage + public-safe derivatives.
 *
 * Originals stay on disk for Kellie's archive. Public/web/print/thumb derivatives are
 * re-encoded with sharp (rotate + strip metadata) so GPS/device EXIF never leave the
 * private store. No AI face modification — only orientation fix and resize.
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { extensionForSniffedMime, sniffImageMime, type SniffedImageMime } from './mime-sniff.js';

export const CREATOR_ASSET_MAX_BYTES = 12 * 1024 * 1024;

export type CreatorAssetDerivatives = {
  publicFilename: string;
  thumbFilename: string;
  webFilename: string;
  printFilename: string;
  widthPx: number;
  heightPx: number;
  exifStripped: true;
};

function uploadRoot(): string {
  return (
    process.env.CREATOR_ASSETS_UPLOAD_DIR?.trim() ||
    join(process.cwd(), 'uploads', 'creator-assets')
  );
}

export async function ensureCreatorAssetRoot(): Promise<string> {
  const root = uploadRoot();
  await mkdir(root, { recursive: true });
  return root;
}

export function contentHashOf(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Validates bytes + claimed type. Sniffed MIME must match an allowed image type;
 * claimed MIME is advisory only when sniff succeeds.
 */
export function validateCreatorAssetBytes(
  buffer: Buffer,
  claimedMime?: string | null,
):
  | { ok: true; sniffed: SniffedImageMime }
  | { ok: false; error: string; code: 'empty' | 'too_large' | 'unsupported_mime' | 'mime_mismatch' } {
  if (buffer.length <= 0) return { ok: false, code: 'empty', error: 'Image is empty.' };
  if (buffer.length > CREATOR_ASSET_MAX_BYTES) {
    return { ok: false, code: 'too_large', error: 'Image exceeds 12MB limit.' };
  }
  const sniffed = sniffImageMime(buffer);
  if (!sniffed) {
    return {
      ok: false,
      code: 'unsupported_mime',
      error: 'File is not a recognizable JPEG, PNG, WEBP, or GIF.',
    };
  }
  const claimed = (claimedMime ?? '').trim().toLowerCase();
  if (
    claimed &&
    claimed !== 'application/octet-stream' &&
    claimed !== sniffed &&
    !(claimed === 'image/jpg' && sniffed === 'image/jpeg')
  ) {
    // Soft mismatch warning path: sniff wins; we still accept but callers can log.
    // Hard-reject only when claimed is an image type that contradicts sniff.
    if (claimed.startsWith('image/') && claimed !== sniffed) {
      return {
        ok: false,
        code: 'mime_mismatch',
        error: `Claimed type ${claimed} does not match file contents (${sniffed}).`,
      };
    }
  }
  return { ok: true, sniffed };
}

/** Persist original bytes under a UUID filename. */
export async function saveOriginalAsset(input: {
  buffer: Buffer;
  sniffed: SniffedImageMime;
}): Promise<{ storageFilename: string; absolutePath: string; contentHash: string }> {
  const root = await ensureCreatorAssetRoot();
  const ext = extensionForSniffedMime(input.sniffed);
  const storageFilename = `${randomUUID()}${ext}`;
  const absolutePath = join(root, storageFilename);
  await writeFile(absolutePath, input.buffer);
  return {
    storageFilename,
    absolutePath,
    contentHash: contentHashOf(input.buffer),
  };
}

/**
 * Build EXIF-stripped responsive crops. Uses sharp rotate() which applies orientation
 * then strips EXIF. No face detection or generative edits.
 */
export async function buildPublicDerivatives(input: {
  buffer: Buffer;
  baseId: string;
}): Promise<CreatorAssetDerivatives> {
  const sharp = (await import('sharp')).default;
  const root = await ensureCreatorAssetRoot();

  // Normalize orientation and strip metadata by re-encoding to JPEG for public use.
  const pipeline = sharp(input.buffer).rotate();
  const meta = await pipeline.metadata();
  const widthPx = meta.width ?? 0;
  const heightPx = meta.height ?? 0;

  const publicFilename = `${input.baseId}-public.jpg`;
  const thumbFilename = `${input.baseId}-thumb.jpg`;
  const webFilename = `${input.baseId}-web.jpg`;
  const printFilename = `${input.baseId}-print.jpg`;

  await sharp(input.buffer)
    .rotate()
    .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(join(root, publicFilename));

  await sharp(input.buffer)
    .rotate()
    .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(join(root, thumbFilename));

  await sharp(input.buffer)
    .rotate()
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(join(root, webFilename));

  await sharp(input.buffer)
    .rotate()
    .resize(3600, 3600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(join(root, printFilename));

  return {
    publicFilename,
    thumbFilename,
    webFilename,
    printFilename,
    widthPx,
    heightPx,
    exifStripped: true,
  };
}

export async function readCreatorAssetFile(storageFilename: string): Promise<Buffer> {
  const root = await ensureCreatorAssetRoot();
  // Prevent path traversal — only basename.
  const safe = storageFilename.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe || safe !== storageFilename) {
    throw new Error('Invalid storage filename.');
  }
  return readFile(join(root, safe));
}

export async function deleteCreatorAssetFiles(filenames: Array<string | null | undefined>): Promise<void> {
  const root = await ensureCreatorAssetRoot();
  for (const name of filenames) {
    if (!name) continue;
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, '');
    if (!safe || safe !== name) continue;
    try {
      await unlink(join(root, safe));
    } catch {
      // Best-effort cleanup.
    }
  }
}
