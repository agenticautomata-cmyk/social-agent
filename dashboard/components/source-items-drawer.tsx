'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clientApiOrigin } from '../lib/client-api';
import { OpportunityActionBar } from './opportunity-action-bar';

const API = clientApiOrigin();

export type SourceItemCard = {
  id: string;
  sourceId: string;
  title: string;
  displayTitle: string;
  businessName: string | null;
  venue: string | null;
  whereLabel: string | null;
  whenLabel: string | null;
  whySummary: string;
  lane: string;
  laneLabel: string;
  sourceName: string | null;
  sourceUrl: string | null;
  viewSourceUrl: string | null;
  freshness: { label: string };
  primaryAction: {
    kind: string;
    label: string;
    plannerAction: 'plan_weekend' | 'plan_today' | 'plan_this_week' | 'save' | null;
  };
  showMarkCovered: boolean;
  showSave: boolean;
  state: string;
  eventDate: string | null;
  discoveredAt: string | null;
};

type Props = {
  sourceId: string;
  sourceName: string;
  onClose: () => void;
  onItemsChanged?: (count: number) => void;
};

export function SourceItemsDrawer({ sourceId, sourceName, onClose, onItemsChanged }: Props) {
  const [items, setItems] = useState<SourceItemCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/sources/${sourceId}/items`, { cache: 'no-store' });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        count?: number;
        items?: SourceItemCard[];
      };
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      const next = (data.items ?? []).filter((item) => item.sourceId === sourceId);
      setItems(next);
      onItemsChanged?.(next.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load source items');
      setItems([]);
      onItemsChanged?.(0);
    } finally {
      setLoading(false);
    }
  }, [sourceId, onItemsChanged]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 bg-paper-ink/20 z-40"
        aria-label="Close source items"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 w-full max-w-lg bg-paper border-l-2 border-paper-ink shadow-lg z-50 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-items-title"
      >
        <div className="sticky top-0 bg-paper border-b border-paper-edge px-4 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xs uppercase tracking-wider text-paper-muted">Source items</p>
            <h2 id="source-items-title" className="text-lg font-bold leading-tight truncate">
              {sourceName}
            </h2>
            <p className="text-2xs text-paper-muted mt-1">
              Durable inventory from this source only — dismiss an item without muting the source.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] text-paper-muted hover:text-paper-ink text-sm shrink-0"
          >
            [close]
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {loading ? <p className="text-sm text-paper-muted italic">Loading items…</p> : null}
          {error ? <p className="text-sm text-accent">{error}</p> : null}
          {!loading && !error && items.length === 0 ? (
            <p className="text-sm text-paper-muted italic border border-dashed border-paper-edge p-4 text-center">
              No open durable inventory for this source right now.
            </p>
          ) : null}

          {items.map((item) => (
            <article key={item.id} className="border border-paper-edge p-4 space-y-3">
              <div>
                <p className="text-2xs uppercase tracking-wider text-accent">{item.laneLabel}</p>
                <h3 className="font-bold leading-snug mt-0.5">{item.displayTitle || item.title}</h3>
                <div className="text-2xs text-paper-muted mt-1 space-y-0.5">
                  {item.whenLabel ? <p>When: {item.whenLabel}</p> : null}
                  {item.whereLabel || item.businessName || item.venue ? (
                    <p>Where: {item.whereLabel ?? [item.businessName, item.venue].filter(Boolean).join(' · ')}</p>
                  ) : null}
                  {item.sourceName ? <p>Source: {item.sourceName}</p> : null}
                  <p>Freshness: {item.freshness.label}</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-2xs uppercase tracking-wider text-paper-muted">Why Benson thinks it matters</p>
                <p className="text-sm text-paper-ink leading-snug">{item.whySummary}</p>
              </div>

              <OpportunityActionBar
                target={{ id: item.id, title: item.displayTitle || item.title }}
                onAction={() => void load()}
                todayMode
                today={{
                  primaryLabel: item.primaryAction.label,
                  primaryPlannerAction: item.primaryAction.plannerAction,
                  showMarkCovered: item.showMarkCovered,
                  showSave: item.showSave,
                  viewSourceUrl: item.viewSourceUrl,
                  detailsHref: `/review/inventory?id=${item.id}`,
                  showSponsorLead: item.lane === 'sponsor_partnership',
                }}
              />

              <div className="pt-1">
                <Link
                  href={`/review/inventory?id=${item.id}`}
                  className="text-2xs text-paper-muted underline hover:text-paper-ink"
                >
                  Open full inventory detail →
                </Link>
              </div>
            </article>
          ))}
        </div>
      </aside>
    </>
  );
}

export function viewItemsLabel(count: number): string {
  if (count <= 0) return '';
  return count === 1 ? 'View 1 item' : `View ${count} items`;
}
