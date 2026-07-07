import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { isOpportunitiesUiEnabled } from '../../../../lib/opportunities-ui';
import { PageHeader } from '../../../../components/page-header';
import { TikTokOperatorPanel } from './tiktok-operator-panel';

export default function TikTokOperatorPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="TikTok command center"
        subtitle="Benson as your TikTok operator — analyze, prepare, hand off, track, and plan the next move."
        action={{ label: 'Analytics', href: '/analytics/tiktok' }}
      />
      <div className="flex flex-wrap gap-2 -mt-4">
        <Link href="/analytics/tiktok" className="btn-ghost text-xs py-2 min-h-[36px] px-3">
          TikTok analytics
        </Link>
        <Link href="/planner" className="btn-ghost text-xs py-2 min-h-[36px] px-3">
          Planner
        </Link>
        <Link href="/actions" className="btn-ghost text-xs py-2 min-h-[36px] px-3">
          Action center
        </Link>
      </div>
      <Suspense fallback={<div className="py-16 text-center text-paper-muted italic">// loading…</div>}>
        <TikTokOperatorPanel />
      </Suspense>
    </div>
  );
}
