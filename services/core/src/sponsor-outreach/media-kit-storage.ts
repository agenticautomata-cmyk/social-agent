import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const here = dirname(fileURLToPath(import.meta.url));
const defaultUploadRoot = resolve(here, '../../../../uploads/media-kits');

export const MEDIA_KIT_MAX_BYTES = 10 * 1024 * 1024;

export const MEDIA_KIT_ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.png', '.jpg', '.jpeg'] as const;

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export type SavedMediaKitFile = {
  storageFilename: string;
  storagePath: string;
  fileUrl: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
};

function uploadRoot(): string {
  return process.env.MEDIA_KIT_UPLOAD_DIR ?? defaultUploadRoot;
}

export function mediaKitPublicBaseUrl(): string {
  const explicit = process.env.MEDIA_KIT_PUBLIC_BASE ?? process.env.API_PUBLIC_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const port = process.env.API_PORT ?? '4000';
  return `http://localhost:${port}`;
}

export function buildMediaKitFileUrl(storageFilename: string): string {
  return `${mediaKitPublicBaseUrl()}/api/media-kits/files/${storageFilename}`;
}

function extensionForFile(name: string, mimeType?: string | null): string | null {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  if (MEDIA_KIT_ALLOWED_EXTENSIONS.includes(ext as (typeof MEDIA_KIT_ALLOWED_EXTENSIONS)[number])) {
    return ext;
  }
  if (mimeType === 'application/pdf') return '.pdf';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return '.docx';
  }
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/jpeg') return '.jpg';
  return null;
}

export function validateMediaKitUpload(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size <= 0) return { ok: false, error: 'Uploaded file is empty.' };
  if (file.size > MEDIA_KIT_MAX_BYTES) {
    return { ok: false, error: 'File exceeds 10MB limit.' };
  }
  const ext = extensionForFile(file.name, file.type);
  if (!ext) {
    return { ok: false, error: 'File type not allowed. Use PDF, DOCX, PNG, JPG, or JPEG.' };
  }
  return { ok: true };
}

export async function saveMediaKitFile(file: File): Promise<SavedMediaKitFile> {
  const validation = validateMediaKitUpload(file);
  if (!validation.ok) throw new Error(validation.error);

  const ext = extensionForFile(file.name, file.type)!;
  const root = uploadRoot();
  await mkdir(root, { recursive: true });

  const storageFilename = `${randomUUID()}${ext}`;
  const storagePath = join(root, storageFilename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(storagePath, buffer);

  const mimeType = file.type || MIME_BY_EXT[ext] || 'application/octet-stream';

  return {
    storageFilename,
    storagePath,
    fileUrl: buildMediaKitFileUrl(storageFilename),
    originalFilename: file.name,
    mimeType,
    fileSize: file.size,
  };
}

export async function readMediaKitFile(storageFilename: string): Promise<{
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

export async function deleteMediaKitFile(storageFilename: string | null | undefined): Promise<void> {
  if (!storageFilename) return;
  const safeName = storageFilename.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeName) return;
  try {
    await unlink(join(uploadRoot(), safeName));
  } catch {
    // File may already be gone.
  }
}
