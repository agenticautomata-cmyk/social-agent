'use client';

import { clientApiOrigin } from '../../../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateTime } from '../../../lib/datetime';

const API = clientApiOrigin();

type DiscountDeal = {
  id: string;
  title: string;
  category: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  eventDate: string | null;
  discoveredAt: string;
  newDeal: boolean;
  luxuryEstate: boolean;
};

export function LuxuryDealsPanel() {
  const [deals, setDeals] = useState<DiscountDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/discount-watch/recent?limit=40`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<{ deals: DiscountDeal[] }>;
      })
      .then((data) => setDeals(data.deals))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const newCount = deals.filter((d) => d.newDeal).length;

  return (
    <div className="space-y-6">
      <Link href="/review/inventory?preset=luxury_deals" className="bracket text-sm hover:text-accent">
        ← inventory (luxury deals preset)
      </Link>

      <section>
        <h1 className="text-3xl font-bold lowercase">deal watch</h1>
        <p className="text-paper-muted mt-2 text-sm italic max-w-2xl">
          Holiday sales, mall promos, thrift discounts, grocery deals, hotel/spa offers, and
          luxury estate finds — Benson polls every 6 hours. New rows mean a deal just landed.
        </p>
      </section>

      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">// error: {error}</div>
      )}

      {!loading && (
        <p className="text-2xs text-paper-muted">
          {deals.length} tracked · {newCount} newly spotted
        </p>
      )}

      {loading && !deals.length && (
        <p className="text-paper-muted italic py-8 text-center">// loading deal watch…</p>
      )}

      <div className="space-y-2">
        {deals.map((deal) => (
          <article
            key={deal.id}
            className="border border-paper-edge p-4 space-y-1 hover:border-paper-ink transition-colors"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-bold lowercase leading-snug">{deal.title.toLowerCase()}</h2>
              <div className="flex gap-2 text-2xs">
                {deal.newDeal && (
                  <span className="border border-accent text-accent px-1.5 py-0.5 font-bold">new</span>
                )}
                {deal.luxuryEstate && (
                  <span className="border border-paper-edge px-1.5 py-0.5">estate find</span>
                )}
              </div>
            </div>
            <div className="text-2xs text-paper-muted flex flex-wrap gap-x-3 gap-y-1">
              {deal.category && <span>{deal.category.replace(/_/g, ' ')}</span>}
              {deal.sourceName && <span>· {deal.sourceName.toLowerCase()}</span>}
              {deal.eventDate && <span>· {formatDateTime(deal.eventDate)}</span>}
              <span>· seen {formatDateTime(deal.discoveredAt)}</span>
            </div>
            {deal.sourceUrl && (
              <a
                href={deal.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bracket text-2xs text-paper-muted hover:text-paper-ink"
              >
                open deal
              </a>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
