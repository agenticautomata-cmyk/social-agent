import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { HistoryPanel } from './history-panel';

export default function HistoryPage() {
  if (!isOpportunitiesUiEnabled) notFound();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold lowercase">outreach history</h1>
        <p className="text-sm text-paper-muted mt-2 max-w-2xl">
          Sent, simulated, failed, and canceled outreach — with provider message ids when live.
        </p>
      </div>
      <HistoryPanel />
    </div>
  );
}
