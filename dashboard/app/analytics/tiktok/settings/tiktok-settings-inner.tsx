'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { TikTokConnectionPanel } from '../../../../components/tiktok-connection-panel';

export function TikTokSettingsInner() {
  const searchParams = useSearchParams();
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('connected') === '1') {
      const user = searchParams.get('username');
      setBanner(user ? `Connected as @${user}` : 'TikTok connected successfully.');
    } else if (searchParams.get('error')) {
      setBanner(`Connection failed: ${searchParams.get('error')}`);
    }
  }, [searchParams]);

  return (
    <div className="space-y-8">
      <div>
        <div className="text-2xs text-paper-muted mb-2">
          <Link href="/analytics" className="hover:text-paper-ink">
            analytics
          </Link>
          {' / '}
          <Link href="/analytics/tiktok" className="hover:text-paper-ink">
            tiktok
          </Link>
          {' / settings'}
        </div>
        <h1 className="text-2xl font-bold lowercase">tiktok connection settings</h1>
        <p className="text-sm text-paper-muted mt-2 max-w-3xl">
          Manage OAuth connection status, granted scopes, and disconnect. Tokens stay on the server —
          never shown in the browser.
        </p>
      </div>

      {banner && (
        <div className="border border-paper-edge px-4 py-3 text-sm text-paper-soft">{banner}</div>
      )}

      <TikTokConnectionPanel showSetupDetails />

      <section className="border border-dashed border-paper-edge p-4 space-y-2 text-xs text-paper-muted max-w-3xl">
        <h2 className="font-bold text-paper-ink lowercase">scope awareness</h2>
        <p>
          Phase B only completes OAuth. TikTok may not grant every requested scope. Manual import
          still provides saves, watch time, and completion rate when the Display API does not.
        </p>
        <p>
          See <span className="font-mono text-2xs">docs/tiktok-oauth-scopes.md</span> in the repo
          for field availability by source.
        </p>
      </section>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/analytics/tiktok/connect" className="bracket hover:text-accent">
          connect flow →
        </Link>
        <Link href="/analytics/import" className="bracket hover:text-accent">
          manual import →
        </Link>
      </div>
    </div>
  );
}
