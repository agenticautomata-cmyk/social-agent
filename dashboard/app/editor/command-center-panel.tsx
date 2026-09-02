'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CREATOR_TIMEZONE } from '../../lib/datetime';
import {
  type TodayActionId,
  type TodayEditorResponse,
  type TodayWorkItem,
} from '../../lib/command-center-types';
import { PageHeader } from '../../components/page-header';
import { SECTION_HELP } from '../../lib/section-help-text';
import { clientApiUrl } from '../../lib/client-api';
import { patchPlannerItem } from '../../components/planner-quick-actions';

function timeAwareGreeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: CREATOR_TIMEZONE,
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return 'Good morning, Kellie';
  if (hour < 17) return 'Good afternoon, Kellie';
  return 'Good evening, Kellie';
}

function actionLabel(action: TodayActionId): string {
  switch (action) {
    case 'open':
      return 'Open';
    case 'mark_done':
      return 'Mark done';
    case 'reschedule':
      return 'Reschedule';
    case 'remove_from_today':
      return 'Remove from Today';
    case 'view_details':
      return 'View details';
    case 'review':
      return 'Review';
    case 'add_to_today':
      return 'Add to Today';
    case 'add_to_calendar':
      return 'Add to Calendar';
    case 'dismiss':
      return 'Dismiss';
  }
}

