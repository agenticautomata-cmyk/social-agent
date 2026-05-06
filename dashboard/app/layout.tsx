import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'social-agent · autonomous social-video pipeline',
  description:
    'Self-running AI content agent for short-form social video. State-machine in Postgres, TypeScript workers, n8n orchestration.',
};

const NAV = [
  { href: '/', label: 'overview' },
  { href: '/campaigns', label: 'campaigns' },
  { href: '/queue', label: 'queue' },
  { href: '/approvals', label: 'approvals' },
  { href: '/runs', label: 'runs' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-mono antialiased min-h-screen flex flex-col bg-paper text-paper-ink">
        <header className="border-b-2 border-paper-ink">
          <div className="max-w-[1400px] mx-auto px-12 h-14 flex items-center gap-12">
            <Link href="/" className="font-bold tracking-tight hover:text-accent transition">
              social-agent
            </Link>
            <span className="text-paper-muted text-sm">v0.3.0</span>
            <nav className="ml-auto flex gap-6 text-sm">
              {NAV.map((n) => (
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
            <span>$ pnpm dev:all  ·  127.0.0.1:3000</span>
            <a href="https://github.com/anthonyonazure/social-agent" className="link">github.com/anthonyonazure/social-agent</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
