'use client';

import { clientApiOrigin } from '../../../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { SponsorIntelligenceActions } from '../../../components/sponsor-intelligence-actions';
import { InventoryCategoryFilterBar } from '../../../components/inventory-category-filter-bar';
import {
  appendExcludeCategories,
  useInventoryCategoryFilter,
} from '../../../lib/inventory-category-filter';
import { scoreTone, type SponsorRecommendation } from '../../../lib/sponsor-intelligence-types';
import { formatDateTime } from '../../../lib/datetime';

const API = clientApiOrigin();

type TopReport = {
  demoMode: boolean;
  generatedAt: string;
  limit: number;
  totalEligible: number;
  items: SponsorRecommendation[];
};

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-2xs">
      <span className="text-paper-muted uppercase tracking-wider">{label}</span>
      <div className={`tabular-nums ${scoreTone(value)}`}>{value}</div>
    </div>
  );
}

function CandidateRow({
  rank,
  item,
  onAction,
}: {
  rank: number;
  item: SponsorRecommendation;
  onAction: () => void;
}) {
  return (
    <article className="border-2 border-paper-edge p-4 space-y-3 bg-paper">
      <div className="flex gap-3 items-start">
        <span className="text-lg font-bold tabular-nums text-paper-muted">{rank}</span>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold lowercase">{item.businessName.toLowerCase()}</h4>
          <p className="text-2xs text-paper-muted lowercase">{item.title.toLowerCase()}</p>
          <div className="text-2xs text-paper-muted mt-1">
            {item.sourceName ? `source: ${item.sourceName.toLowerCase()}` : 'no source'}
          </div>
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-2xs link break-all mt-1 inline-block"
            >
              {item.sourceUrl}
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 border-y border-paper-edge py-3">
        <ScorePill label="sponsor fit" value={item.scores.sponsorFit} />
        <ScorePill label="audience" value={item.scores.audienceFit} />
        <ScorePill label="revenue" value={item.scores.revenuePotential} />
        <ScorePill label="confidence" value={item.scores.confidence} />
        <ScorePill label="priority" value={item.scores.contactFirst} />
      </div>

      <p className="text-xs italic">{item.whyBensonRecommends}</p>

      <SponsorIntelligenceActions
        contentItemId={item.contentItemId}
        sponsorContactId={item.sponsorContactId}
        onAction={onAction}
      />
    </article>
  );
}

export function TopSponsorCandidatesPanel() {
  const categoryFilter = useInventoryCategoryFilter();
  const { excludedCategories, hydrated } = categoryFilter;
  const [data, setData] = useState<TopReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!hydrated) return Promise.resolve();
    setLoading(true);
    setError(null);
    return fetch(
      appendExcludeCategories(`${API}/api/sponsor-intelligence/top-candidates?limit=50`, excludedCategories),
      { cache: 'no-store' },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<TopReport>;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [excludedCategories, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    void reload();
  }, [reload, hydrated]);

  return (
    <div className="space-y-6">
      <Link href="/sponsor-intelligence" className="bracket text-sm hover:text-accent">
        ← sponsor intelligence
      </Link>

      <InventoryCategoryFilterBar {...categoryFilter} loading={loading} />

      {data && (
        <p className="text-2xs text-paper-muted">
          {data.items.length} shown · {data.totalEligible} eligible ingested · generated{' '}
          {formatDateTime(data.generatedAt)}
        </p>
      )}

      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">// error: {error}</div>
      )}

      {loading && !data && (
        <div className="py-12 text-center text-paper-muted italic">// loading report…</div>
      )}

      <div className="space-y-4">
        {data?.items.map((item, i) => (
          <CandidateRow key={item.contentItemId} rank={i + 1} item={item} onAction={() => void reload()} />
        ))}
      </div>
    </div>
  );
}
