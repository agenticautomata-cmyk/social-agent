import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { ZeroItemSourcesPanel } from './zero-item-sources-panel';

export default function ZeroItemSourcesPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold lowercase">zero item sources</h1>
        <p className="text-sm text-paper-muted mt-2 max-w-3xl">
          Configured sources with no content_items yet — last run, status, and likely reason.
        </p>
      </div>
      <ZeroItemSourcesPanel />
    </div>
  );
}
