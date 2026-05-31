import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { ShortlistPanel } from './shortlist-panel';

export default function ShortlistPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <Link href="/planner" className="text-2xs text-paper-muted hover:text-paper-ink">
            ← planner
          </Link>
          <h1 className="text-2xl font-bold lowercase mt-2">shortlist</h1>
          <p className="text-sm text-paper-muted mt-2 max-w-2xl">
            Saved opportunities organized by planning board, status, and date.
          </p>
        </div>
        <Link href="/planner/week" className="bracket text-sm hover:text-accent">
          weekly plan →
        </Link>
      </div>
      <Suspense fallback={<div className="py-12 text-paper-muted italic">// loading…</div>}>
        <ShortlistPanel />
      </Suspense>
    </div>
  );
}
