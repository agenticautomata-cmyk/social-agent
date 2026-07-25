'use client';

type DraftVideoCardProps = {
  title: string;
  subtitle?: string | null;
  /** Optional preview image URL (cover frame when available). */
  previewUrl?: string | null;
  compact?: boolean;
  className?: string;
};

function VideoGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m15 10 4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14M5 18h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z"
      />
    </svg>
  );
}

/** Video placeholder with human title overlaid — hides raw device filenames like VID_….mp4. */
export function DraftVideoCard({
  title,
  subtitle,
  previewUrl,
  compact = false,
  className = '',
}: DraftVideoCardProps) {
  const minHeightClass = compact ? 'min-h-44' : 'min-h-56';

  return (
    <div
      className={`relative overflow-hidden border-2 border-paper-ink bg-black ${minHeightClass} ${className}`}
    >
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-paper-muted/40">
          <VideoGlyph className="h-14 w-14" />
        </div>
      )}

      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent px-4 pb-4 pt-20"
        aria-hidden={false}
      >
        <p className="text-2xs uppercase tracking-wider text-white/60 mb-1">suggested title</p>
        <h3 className="text-lg sm:text-xl font-bold text-white lowercase leading-snug line-clamp-3">
          {title.toLowerCase()}
        </h3>
        {subtitle ? (
          <p className="text-2xs text-white/70 mt-1.5 lowercase">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}
