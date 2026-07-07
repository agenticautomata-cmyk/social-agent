import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../../../lib/opportunities-ui';
import { TikTokConnectionPanel } from '../../../../components/tiktok-connection-panel';

export default function TikTokConnectPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="text-2xs text-paper-muted mb-2">
          <Link href="/analytics/tiktok" className="hover:text-paper-ink">
            analytics
          </Link>
          {' / '}
          <Link href="/analytics/tiktok" className="hover:text-paper-ink">
            tiktok
          </Link>
          {' / connect'}
        </div>
        <h1 className="text-2xl font-bold lowercase">connect tiktok</h1>
        <p className="text-sm text-paper-muted mt-2 max-w-3xl">
          Link Kellie&apos;s TikTok account so Benson can use approved API scopes later. OAuth does
          not replace manual CSV import — both paths stay available.
        </p>
      </div>

      <TikTokConnectionPanel showSetupDetails />

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/analytics/tiktok/settings" className="bracket hover:text-accent">
          connection settings →
        </Link>
        <Link href="/analytics/tiktok" className="bracket hover:text-accent">
          tiktok dashboard →
        </Link>
      </div>
    </div>
  );
}
