import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { env } from '../env.js';

const here = dirname(fileURLToPath(import.meta.url));
const defaultMediaRoot = resolve(here, '../../../../uploads/intake-media');

export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);
export const AUDIO_EXTENSIONS = new Set(['.m4a', '.mp3', '.wav', '.aac', '.ogg', '.flac']);

export const VIDEO_MIME_PREFIXES = ['video/'];
export const AUDIO_MIME_PREFIXES = ['audio/'];

export type SavedIntakeMedia = {
  temp_file_path: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  intake_type: 'video' | 'audio';
};

function mediaRoot(): string {
  return process.env.INTAKE_MEDIA_DIR ?? defaultMediaRoot;
}

export function isVideoMime(mime: string): boolean {
  return VIDEO_MIME_PREFIXES.some((p) => mime.toLowerCase().startsWith(p));
}

export function isAudioMime(mime: string): boolean {
  return AUDIO_MIME_PREFIXES.some((p) => mime.toLowerCase().startsWith(p));
}

export function resolveMediaIntakeType(
  mime: string,
  filename: string,
): 'video' | 'audio' | null {
  if (isVideoMime(mime)) return 'video';
  if (isAudioMime(mime)) return 'audio';
  const ext = filename.includes('.')
    ? filename.slice(filename.lastIndexOf('.')).toLowerCase()
    : '';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return null;
}

export function maxBytesForMediaType(type: 'video' | 'audio'): number {
  return type === 'video' ? env.INTAKE_VIDEO_MAX_BYTES : env.INTAKE_AUDIO_MAX_BYTES;
}

export async function saveIntakeMedia(file: File): Promise<SavedIntakeMedia> {
  const mime = file.type || 'application/octet-stream';
  const intakeType = resolveMediaIntakeType(mime, file.name);
  if (!intakeType) {
    throw new Error('unsupported_media_type');
  }

  const maxBytes = maxBytesForMediaType(intakeType);
  if (file.size > maxBytes) {
    throw new Error('too_large');
  }

  const root = mediaRoot();
  await mkdir(root, { recursive: true });

  const ext = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    : intakeType === 'video'
      ? '.mp4'
      : '.m4a';
  const safeExt =
    intakeType === 'video'
      ? VIDEO_EXTENSIONS.has(ext)
        ? ext
        : '.mp4'
      : AUDIO_EXTENSIONS.has(ext)
        ? ext
        : '.m4a';

  const filename = `${randomUUID()}${safeExt}`;
  const fullPath = join(root, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buffer);

  return {
    temp_file_path: fullPath,
    original_filename: file.name || filename,
    mime_type: mime,
    file_size: file.size,
    intake_type: intakeType,
  };
}

export async function deleteIntakeMedia(path: string | null | undefined): Promise<void> {
  if (!path?.trim()) return;
  try {
    await unlink(path);
  } catch {
    /* already removed */
  }
}
