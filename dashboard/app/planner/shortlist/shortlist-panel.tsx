'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PlannerQuickActions } from '../../../components/planner-quick-actions';
import { CreateSponsorLeadButton } from '../../../components/create-sponsor-lead-button';
import { PLANNER_BOARDS, type PlannerBoard, type PlannerCard } from '../../../lib/planner-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function ShortlistPanel() {
  const searchParams = useSearchParams();
  const boardParam = searchParams.get('board') ?? '';
  const [board, setBoard] = useState<PlannerBoard | ''>(
    PLANNER_BOARDS.includes(boardParam as PlannerBoard) ? (boardParam as PlannerBoard) : '',
  );
  const [items, setItems] = useState<PlannerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (board) params.set('board', board);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }, [board]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/content-planner/items${query}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        const json = (await res.json()) as { items: PlannerCard[] };
        return json.items;
      })
      .then(setItems)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load shortlist');
      })
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setBoard('')}
          className={`text-2xs px-2 py-1 border ${
            board === '' ? 'border-paper-ink font-bold' : 'border-paper-edge'
          }`}
        >
          all active
        </button>
        {PLANNER_BOARDS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setBoard(name)}
            className={`text-2xs px-2 py-1 border lowercase ${
              board === name ? 'border-paper-ink font-bold' : 'border-paper-edge'
            }`}
          >
            {name.toLowerCase()}
          </button>
        ))}
      </div>

      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">
          // error: {error}
        </div>
      )}

      {loading && (
        <div className="py-12 text-center text-paper-muted italic">// loading shortlist…</div>
      )}

      {!loading && items.length === 0 && (
        <p className="text-sm text-paper-muted italic py-8 border border-dashed border-paper-edge text-center">
          // no items on this board — save from the{' '}
          <Link href="/editor" className="link">
            editor
          </Link>{' '}
          or{' '}
          <Link href="/review/inventory" className="link">
            inventory review
          </Link>
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((card) => (
          <article key={card.id} className="border-2 border-paper-edge p-4 space-y-3">
            <div>
              <Link href={`/review/inventory?id=${card.id}`} className="font-bold lowercase hover:text-accent">
                {card.title.toLowerCase()}
              </Link>
              <div className="text-2xs text-paper-muted mt-1">
                {card.planner.status} · board: {card.planner.listName.toLowerCase()}
                {card.planner.plannedDate ? ` · ${card.planner.plannedDate}` : ''}
              </div>
            </div>
            {card.planner.notes && (
              <p className="text-2xs text-paper-muted italic">{card.planner.notes}</p>
            )}
            <PlannerQuickActions
              target={{ id: card.id, title: card.title, tracking: card.tracking }}
              onAction={() => void reload()}
            />
            <CreateSponsorLeadButton contentItemId={card.id} title={card.title} compact />
          </article>
        ))}
      </div>
    </div>
  );
}
