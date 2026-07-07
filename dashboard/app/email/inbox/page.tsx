import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { EmailInboxPanel } from './email-inbox-panel';

export default function EmailInboxPage() {
  if (!isOpportunitiesUiEnabled) notFound();

  return (
    <main className="page-shell max-w-4xl">
      <div className="section-mark mb-3"><span>// § email inbox</span></div>
      <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">inbox</h1>
      <p className="text-paper-muted mt-2 max-w-2xl">
        Sponsor replies to Benson pitches — plus Primary inbox summaries on Telegram.
      </p>
      <div className="mt-8">
        <EmailInboxPanel />
      </div>
    </main>
  );
}
