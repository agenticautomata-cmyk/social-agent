import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { InventoryReviewPanel } from './inventory-review-panel';

export default function InventoryReviewPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <Suspense fallback={<p className="text-sm text-paper-muted italic">// loading inventory…</p>}>
      <InventoryReviewPanel />
    </Suspense>
  );
}
