import { clientApiUrl } from './client-api';
import type { WebsiteDraftRecord } from './website-types';

/** Form control styled for Benson's dark studio theme. */
export const websiteFieldClass =
  'mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-paper-ink placeholder:text-paper-muted focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50';

export const websitePanelClass = 'glass-panel p-5';

export const websiteMutedClass = 'text-sm text-paper-muted';

export const websiteTitleClass = 'text-2xl font-bold text-paper-ink';

export const websiteLabelClass = 'text-sm font-medium text-paper-ink';

/** Dashboard-safe URL for private website media files (never localhost). */
export function resolveWebsiteFileUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const filename = url.split('/').pop()?.split('?')[0];
  if (!filename) return null;
  return clientApiUrl(`/api/website/files/${encodeURIComponent(filename)}`);
}

export function draftPreviewImageUrl(draft: WebsiteDraftRecord): string | null {
  const thumb = resolveWebsiteFileUrl(draft.media?.thumbnailUrl);
  if (thumb) return thumb;
  if (draft.media?.mediaKind === 'image') {
    return resolveWebsiteFileUrl(draft.media.fileUrl);
  }
  return null;
}

/** Strip raw Zod/JSON validation errors from API messages. */
export function friendlyWebsiteError(message: string): string {
  if (message.includes('invalid_type') || message.includes('expected string')) {
    return 'Benson revision failed validation. Try again or edit the classification fields below.';
  }
  if (message.startsWith('[') && message.includes('"code"')) {
    return 'Benson revision failed. Try again or edit the fields below manually.';
  }
  return message;
}
