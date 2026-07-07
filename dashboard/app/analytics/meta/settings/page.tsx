import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../../../lib/opportunities-ui';
import { MetaConnectionPanel } from '../../../../components/meta-connection-panel';
import { AnalyticsSettingsGearLink } from '../../../../components/analytics-settings-panel';

export default function MetaSettingsPage() {
  if (!isOpportunitiesUiEnabled) notFound();

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/analytics/tiktok" className="text-2xs text-paper-muted hover:text-paper-ink">
            ← analytics
          </Link>
          <h1 className="text-2xl font-bold lowercase mt-2">meta connection</h1>
          <p className="text-sm text-paper-muted mt-1">
            facebook page + instagram professional — read-only analytics
          </p>
        </div>
        <AnalyticsSettingsGearLink />
      </div>
      <MetaConnectionPanel />
    </div>
  );
}
