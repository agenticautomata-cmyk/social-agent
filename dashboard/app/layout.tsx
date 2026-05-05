import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Social Agent — Dashboard',
  description: 'Self-running AI content agent for short-form social video',
};

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/queue', label: 'Queue' },
  { href: '/approvals', label: 'Approvals' },
  { href: '/runs', label: 'Runs' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased min-h-screen flex flex-col">
        <header className="border-b border-border bg-bg-card">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-8">
            <Link href="/" className="font-mono text-sm font-semibold tracking-tight">
              <span className="text-accent">/</span>social-agent
            </Link>
            <nav className="flex gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="px-3 py-1.5 text-sm text-zinc-300 rounded-md hover:bg-bg-subtle hover:text-zinc-100"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto text-xs font-mono text-zinc-500">
              demo mode · v0.1
            </div>
          </div>
        </header>
        <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">{children}</main>
      </body>
    </html>
  );
}
