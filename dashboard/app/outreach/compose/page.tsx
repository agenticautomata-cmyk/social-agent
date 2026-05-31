import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { ComposePanel } from './compose-panel';

export default function ComposePage() {
  if (!isOpportunitiesUiEnabled) notFound();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold lowercase">compose outreach</h1>
        <p className="text-sm text-paper-muted mt-2 max-w-2xl">
          Select a sponsor, media kit, and template. Preview before scheduling — no real emails sent in Phase A.
        </p>
      </div>
      <ComposePanel />
    </div>
  );
}
