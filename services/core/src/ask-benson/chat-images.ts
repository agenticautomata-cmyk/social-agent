import { createHash } from 'node:crypto';

export const ASK_BENSON_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export type AskBensonImageInput = {
  dataUrl: string;
  mimeType: string;
  fileSize: number;
  originalFilename: string;
  contentHash: string;
};

function extensionForImage(name: string, mimeType: string): string | null {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext;
  }
  return EXT_BY_MIME[mimeType] ?? null;
}

export function validateAskBensonImage(
  file: File,
): { ok: true } | { ok: false; error: string } {
  if (file.size <= 0) return { ok: false, error: 'Image is empty.' };
  if (file.size > ASK_BENSON_IMAGE_MAX_BYTES) {
    return { ok: false, error: 'Image exceeds 5MB limit.' };
  }
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.has(mime) && !extensionForImage(file.name, mime)) {
    return { ok: false, error: 'Use JPG, PNG, WebP, or GIF.' };
  }
  if (!extensionForImage(file.name, mime)) {
    return { ok: false, error: 'Use JPG, PNG, WebP, or GIF.' };
  }
  return { ok: true };
}

export async function prepareAskBensonImage(file: File): Promise<AskBensonImageInput> {
  const validation = validateAskBensonImage(file);
  if (!validation.ok) throw new Error(validation.error);

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType =
    file.type && ALLOWED_MIME.has(file.type)
      ? file.type
      : (() => {
          const ext = extensionForImage(file.name, file.type);
          if (ext === '.png') return 'image/png';
          if (ext === '.webp') return 'image/webp';
          if (ext === '.gif') return 'image/gif';
          return 'image/jpeg';
        })();

  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const contentHash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);

  return {
    dataUrl,
    mimeType,
    fileSize: file.size,
    originalFilename: file.name || 'image',
    contentHash,
  };
}
