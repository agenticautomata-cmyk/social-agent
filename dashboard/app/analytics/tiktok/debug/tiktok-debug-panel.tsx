'use client';

import { useEffect, useState } from 'react';
import { clientApiUrl, parseApiJsonResponse } from '../../../../lib/client-api';

export function TikTokDebugPanel() {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(clientApiUrl('/api/analytics/tiktok/debug'), { cache: 'no-store' })
      .then(async (res) => {
        const parsed = await parseApiJsonResponse(res);
        if (!parsed.ok) throw new Error(parsed.error);
        return parsed.data;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'));
  }, []);

  if (error) {
    return <p className="text-sm text-accent">// {error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-paper-muted italic">// loading debug…</p>;
  }

  return (
    <pre className="text-2xs border border-paper-edge p-4 overflow-x-auto whitespace-pre-wrap">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
