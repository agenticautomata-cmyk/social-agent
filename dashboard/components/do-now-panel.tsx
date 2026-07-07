'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ActionCenterButtons } from './action-center-buttons';
import type { ActionCenterItem, ActionCenterResponse } from '../lib/action-center-types';
import { clientApiUrl } from '../lib/client-api';
import { SectionTitleRow } from './section-help';
import { SECTION_HELP } from '../lib/section-help-text';

const PRIORITY_CLASS: Record<ActionCenterItem['priority'], string> = {
  critical: 'border-accent text-accent',
  important: 'border-paper-ink',
  suggested: 'border-paper-edge text-paper-muted',
};

function DoNowCard({ item, onDone }: { item: ActionCenterItem; onDone: () => void }) {
  return (
    <article className="border border-paper-edge/80 bg-paper/40 p-4 space-y-3">
      <div>
        <span
          className={`text-2xs uppercase px-1.5 py-0.5 border ${PRIORITY_CLASS[item.priority]}`}
        >
          {item.priority}
        </span>
        <h3 className="font-semibold text-paper-ink mt-2 leading-snug">
          {item.href ? (
            <Link href={item.href} className="hover:text-accent">
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </h3>
        {item.subtitle && <p className="text-xs text-paper-dim mt-1">{item.subtitle}</p>}
      </div>
      <ActionCenterButtons item={item} onDone={onDone} />
    </article>
  );
}

export function DoNowPanel() {
  const [data, setData] = useState<ActionCenterResponse | null>(null);
  const [pulseHint, setPulseHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([
      fetch(clientApiUrl('/api/action-center'), { cache: 'no-store' }),
      fetch(clientApiUrl('/api/benson-pulse/latest'), { cache: 'no-store' }),
    ])
      .then(async ([actionsRes, pulseRes]) => {
        if (!actionsRes.ok) throw new Error(`${actionsRes.status} ${await actionsRes.text()}`);
        const actions = (await actionsRes.json()) as ActionCenterResponse;
        setData(actions);

        if (pulseRes.ok) {
          const pulse = (await pulseRes.json()) as {
            brief: { suggestedNextStep: string | null; createdAt: string } | null;
          };
          const brief = pulse.brief;
          const stale =
            brief?.createdAt &&
            Date.now() - new Date(brief.createdAt).getTime() > 72 * 60 * 60 * 1000;
          setPulseHint(stale ? null : (brief?.suggestedNextStep ?? null));
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load Do Now');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading && !data) {
    return (
      <section className="glass-panel-strong gradient-border p-5 md:p-6">
        <p className="text-sm text-paper-dim">Loading your Do Now list…</p>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="glass-panel border border-red-400/30 p-5 text-sm text-red-300">
        {error}
      </section>
    );
  }

  const items = data?.doNow ?? [];
  if (items.length === 0 && !pulseHint) return null;

  return (
    <section className="glass-panel-strong gradient-border p-5 md:p-6 space-y-4">
      <SectionTitleRow
        title="Do now"
        subtitle="Actions, outreach, and content — inline, no tab hopping."
        help={SECTION_HELP.home.doNow}
        actions={
          <Link href="/actions" className="text-xs text-paper-dim hover:text-accent">
            All actions →
          </Link>
        }
      />

      {pulseHint && (
        <p className="text-xs text-paper-soft border-l-2 border-accent pl-3 italic">{pulseHint}</p>
      )}

      {items.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {items.slice(0, 6).map((item) => (
            <DoNowCard key={item.id} item={item} onDone={() => void reload()} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-paper-dim italic">Nothing urgent — Benson will nudge you when something needs you.</p>
      )}

      {(data?.counts.overdue ?? 0) > 0 && (
        <p className="text-2xs text-accent">
          {data!.counts.overdue} overdue · {data!.counts.dueToday} due today
        </p>
      )}
    </section>
  );
}
