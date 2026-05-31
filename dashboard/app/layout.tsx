import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getBranding } from '../lib/branding';
import { getTerminology } from '../lib/terminology';

function getNav() {
  const t = getTerminology();
  return [
    { href: '/', label: 'overview' },
    { href: '/campaigns', label: t.nav.campaigns },
    { href: '/queue', label: t.nav.queue },
    { href: '/approvals', label: 'approvals' },
    { href: '/runs', label: 'runs' },
  ];
}

export async function generateMetadata(): Promise<Metadata> {
  const branding = getBranding();
  return {
    title: branding.metadataTitle,
    description: branding.metadataDescription,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = getBranding();
  const nav = getNav();

  return (
    <html lang="en">
      <body className="font-mono antialiased min-h-screen flex flex-col bg-paper text-paper-ink">
        <header className="border-b-2 border-paper-ink">
          <div className="max-w-[1400px] mx-auto px-12 h-14 flex items-center gap-12">
            <Link href="/" className="font-bold tracking-tight hover:text-accent transition">
              {branding.productName}
            </Link>
            <span className="text-paper-muted text-sm">v0.3.0</span>
            <nav className="ml-auto flex gap-6 text-sm">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="text-paper-muted hover:text-paper-ink transition data-[active=true]:text-paper-ink"
                >
                  [{n.label}]
                </Link>
              ))}
            </nav>
            <span className="text-2xs text-paper-muted ml-2">demo_mode=true</span>
          </div>
        </header>
        <main className="flex-1 max-w-[1400px] mx-auto px-12 py-12 w-full">
          {children}
        </main>
        <footer className="border-t border-paper-edge mt-16">
          <div className="max-w-[1400px] mx-auto px-12 py-4 flex justify-between text-2xs text-paper-muted">
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
