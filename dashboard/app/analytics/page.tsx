import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { AnalyticsHubPanel } from './analytics-hub-panel';

export default function AnalyticsPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold lowercase">creator analytics</h1>
          <p className="text-sm text-paper-muted mt-2 max-w-2xl">
            Import TikTok performance data and learn what content, locations, and posting times
            drive the best results for Kellie&apos;s page.
          </p>
        </div>
        <Link href="/analytics/import" className="bracket text-sm hover:text-accent">
          import data →
        </Link>
      </div>
      <AnalyticsHubPanel />
    </div>
  );
}
