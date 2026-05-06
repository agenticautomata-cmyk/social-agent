// Brand icons (IG / TikTok / GitHub) only — no UI icon vocabulary elsewhere.
// Status, navigation, actions are text in this design.

import { siInstagram, siTiktok, siGithub } from 'simple-icons';

export function InstagramIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-label="Instagram">
      <path d={siInstagram.path} />
    </svg>
  );
}

export function TikTokIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-label="TikTok">
      <path d={siTiktok.path} />
    </svg>
  );
}

export function GitHubIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-label="GitHub">
      <path d={siGithub.path} />
    </svg>
  );
}

export function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  if (platform === 'instagram') return <InstagramIcon className={className} />;
  if (platform === 'tiktok') return <TikTokIcon className={className} />;
  return null;
}
