import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  WEBSITE_IMAGE_EXTENSIONS,
  WEBSITE_VIDEO_EXTENSIONS,
} from './constants.js';
import { getWebsiteSettings } from './settings.js';

const here = dirname(fileURLToPath(import.meta.url));
const defaultUploadRoot = resolve(here, '../../../../uploads/website-media');

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

export type SavedWebsiteMediaFile = {
  storageFilename: string;
  thumbnailFilename: string | null;
  storagePath: string;
  fileUrl: string;
  thumbnailUrl: string | null;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  mediaKind: 'image' | 'video';
};

function uploadRoot(): string {
  return process.env.WEBSITE_MEDIA_UPLOAD_DIR ?? defaultUploadRoot;
}

export function websiteMediaPublicBaseUrl(): string {
  const explicit =
    process.env.WEBSITE_MEDIA_PUBLIC_BASE ??
    process.env.API_PUBLIC_URL ??
    process.env.PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const port = process.env.API_PORT ?? '4000';
  return `http://localhost:${port}`;
}

export function buildWebsiteMediaFileUrl(storageFilename: string, publicOnly = false): string {
  const base = publicOnly ? websiteMediaPublicBaseUrl() : websiteMediaPublicBaseUrl();
  const prefix = publicOnly ? '/api/public/website/media' : '/api/website/files';
  return `${base}${prefix}/${storageFilename}`;
}

function extensionForFile(name: string, mimeType?: string | null): string | null {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  if (
    WEBSITE_IMAGE_EXTENSIONS.includes(ext as (typeof WEBSITE_IMAGE_EXTENSIONS)[number]) ||
    WEBSITE_VIDEO_EXTENSIONS.includes(ext as (typeof WEBSITE_VIDEO_EXTENSIONS)[number])
  ) {
    return ext;
  }
  if (mimeType?.startsWith('image/')) {
    if (mimeType.includes('png')) return '.png';
    if (mimeType.includes('webp')) return '.webp';
    return '.jpg';
  }
  if (mimeType?.startsWith('video/')) {
    if (mimeType.includes('webm')) return '.webm';
    if (mimeType.includes('quicktime')) return '.mov';
    return '.mp4';
  }
  return null;
}

export function mediaKindForExt(ext: string): 'image' | 'video' | null {
  if (WEBSITE_IMAGE_EXTENSIONS.includes(ext as (typeof WEBSITE_IMAGE_EXTENSIONS)[number])) return 'image';
  if (WEBSITE_VIDEO_EXTENSIONS.includes(ext as (typeof WEBSITE_VIDEO_EXTENSIONS)[number])) return 'video';
  return null;
}

export async function validateWebsiteMediaUpload(
  file: File,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (file.size <= 0) return { ok: false, error: 'Uploaded file is empty.' };
  const settings = await getWebsiteSettings();
  const maxBytes = settings.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  if (file.size > maxBytes) {
    return { ok: false, error: `File exceeds ${Math.round(maxBytes / 1024 / 1024)}MB limit.` };
  }
  const ext = extensionForFile(file.name, file.type);
  if (!ext || !mediaKindForExt(ext)) {
    return {
      ok: false,
      error: 'File type not allowed. Use JPG, PNG, WEBP, MP4, MOV, or WEBM.',
    };
  }
  return { ok: true };
}

async function maybeCreateImageThumbnail(
  buffer: Buffer,
  storageFilename: string,
  ext: string,
): Promise<string | null> {
  try {
    const sharp = (await import('sharp')).default;
    const thumbName = storageFilename.replace(ext, `-thumb${ext}`);
    const thumbPath = join(uploadRoot(), thumbName);
    await sharp(buffer)
      .rotate()
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .toFile(thumbPath);
    return thumbName;
  } catch {
    return null;
  }
}

export async function saveWebsiteMediaFile(file: File): Promise<SavedWebsiteMediaFile> {
  const validation = await validateWebsiteMediaUpload(file);
  if (!validation.ok) throw new Error(validation.error);

  const ext = extensionForFile(file.name, file.type)!;
  const mediaKind = mediaKindForExt(ext)!;
  const root = uploadRoot();
  await mkdir(root, { recursive: true });

  const storageFilename = `${randomUUID()}${ext}`;
  const storagePath = join(root, storageFilename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(storagePath, buffer);

  const mimeType = file.type || MIME_BY_EXT[ext] || 'application/octet-stream';
  let thumbnailFilename: string | null = null;
  if (mediaKind === 'image') {
    thumbnailFilename = await maybeCreateImageThumbnail(buffer, storageFilename, ext);
  }

  return {
    storageFilename,
    thumbnailFilename,
    storagePath,
    fileUrl: buildWebsiteMediaFileUrl(storageFilename),
    thumbnailUrl: thumbnailFilename ? buildWebsiteMediaFileUrl(thumbnailFilename) : null,
    originalFilename: file.name,
    mimeType,
    fileSize: file.size,
    mediaKind,
  };
}

export async function readWebsiteMediaFile(storageFilename: string): Promise<{
  buffer: Buffer;
  mimeType: string;
} | null> {
  const safeName = storageFilename.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeName || safeName !== storageFilename) return null;

  const fullPath = join(uploadRoot(), safeName);
  try {
    const buffer = await readFile(fullPath);
    const ext = safeName.slice(safeName.lastIndexOf('.')).toLowerCase();
    return { buffer, mimeType: MIME_BY_EXT[ext] ?? 'application/octet-stream' };
  } catch {
    return null;
  }
}

export async function deleteWebsiteMediaFile(storageFilename: string | null | undefined): Promise<void> {
  if (!storageFilename) return;
  const safeName = storageFilename.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeName) return;
  try {
    await unlink(join(uploadRoot(), safeName));
  } catch {
    /* gone */
  }
}
