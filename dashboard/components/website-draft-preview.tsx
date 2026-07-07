'use client';

import type { WebsiteDraftRecord } from '../lib/website-types';
import { draftPreviewImageUrl } from '../lib/website-ui';

type Props = {
  draft: WebsiteDraftRecord;
  compact?: boolean;
};

export function WebsiteDraftPreview({ draft, compact = false }: Props) {
  const imageUrl = draftPreviewImageUrl(draft);
  const isVideo = draft.media?.mediaKind === 'video';

  return (
    <div className={`glass-panel overflow-hidden ${compact ? '' : 'shadow-card'}`}>
      {imageUrl ? (
        <div className="relative bg-black/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={draft.altText ?? draft.title}
            className={`w-full object-contain ${compact ? 'max-h-36' : 'max-h-64'}`}
          />
          {isVideo ? (
            <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">
              Video file
            </span>
          ) : null}
        </div>
      ) : (
        <div
          className={`flex items-center justify-center bg-black/30 text-paper-muted text-sm ${
            compact ? 'h-36' : 'h-48'
          }`}
        >
          {isVideo ? 'Video — thumbnail will show on public site' : 'No image preview'}
        </div>
      )}
      <div className="p-4 space-y-2 border-t border-white/10">
        <p className="text-xs uppercase tracking-wide text-paper-muted">
          {draft.sectionLabel ?? draft.sectionId}
        </p>
        {draft.headline ? (
          <h3 className="font-semibold text-paper-ink">{draft.headline}</h3>
        ) : (
          <h3 className="font-semibold text-paper-ink">{draft.title}</h3>
        )}
        {draft.caption ? <p className="text-sm text-paper-muted">{draft.caption}</p> : null}
        {draft.ctaLabel ? (
          <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-medium text-paper-ink">
            {draft.ctaLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
