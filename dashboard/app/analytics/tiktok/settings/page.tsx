import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../../lib/opportunities-ui';
import { TikTokSettingsInner } from './tiktok-settings-inner';

export default function TikTokSettingsPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <Suspense
      fallback={
        <p className="text-sm text-paper-muted italic py-12">// loading settings…</p>
      }
    >
      <TikTokSettingsInner />
    </Suspense>
  );
}
