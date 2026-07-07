import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';

export default function EmailHubPage() {
  if (!isOpportunitiesUiEnabled) notFound();

  const links = [
    { href: '/email/approvals', label: 'Approvals', desc: 'Benson-drafted pitches waiting for Kellie' },
    { href: '/email/inbox', label: 'Inbox', desc: 'Sponsor replies + monitored threads' },
    { href: '/outreach/compose', label: 'Compose', desc: 'Manual one-off outreach' },
    { href: '/outreach/history', label: 'History', desc: 'Sent and simulated sends' },
    { href: '/email/settings', label: 'Settings', desc: 'Gmail connection + send mode' },
  ];

  return (
    <main className="page-shell max-w-4xl">
      <div className="section-mark mb-3"><span>// § email</span></div>
      <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">email</h1>
      <p className="text-paper-muted mt-2">Benson drafts. Kellie approves. Nothing sends without you.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="border-2 border-paper-edge p-5 hover:border-accent transition-colors"
          >
            <div className="text-xl font-bold">{link.label}</div>
            <p className="text-sm text-paper-muted mt-2">{link.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
