import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { GmailConnectionPanel } from '../../../components/gmail-connection-panel';

export default function EmailSettingsPage() {
  if (!isOpportunitiesUiEnabled) notFound();

  return (
    <main className="page-shell max-w-3xl">
      <div className="section-mark mb-3"><span>// § email settings</span></div>
      <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">settings</h1>
      <p className="text-paper-muted mt-2">Connect Kellie&apos;s Gmail inbox for approved sponsor outreach.</p>
      <div className="mt-8">
        <GmailConnectionPanel />
      </div>
    </main>
  );
}
