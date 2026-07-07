import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { AnalyticsSettingsPanel } from '../../../components/analytics-settings-panel';

export default function AnalyticsSettingsPage() {
  if (!isOpportunitiesUiEnabled) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/analytics/tiktok" className="text-2xs text-paper-muted hover:text-paper-ink">
          ← analytics
        </Link>
        <h1 className="text-2xl font-bold lowercase mt-2">analytics settings</h1>
        <p className="text-sm text-paper-muted mt-1">
          choose which platforms appear in Benson until business accounts are ready
        </p>
      </div>
      <AnalyticsSettingsPanel />
    </div>
  );
}
