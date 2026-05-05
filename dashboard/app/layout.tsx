import type { Metadata } from 'next';
import Link from 'next/link';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import {
  LayoutDashboard,
  ListTodo,
  ListChecks,
  Inbox,
  History,
  Sparkles,
} from 'lucide-react';
import { GitHubIcon } from '../components/icons';
import './globals.css';

export const metadata: Metadata = {
  title: 'Social Agent — autonomous social-video pipeline',
  description:
    'Self-running AI content agent for short-form social video. State-machine in Postgres, TypeScript workers, n8n orchestration.',
};

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campaigns', icon: ListTodo },
  { href: '/queue', label: 'Queue', icon: ListChecks },
  { href: '/approvals', label: 'Approvals', icon: Inbox },
  { href: '/runs', label: 'Runs', icon: History },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased min-h-screen flex flex-col bg-bg">
        <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-gradient-to-br from-accent to-accent-600 flex items-center justify-center shadow-glow-accent">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="font-mono text-sm font-semibold tracking-tight text-zinc-100">
                social-agent
              </span>
            </Link>
            <nav className="flex gap-0.5">
              {NAV.map((n) => {
                const Icon = n.icon;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="px-3 py-1.5 text-sm text-zinc-400 rounded-md hover:bg-bg-subtle hover:text-zinc-100 transition flex items-center gap-2"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs font-mono text-emerald-400/80 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
                demo mode
              </span>
              <a
                href="https://github.com/anthonyonazure/social-agent"
                target="_blank"
                rel="noreferrer"
                className="text-zinc-500 hover:text-zinc-200 transition"
              >
                <GitHubIcon className="h-4 w-4" />
              </a>
            </div>
          </div>
        </header>
        <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full animate-fade-in">
          {children}
        </main>
      </body>
    </html>
  );
}
