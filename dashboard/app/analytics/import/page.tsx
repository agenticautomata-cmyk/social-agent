import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { AnalyticsImportPanel } from './analytics-import-panel';

export default function AnalyticsImportPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="text-2xs text-paper-muted mb-2">
          <Link href="/analytics" className="hover:text-paper-ink">
            analytics
          </Link>
          {' / import'}
        </div>
        <h1 className="text-2xl font-bold lowercase">import analytics data</h1>
        <p className="text-sm text-paper-muted mt-2 max-w-3xl">
          Upload a TikTok Studio / Creator Center CSV export, paste JSON, or enter a single video
          manually. No TikTok OAuth required.
        </p>
      </div>
      <AnalyticsImportPanel />
    </div>
  );
}
