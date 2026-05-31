'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { WeeklyPlanResponse } from '../../../lib/planner-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function WeeklyPlannerPanel() {
  const [data, setData] = useState<WeeklyPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/content-planner/week`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<WeeklyPlanResponse>;
      })
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load weekly plan');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading && !data) {
    return <div className="py-12 text-center text-paper-muted italic">// loading weekly plan…</div>;
  }

  if (error) {
    return (
      <div className="border-2 border-accent px-4 py-3 text-sm text-accent">
        // error: {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8">
      <p className="text-2xs text-paper-muted">
        week of {data.weekStart} — {data.weekEnd}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {data.days.map((day) => (
          <div key={day.date} className="border-2 border-paper-edge min-w-[10rem]">
            <div className="border-b border-paper-edge px-3 py-2 bg-paper-tint">
              <div className="text-2xs uppercase text-paper-muted">{day.weekday}</div>
              <div className="text-sm font-bold">{day.label}</div>
            </div>
            <div className="p-2 space-y-2 min-h-[8rem]">
              {day.items.length === 0 ? (
                <p className="text-2xs text-paper-dim italic px-1">—</p>
              ) : (
                day.items.map((item) => (
                  <div key={item.id} className="text-2xs border border-paper-edge p-2 space-y-1">
                    <Link
                      href={`/review/inventory?id=${item.id}`}
                      className="block hover:border-paper-ink"
                    >
                      <div className="font-bold lowercase leading-snug">{item.title.toLowerCase()}</div>
                      <div className="text-paper-muted mt-0.5">{item.planner.listName.toLowerCase()}</div>
                    </Link>
                    {item.linkedPipelineOpportunities && item.linkedPipelineOpportunities.length > 0 && (
                      <div className="text-paper-dim italic">
                        {item.linkedPipelineOpportunities[0]!.sponsorBusinessName.toLowerCase()} ·{' '}
                        {item.linkedPipelineOpportunities[0]!.statusLabel.toLowerCase()}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {data.unscheduled.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold lowercase">unscheduled</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {data.unscheduled.map((item) => (
              <Link
                key={item.id}
                href={`/review/inventory?id=${item.id}`}
                className="border border-paper-edge p-3 text-xs hover:border-paper-ink"
              >
                <div className="font-bold lowercase">{item.title.toLowerCase()}</div>
                <div className="text-2xs text-paper-muted mt-1">{item.planner.status}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
