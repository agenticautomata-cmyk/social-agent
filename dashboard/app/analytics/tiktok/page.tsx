import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { TikTokAnalyticsPanel } from './tiktok-analytics-panel';

export default function TikTokAnalyticsPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="text-2xs text-paper-muted mb-2">
            <Link href="/analytics" className="hover:text-paper-ink">
              analytics
            </Link>
            {' / tiktok'}
          </div>
          <h1 className="text-2xl font-bold lowercase">tiktok analytics</h1>
          <p className="text-sm text-paper-muted mt-2 max-w-3xl">
            What performs best on Kellie&apos;s TikTok — top videos, categories, locations, posting
            times, sponsor content, and Benson recommendations from imported data.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/analytics/tiktok/connect" className="bracket hover:text-accent">
            connect tiktok →
          </Link>
          <Link href="/analytics/import" className="bracket hover:text-accent">
            import data →
          </Link>
        </div>
      </div>
      <TikTokAnalyticsPanel />
    </div>
  );
}
