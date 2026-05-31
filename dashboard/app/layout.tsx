import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getBranding } from '../lib/branding';
import { getNavItems, isOpportunitiesUiEnabled } from '../lib/opportunities-ui';
import { getRuntimeStatus } from '../lib/runtime-status.server';
import { PreAlphaStatusBanner } from '../components/pre-alpha-status-banner';
import { DesktopNav, MobileNav } from '../components/mobile-nav';
import { PreAlphaFeedbackFooter } from '../components/pre-alpha-shell';

export async function generateMetadata(): Promise<Metadata> {
  const branding = getBranding();
  return {
    title: branding.metadataTitle,
    description: branding.metadataDescription,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = getBranding();
  const nav = getNavItems();
  const runtime = getRuntimeStatus();
  const bensonMode = isOpportunitiesUiEnabled;

  return (
    <html lang="en">
      <body className="font-mono antialiased min-h-screen flex flex-col bg-paper text-paper-ink">
        {bensonMode && runtime.showPreAlphaBanner && <PreAlphaStatusBanner />}

        <header className="border-b-2 border-paper-ink">
          <div className="max-w-[1400px] mx-auto px-4 md:px-8 lg:px-12 py-2 md:py-0 md:h-14 flex flex-col md:flex-row md:items-center gap-2 md:gap-8">
            <div className="flex items-center gap-4 md:gap-8 shrink-0">
              <Link href="/" className="font-bold tracking-tight hover:text-accent transition text-lg">
                {branding.productName}
              </Link>
              <span className="text-paper-muted text-sm hidden sm:inline">v0.3.0-pre</span>
            </div>

            {bensonMode ? (
              <>
                <MobileNav items={nav} />
                <div className="hidden md:flex md:ml-auto md:items-center md:gap-4">
                  <DesktopNav items={nav} />
                  <span className="text-2xs text-paper-muted whitespace-nowrap">
                    demo={runtime.demoMode ? 'on' : 'off'}
                  </span>
                </div>
              </>
            ) : (
              <nav className="ml-auto hidden md:flex gap-6 text-sm">
                {nav.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="text-paper-muted hover:text-paper-ink transition"
                  >
                    [{n.label}]
                  </Link>
                ))}
              </nav>
            )}
          </div>
        </header>

        <main className="flex-1 max-w-[1400px] mx-auto px-4 md:px-8 lg:px-12 py-8 md:py-12 w-full min-w-0 overflow-x-hidden">
          {children}
          {bensonMode && <PreAlphaFeedbackFooter />}
        </main>

        <footer className="border-t border-paper-edge mt-8 md:mt-16">
          <div className="max-w-[1400px] mx-auto px-4 md:px-8 lg:px-12 py-4 flex flex-col sm:flex-row justify-between gap-2 text-2xs text-paper-muted">
            <span>{branding.footerCommand}</span>
            <a href={branding.footerLinkHref} className="link">
              {branding.footerLinkLabel}
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
