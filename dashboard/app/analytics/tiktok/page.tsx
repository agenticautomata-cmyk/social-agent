import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { TikTokAnalyticsPanel } from './tiktok-analytics-panel';
import { PageHeader } from '../../../components/page-header';
import { AnalyticsSettingsGearLink } from '../../../components/analytics-settings-panel';

export default function TikTokAnalyticsPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="TikTok analytics"
        subtitle="Top videos, categories, posting times, and what Benson recommends from your metrics."
        action={{ label: 'All platforms', href: '/analytics/all' }}
      />
      <div className="flex flex-wrap items-center gap-2 -mt-4">
        <AnalyticsSettingsGearLink />
        <Link href="/analytics/tiktok/connect" className="btn-ghost text-xs py-2 min-h-[36px] px-3">
          Connect TikTok
        </Link>
        <Link href="/analytics/tiktok/operator" className="btn-primary text-xs py-2 min-h-[36px] px-3">
          Command center
        </Link>
        <Link href="/analytics/import" className="btn-ghost text-xs py-2 min-h-[36px] px-3">
          Import CSV
        </Link>
      </div>
      <TikTokAnalyticsPanel />
    </div>
  );
}