function WorkItemCard({
  item,
  busy,
  onAction,
}: {
  item: TodayWorkItem;
  busy: string | null;
  onAction: (item: TodayWorkItem, action: TodayActionId, extra?: { plannedDate?: string }) => void;
}) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(item.eventDate ?? item.dueDate ?? '');
  const itemBusy = busy === `${item.id}:pending`;

  return (
    <article className="border border-paper-edge bg-paper px-3 py-3 space-y-2">
      <div className="min-w-0">
        <h3 className="font-bold leading-snug text-sm">{item.title}</h3>
        {item.subtitle ? <p className="text-2xs text-paper-muted mt-0.5">{item.subtitle}</p> : null}
        <div className="text-2xs text-paper-muted mt-1 space-y-0.5">
          {item.whenLabel ? <p>{item.whenLabel}</p> : null}
          {item.whereLabel ? <p>{item.whereLabel}</p> : null}
        </div>
      </div>
      {item.why ? <p className="text-sm leading-snug">{item.why}</p> : null}
      {item.verifiedFacts.length > 0 ? (
        <ul className="text-2xs text-paper-muted space-y-0.5">
          {item.verifiedFacts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      ) : null}
      {item.sourceUrl ? (
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-2xs text-accent hover:underline"
        >
          Official source
        </a>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {item.actions.map((action) => {
          if (action === 'open' || action === 'view_details' || action === 'review') {
            return (
              <Link
                key={action}
                href={item.detailsHref}
                className={
                  action === 'open' || action === 'review'
                    ? 'btn-primary text-xs py-1.5 min-h-[36px] px-3'
                    : 'btn-ghost text-xs py-1.5 min-h-[36px] px-3'
                }
              >
                {actionLabel(action)}
              </Link>
            );
          }
          if (action === 'reschedule') {
            return (
              <button
                key={action}
                type="button"
                disabled={itemBusy}
                onClick={() => setRescheduleOpen((open) => !open)}
                className="btn-ghost text-xs py-1.5 min-h-[36px] px-3"
              >
                {actionLabel(action)}
              </button>
            );
          }
          return (
            <button
              key={action}
              type="button"
              disabled={itemBusy}
              onClick={() => onAction(item, action)}
              className={
                action === 'mark_done' || action === 'add_to_today'
                  ? 'btn-primary text-xs py-1.5 min-h-[36px] px-3'
                  : 'btn-ghost text-xs py-1.5 min-h-[36px] px-3'
              }
            >
              {itemBusy ? '…' : actionLabel(action)}
            </button>
          );
        })}
      </div>
      {rescheduleOpen ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <input
            type="date"
            value={rescheduleDate}
            onChange={(event) => setRescheduleDate(event.target.value)}
            className="border border-paper-edge bg-paper px-2 py-1 text-xs min-h-[36px]"
          />
          <button
            type="button"
            disabled={itemBusy || !rescheduleDate}
            className="btn-primary text-xs py-1.5 min-h-[36px] px-3"
            onClick={() => {
              onAction(item, 'reschedule', { plannedDate: rescheduleDate });
              setRescheduleOpen(false);
            }}
          >
            Save date
          </button>
          <button
            type="button"
            className="btn-ghost text-xs py-1.5 min-h-[36px] px-3"
            onClick={() => onAction(item, 'reschedule', { plannedDate: 'week' })}
          >
            This week
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function CommandCenterPanel() {
  const [data, setData] = useState<TodayEditorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);

  const reload = useCallback(() => {
    setError(null);
    return fetch(clientApiUrl('/api/editor'), { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<TodayEditorResponse>;
      })
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load Today');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  async function runPlanner(contentItemId: string, body: Record<string, unknown>) {
    const res = await patchPlannerItem(contentItemId, body);
    if (!res.ok) throw new Error(await res.text());
  }

  async function runReview(contentItemId: string, action: 'dismiss' | 'add_to_today' | 'add_to_calendar' | 'reviewed') {
    const res = await fetch(clientApiUrl('/api/editor/review'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentItemId, action }),
    });
    if (!res.ok) throw new Error(await res.text());
  }

  async function handleAction(
    item: TodayWorkItem,
    action: TodayActionId,
    extra?: { plannedDate?: string },
  ) {
    if (!item.contentItemId && action !== 'dismiss') return;
    setBusy(`${item.id}:pending`);
    try {
      if (action === 'mark_done' && item.contentItemId) {
        await runPlanner(item.contentItemId, { action: 'mark_covered' });
      } else if (action === 'remove_from_today' && item.contentItemId) {
        await runPlanner(item.contentItemId, { action: 'save' });
      } else if (action === 'add_to_today' && item.contentItemId) {
        if (item.kind === 'research' || item.kind === 'verification') {
          await runReview(item.contentItemId, 'add_to_today');
        } else {
          await runPlanner(item.contentItemId, { action: 'plan_today' });
        }
      } else if (action === 'reschedule' && item.contentItemId) {
        if (extra?.plannedDate === 'week') {
          await runPlanner(item.contentItemId, { action: 'plan_this_week' });
        } else if (extra?.plannedDate) {
          await runPlanner(item.contentItemId, {
            listName: 'This Week',
            status: 'planned',
            plannedDate: extra.plannedDate,
          });
        }
      } else if (
        (action === 'dismiss' || action === 'add_to_calendar') &&
        item.contentItemId
      ) {
        await runReview(item.contentItemId, action === 'dismiss' ? 'dismiss' : 'add_to_calendar');
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  const execution = data?.execution;
  const greeting = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: CREATOR_TIMEZONE,
  });

  return (
    <div className="space-y-5">
      {data?.demoMode && (
        <div className="border border-dashed border-paper-edge px-3 py-2 text-xs text-paper-muted">
          demo mode — execution list only
        </div>
      )}

      <PageHeader
        title={timeAwareGreeting()}
        subtitle={greeting}
        help={SECTION_HELP.editor.page}
      />

      {error && (
        <div className="border border-accent px-3 py-2 text-sm text-accent">{error}</div>
      )}

      {loading && !data && (
        <p className="text-sm text-paper-muted italic">Loading today…</p>
      )}

      {execution && execution.empty && (
        <section className="space-y-3">
          <p className="text-sm">{execution.emptyMessage}</p>
          <div className="flex flex-wrap gap-2">
            {execution.emptyActions.map((action) => (
              <Link key={action.href} href={action.href} className="btn-primary text-xs py-1.5 min-h-[36px] px-3">
                {action.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {execution && execution.priorities.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-paper-muted">Priorities</h2>
          <ol className="space-y-1 text-sm">
            {execution.priorities.map((priority) => (
              <li key={`${priority.rank}-${priority.label}`} className="flex gap-2">
                <span className="text-paper-muted tabular-nums">{priority.rank}.</span>
                {priority.href ? (
                  <Link href={priority.href} className="hover:text-accent">
                    {priority.label}
                  </Link>
                ) : (
                  <span>{priority.label}</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {execution && execution.plan.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">Today’s plan</h2>
          <div className="space-y-2">
            {execution.plan.map((item) => (
              <WorkItemCard key={item.id} item={item} busy={busy} onAction={handleAction} />
            ))}
          </div>
        </section>
      )}

      {execution && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">Best move</h2>
          {execution.bestMove ? (
            <WorkItemCard item={execution.bestMove} busy={busy} onAction={handleAction} />
          ) : (
            <p className="text-sm text-paper-muted">{execution.bestMoveEmpty}</p>
          )}
        </section>
      )}

      {execution && (execution.review.length > 0 || execution.pendingResearch.length > 0) && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold">Ready for review</h2>
            <Link href={execution.reviewQueueHref} className="text-2xs text-accent hover:underline">
              View all
              {execution.reviewTotal > execution.review.length ? ` (${execution.reviewTotal})` : ''}
            </Link>
          </div>
          {execution.pendingResearch.map((item) => (
            <p key={item.id} className="text-sm text-paper-muted">
              Researching {item.title} — Benson will add this when it finishes.
            </p>
          ))}
          <div className="space-y-2">
            {execution.review.map((item) => (
              <WorkItemCard key={item.id} item={item} busy={busy} onAction={handleAction} />
            ))}
          </div>
        </section>
      )}

      {execution && execution.comingUp.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">Coming up</h2>
          <div className="space-y-2">
            {execution.comingUp.map((item) => (
              <WorkItemCard key={item.id} item={item} busy={busy} onAction={handleAction} />
            ))}
          </div>
        </section>
      )}

      {execution && execution.completedToday.count > 0 && (
        <section className="space-y-2">
          <button
            type="button"
            className="text-sm text-paper-muted hover:text-paper-ink"
            onClick={() => setCompletedOpen((open) => !open)}
          >
            Completed today ({execution.completedToday.count})
          </button>
          {completedOpen ? (
            <ul className="text-sm space-y-1">
              {execution.completedToday.items.map((item) => (
                <li key={item.id}>{item.title}</li>
              ))}
            </ul>
          ) : null}
        </section>
      )}
    </div>
  );
}
