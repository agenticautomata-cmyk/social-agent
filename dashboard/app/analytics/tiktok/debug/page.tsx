import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../../../lib/opportunities-ui';
import { TikTokDebugPanel } from './tiktok-debug-panel';

export default function TikTokDebugPage() {
  if (!isOpportunitiesUiEnabled) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/analytics/tiktok" className="text-2xs text-paper-muted hover:text-paper-ink">
          ← tiktok analytics
        </Link>
        <h1 className="text-2xl font-bold lowercase mt-2">tiktok analytics debug</h1>
        <p className="text-sm text-paper-muted mt-1">verification only — metric sources and sample rows</p>
      </div>
      <TikTokDebugPanel />
    </div>
  );
}
