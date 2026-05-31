import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { OutreachQueuePanel } from '../../../components/outreach-queue-panel';

export default function OutreachQueuePage() {
  if (!isOpportunitiesUiEnabled) notFound();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold lowercase">outreach queue</h1>
        <p className="text-sm text-paper-muted mt-2 max-w-2xl">
          Drafts awaiting approval, scheduled sends, and in-progress delivery. Approved emails only
          — nothing sends without approval.
        </p>
      </div>
      <OutreachQueuePanel />
    </div>
  );
}
