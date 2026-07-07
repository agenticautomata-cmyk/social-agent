'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clientApiUrl } from '../../lib/client-api';
import type { CreatorInboxConfig } from '../../lib/creator-info-types';

export function MyInfoPanel() {
  const [data, setData] = useState<CreatorInboxConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    return fetch(clientApiUrl('/api/creator-info/channels'), { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<CreatorInboxConfig & { ok?: boolean }>;
      })
      .then((json) => setData(json))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading && !data) {
    return <p className="text-sm text-paper-muted italic">// loading your info…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!data) return null;

  return (
    <div className="space-y-8">
      <div className="border-2 border-paper-edge p-6 space-y-3">
        <h2 className="text-xl font-bold">Send-as inbox</h2>
        <p className="text-sm text-paper-muted">
          Benson sends approved sponsor pitches from Gmail. Replies route to your Cloudflare aliases below.
        </p>
        <div className="text-sm grid gap-1">
          <div>
            <span className="text-paper-muted">Gmail send-as:</span>{' '}
            <span className="font-mono">{data.sendAsGmail ?? 'not configured'}</span>
          </div>
          <div>
            <span className="text-paper-muted">Display name:</span> {data.displayName}
          </div>
        </div>
        <Link href="/email/settings" className="bracket text-sm hover:text-accent">
          email settings →
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {data.channels.map((channel) => (
          <div key={channel.id} className="border-2 border-paper-edge p-5 space-y-3">
            <div>
              <div className="text-2xs text-paper-muted uppercase tracking-wide">{channel.label}</div>
              <a
                href={`mailto:${channel.email}`}
                className="text-lg font-bold font-mono hover:text-accent break-all"
              >
                {channel.email}
              </a>
            </div>
            <p className="text-sm text-paper-muted">{channel.purpose}</p>
            <div>
              <div className="text-2xs text-paper-muted mb-1">Connected in Benson</div>
              <ul className="text-xs space-y-1">
                {channel.connections.map((line) => (
                  <li key={line}>· {line}</li>
                ))}
              </ul>
            </div>
            {channel.href && (
              <Link href={channel.href} className="bracket text-sm hover:text-accent inline-block">
                open →
              </Link>
            )}
          </div>
        ))}
      </div>

      <p className="text-2xs text-paper-muted italic">
        Aliases route through Cloudflare Email Routing on {data.domain}. Override any address via CREATOR_EMAIL_* in .env.
      </p>
    </div>
  );
}
