import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

type PublicPageProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function PublicPage({ title, description, children }: PublicPageProps) {
  return (
    <article className="mx-auto w-full max-w-2xl">
      <header className="glass-panel mb-8 p-6">
        <Link href="/" className="mb-4 inline-flex items-center gap-2 font-bold tracking-tight">
          <Image
            src="/icons/benson-logo.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-xl object-contain ring-1 ring-white/10"
          />
          <span className="gradient-text">Benson</span>
        </Link>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl text-paper-ink">{title}</h1>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-paper-muted sm:text-base">{description}</p>
        ) : null}
      </header>

      <div className="glass-panel p-6 space-y-5 text-sm leading-relaxed sm:text-base [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-paper-ink [&_p]:text-paper-muted [&_ul]:list-none [&_ul]:space-y-3 [&_ul]:pl-0 [&_li]:flex [&_li]:gap-2">
        {children}
      </div>

      <footer className="mt-10 pt-6 text-sm text-paper-muted">
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/" className="link">
            Home
          </Link>
          <Link href="/privacy" className="link">
            Privacy
          </Link>
          <Link href="/terms" className="link">
            Terms
          </Link>
          <Link href="/home" className="link">
            Open studio
          </Link>
        </nav>
        <p className="mt-4 text-xs">© {new Date().getFullYear()} Benson · Kansas City creator studio</p>
      </footer>
    </article>
  );
}
