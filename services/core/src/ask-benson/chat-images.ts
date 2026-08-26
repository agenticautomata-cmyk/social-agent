import { createHash } from 'node:crypto';

export const ASK_BENSON_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Model-only instruction for image-only turns. Never persist this as the user's message. */
export const ASK_BENSON_IMAGE_INSPECT_INSTRUCTION =
  'Inspect the attached image and describe what you see. If it relates to content, events, or sponsor strategy, say how.';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
};

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

/** Duck-typed upload. Do not use `instanceof File` — Node 18 has no global File. */
export type AskBensonImageUpload = {
  name?: string;
  type?: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type AskBensonImageFieldErrorCode =
  | 'missing'
  | 'empty'
  | 'too_large'
  | 'unsupported_mime'
  | 'invalid';

export type AskBensonVisionTextPart = { type: 'text'; text: string };
export type AskBensonVisionImagePart = {
  type: 'image_url';
  image_url: { url: string; detail: 'auto' };
};
export type AskBensonVisionUserContent = string | Array<AskBensonVisionTextPart | AskBensonVisionImagePart>;

export function isAskBensonImageUpload(value: unknown): value is AskBensonImageUpload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { size?: unknown; arrayBuffer?: unknown };
  return (
    typeof candidate.size === 'number' &&
    Number.isFinite(candidate.size) &&
    typeof candidate.arrayBuffer === 'function'
  );
}

function normalizeImageMime(type: string | undefined): string {
  const raw = (type || '').trim().toLowerCase();
  if (!raw) return 'application/octet-stream';
  return MIME_ALIASES[raw] ?? raw;
}

function extensionForImage(name: string, mimeType: string): string | null {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext;
  }
  return EXT_BY_MIME[mimeType] ?? null;
}

export function validateAskBensonImage(
  file: AskBensonImageUpload,
): { ok: true } | { ok: false; error: string; code: AskBensonImageFieldErrorCode } {
  if (file.size <= 0) return { ok: false, code: 'empty', error: 'Image is empty.' };
  if (file.size > ASK_BENSON_IMAGE_MAX_BYTES) {
    return { ok: false, code: 'too_large', error: 'Image exceeds 5MB limit.' };
  }
  const mime = normalizeImageMime(file.type);
  const name = file.name || '';
  if (!ALLOWED_MIME.has(mime) && !extensionForImage(name, mime)) {
    return { ok: false, code: 'unsupported_mime', error: 'Use JPG or PNG.' };
  }
  if (!extensionForImage(name, mime)) {
    return { ok: false, code: 'unsupported_mime', error: 'Use JPG or PNG.' };
  }
  return { ok: true };
}

export async function prepareAskBensonImage(file: AskBensonImageUpload): Promise<AskBensonImageInput> {
  const validation = validateAskBensonImage(file);
  if (!validation.ok) throw new Error(validation.error);

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = normalizeImageMime(file.type);
  const mimeType = ALLOWED_MIME.has(mime)
    ? mime
    : (() => {
        const ext = extensionForImage(file.name || '', mime);
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

export async function materializeAskBensonImageField(
  value: unknown,
): Promise<
  | { ok: true; image: AskBensonImageInput }
  | { ok: false; code: AskBensonImageFieldErrorCode; error: string }
> {
  if (value == null || value === '') {
    return { ok: false, code: 'missing', error: 'Image is missing.' };
  }
  if (!isAskBensonImageUpload(value)) {
    return { ok: false, code: 'invalid', error: 'Image attachment could not be read.' };
  }
  if (value.size <= 0) {
    return { ok: false, code: 'empty', error: 'Image is empty.' };
  }
  try {
    const image = await prepareAskBensonImage(value);
    return { ok: true, image };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid image';
    const validated = validateAskBensonImage(value);
    if (!validated.ok) return { ok: false, code: validated.code, error: validated.error };
    return { ok: false, code: 'invalid', error: message };
  }
}

export function buildAskBensonVisionUserContent(input: {
  text: string;
  imageDataUrl?: string | null;
}): AskBensonVisionUserContent {
  if (input.imageDataUrl) {
    return [
      { type: 'text', text: input.text },
      { type: 'image_url', image_url: { url: input.imageDataUrl, detail: 'auto' } },
    ];
  }
  return input.text;
}

export function resolveAskBensonFollowUpContentItemId(input: {
  hasImage: boolean;
  requestContentItemId?: string | null;
  inheritedContentItemId?: string | null;
}): string | undefined {
  if (input.requestContentItemId) return input.requestContentItemId;
  if (input.hasImage) return undefined;
  return input.inheritedContentItemId ?? undefined;
}

export function shouldUseImageListingShortCircuit(input: {
  hasImage: boolean;
  userMessage: string;
  collection: {
    items: unknown[];
    created: number;
    updated: number;
    extractedCount: number;
  } | null;
}): boolean {
  if (!input.hasImage || !input.collection) return false;
  if (input.userMessage.trim()) return false;
  const collection = input.collection;
  return (
    collection.items.length > 0 ||
    collection.created > 0 ||
    collection.updated > 0 ||
    collection.extractedCount > 0
  );
}
