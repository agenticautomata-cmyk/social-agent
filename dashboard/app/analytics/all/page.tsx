import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { AnalyticsHubPanel } from '../analytics-hub-panel';
import { AnalyticsSettingsGearLink } from '../../../components/analytics-settings-panel';
import { PageHeader } from '../../../components/page-header';

export default function AllAnalyticsPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="All analytics"
        subtitle="Connected accounts, sync status, and platform overviews."
        action={{ label: 'TikTok dashboard', href: '/analytics/tiktok' }}
      />
      <div className="flex items-center gap-2">
        <AnalyticsSettingsGearLink />
        <Link href="/analytics/import" className="btn-ghost text-xs py-2 min-h-[36px] px-3">
          Import data
        </Link>
      </div>
      <AnalyticsHubPanel />
    </div>
  );
}
