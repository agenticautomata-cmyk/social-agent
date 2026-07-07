import type { PublicWebsiteItem } from '@/lib/public-website';

export function MediaCard({ item }: { item: PublicWebsiteItem }) {
  const src = item.media?.thumbnailUrl ?? item.media?.url;
  const isVideo = item.media?.kind === 'video';

  return (
    <article className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
      {src ? (
        <div className="relative aspect-[4/5] overflow-hidden bg-stone-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={item.altText ?? item.caption ?? 'KC Kellie content'}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
          {isVideo ? (
            <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-2 py-1 text-xs font-medium text-white">
              Video
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex aspect-[4/5] items-center justify-center bg-stone-100 text-sm text-stone-500">
          {isVideo ? 'Video preview' : 'No image'}
        </div>
      )}
      {(item.headline || item.caption) && (
        <div className="p-4">
          {item.headline ? <h3 className="font-display text-lg font-semibold">{item.headline}</h3> : null}
          {item.caption ? <p className="mt-1 text-sm text-stone-600">{item.caption}</p> : null}
        </div>
      )}
    </article>
  );
}

export function CtaBlock({
  headline,
  caption,
  ctaLabel,
  ctaHref,
}: {
  headline?: string | null;
  caption?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
}) {
  if (!headline && !caption && !ctaLabel) return null;
  return (
    <div className="rounded-3xl bg-stone-900 px-8 py-10 text-center text-white">
      {headline ? <h2 className="font-display text-2xl font-semibold md:text-3xl">{headline}</h2> : null}
      {caption ? <p className="mx-auto mt-3 max-w-xl text-stone-300">{caption}</p> : null}
      {ctaLabel && ctaHref ? (
        <a
          href={ctaHref}
          className="mt-6 inline-block rounded-full bg-rose-500 px-6 py-3 text-sm font-semibold text-white hover:bg-rose-400"
        >
          {ctaLabel}
        </a>
      ) : null}
    </div>
  );
}
