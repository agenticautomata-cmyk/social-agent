import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { OpportunityMapPanel } from '../../../components/opportunity-map-panel';

export default function OpportunityMapPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <main className="page-shell max-w-6xl mx-auto py-10 px-4">
      <Suspense fallback={<p className="text-sm text-paper-muted italic">// loading opportunity map…</p>}>
        <OpportunityMapPanel />
      </Suspense>
    </main>
  );
}
