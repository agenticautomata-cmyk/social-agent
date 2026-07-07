import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Benson — Kansas City creator studio',
  description:
    'Benson helps Kellie plan Kansas City content, track TikTok analytics, and manage sponsor opportunities.',
};

export default function PublicLandingPage() {
  return (
    <article className="mx-auto w-full max-w-2xl">
      <header className="glass-panel-strong gradient-border mb-8 p-6 md:p-8">
        <div className="mb-6 inline-flex items-center gap-4">
          <Image
            src="/icons/benson-logo.png"
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-2xl object-contain ring-1 ring-white/10"
            priority
          />
          <div>
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl gradient-text">Benson</h1>
            <p className="text-sm text-paper-muted sm:text-base mt-1">
              Kansas City creator studio
            </p>
          </div>
        </div>
        <p className="text-base leading-relaxed text-paper-muted">
          Benson is Kellie&apos;s private creator command center — TikTok analytics, KC
          opportunities, sponsor pipeline, and an AI operator who actually knows what&apos;s going
          on.
        </p>
      </header>

      <section className="glass-panel p-6 space-y-4 text-sm leading-relaxed sm:text-base">
        <h2 className="text-lg font-semibold text-paper-ink">What Benson does</h2>
        <ul className="space-y-3 text-paper-muted">
          <li className="flex gap-3">
            <span className="text-accent shrink-0">◆</span>
            Syncs TikTok metrics through the official Display API after you connect.
          </li>
          <li className="flex gap-3">
            <span className="text-accent shrink-0">◆</span>
            Finds KC events and content opportunities — paste a link, get scored picks.
          </li>
          <li className="flex gap-3">
            <span className="text-accent shrink-0">◆</span>
            Helps prioritize what to film, post, and pitch to sponsors.
          </li>
        </ul>

        <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:flex-wrap">
          <Link href="/home" className="btn-primary">
            Open studio
          </Link>
          <Link href="/privacy" className="btn-ghost">
            Privacy
          </Link>
          <Link href="/terms" className="btn-ghost">
            Terms
          </Link>
        </div>
      </section>

      <footer className="mt-10 pt-6 text-sm text-paper-muted">
        <p>Contact: support@kckellie.com</p>
        <p className="mt-2 text-xs">© {new Date().getFullYear()} Benson</p>
      </footer>
    </article>
  );
}
