'use client';

import { clientApiOrigin } from '../../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { LinkedPipelineOpps } from '../../components/linked-pipeline-opps';
import { PlannerQuickActions } from '../../components/planner-quick-actions';
import { CreateSponsorLeadButton } from '../../components/create-sponsor-lead-button';
import { InventoryCategoryFilterBar } from '../../components/inventory-category-filter-bar';
import {
  appendExcludeCategories,
  useInventoryCategoryFilter,
} from '../../lib/inventory-category-filter';
import { PageHeader } from '../../components/page-header';
import type { PlannerHubResponse } from '../../lib/planner-types';

const API = clientApiOrigin();

function CountBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-2 border-paper-edge px-4 py-3 min-w-[6rem]">
      <div className="text-2xs uppercase text-paper-muted tracking-wider">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

export function PlannerHubPanel() {
  const categoryFilter = useInventoryCategoryFilter();
  const { excludedCategories, hydrated } = categoryFilter;
  const [data, setData] = useState<PlannerHubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!hydrated) return Promise.resolve();
    setLoading(true);
    setError(null);
    return fetch(appendExcludeCategories(`${API}/api/content-planner`, excludedCategories), {
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<PlannerHubResponse>;
      })
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load planner');
      })
      .finally(() => setLoading(false));
  }, [excludedCategories, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    void reload();
  }, [reload, hydrated]);

  return (
    <div className="space-y-8">
      {data?.demoMode && (
        <div className="border border-dashed border-paper-edge px-4 py-2 text-xs text-paper-muted">
          demo mode — content planning with live inventory data
        </div>
      )}

      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">
          // error: {error}
        </div>
      )}

      {loading && !data && (
        <div className="py-16 text-center text-paper-muted italic">// loading planner…</div>
      )}

      {data && (
        <>
          <PageHeader
            title="Plan"
            subtitle="Saved picks, weekly boards, and what to film next."
            action={{ label: 'Weekly view', href: '/planner/week' }}
          />

          <InventoryCategoryFilterBar {...categoryFilter} loading={loading} />

          <section className="flex flex-wrap gap-3">
            <CountBlock label="saved" value={data.counts.saved} />
            <CountBlock label="planned this week" value={data.counts.plannedThisWeek} />
            <CountBlock label="covered" value={data.counts.covered} />
            <CountBlock label="skipped" value={data.counts.skipped} />
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-lg font-bold lowercase">planning boards</h2>
              <Link href="/planner/shortlist" className="bracket text-xs hover:text-accent">
                view shortlist →
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {data.boards.map((board) => (
                <Link
                  key={board.name}
                  href={
                    board.name === 'Weekend'
                      ? '/weekend-list'
                      : `/planner/shortlist?board=${encodeURIComponent(board.name)}`
                  }
                  className="border-2 border-paper-edge p-4 hover:border-paper-ink transition-colors"
                >
                  <div className="text-sm font-bold lowercase">{board.name.toLowerCase()}</div>
                  <div className="text-2xs text-paper-muted mt-1 tabular-nums">
                    {board.count} item{board.count === 1 ? '' : 's'}
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-lg font-bold lowercase">top ingested picks</h2>
              <Link href="/editor" className="bracket text-xs hover:text-accent">
                editor briefing →
              </Link>
            </div>
            {data.topIngestedPicks.length === 0 ? (
              <p className="text-sm text-paper-muted italic py-6 border border-dashed border-paper-edge text-center">
                // no ingested picks — run source refresh from{' '}
                <Link href="/sources" className="link">
                  sources
                </Link>
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.topIngestedPicks.map((card) => (
                  <article key={card.id} className="border-2 border-paper-edge p-4 space-y-3">
                    <div>
                      <h4 className="font-bold lowercase">{card.title.toLowerCase()}</h4>
                      <div className="text-2xs text-paper-muted mt-1">
                        {card.category?.replace(/_/g, ' ') ?? 'general'}
                        {card.sourceName ? ` · ${card.sourceName.toLowerCase()}` : ''}
                      </div>
                    </div>
                    <p className="text-xs text-paper-soft leading-relaxed">{card.whyItMatters}</p>
                    {card.sourceUrl && (
                      <a
                        href={card.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-2xs link break-all"
                      >
                        source →
                      </a>
                    )}
                    <PlannerQuickActions
                      target={{ id: card.id, title: card.title, tracking: card.tracking }}
                      onAction={() => void reload()}
                      compact
                    />
                    <CreateSponsorLeadButton contentItemId={card.id} title={card.title} compact />
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-lg font-bold lowercase">recent shortlist</h2>
              <Link href="/planner/week" className="bracket text-xs hover:text-accent">
                weekly plan →
              </Link>
            </div>
            {data.recentItems.length === 0 ? (
              <p className="text-sm text-paper-muted italic py-8 border border-dashed border-paper-edge text-center">
                // save opportunities from the editor or inventory review to get started
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.recentItems.map((card) => (
                  <article key={card.id} className="border-2 border-paper-edge p-4 space-y-3">
                    <div>
                      <h4 className="font-bold lowercase">{card.title.toLowerCase()}</h4>
                      <div className="text-2xs text-paper-muted mt-1">
                        {card.planner.status} · {card.planner.listName.toLowerCase()}
                        {card.planner.plannedDate ? ` · ${card.planner.plannedDate}` : ''}
                      </div>
                    </div>
                    {card.planner.notes && (
                      <p className="text-2xs text-paper-muted italic border-l-2 border-paper-edge pl-2">
                        {card.planner.notes}
                      </p>
                    )}
                    <LinkedPipelineOpps opportunities={card.linkedPipelineOpportunities} />
                    <PlannerQuickActions
                      target={{
                        id: card.id,
                        title: card.title,
                        tracking: card.tracking,
                      }}
                      onAction={() => void reload()}
                    />
                    <CreateSponsorLeadButton contentItemId={card.id} title={card.title} compact />
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
