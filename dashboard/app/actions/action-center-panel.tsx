'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ActionCenterButtons } from '../../components/action-center-buttons';
import type { ActionCenterItem, ActionCenterResponse, BensonPriority } from '../../lib/action-center-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const PRIORITY_LABEL: Record<BensonPriority, string> = {
  critical: 'critical',
  important: 'important',
  suggested: 'suggested',
};

const PRIORITY_CLASS: Record<BensonPriority, string> = {
  critical: 'border-accent text-accent',
  important: 'border-paper-ink',
  suggested: 'border-paper-edge text-paper-muted',
};

function DueBadge({ bucket }: { bucket: ActionCenterItem['dueBucket'] }) {
  if (bucket === 'none' || bucket === 'later') return null;
  const labels = {
    overdue: 'overdue',
    due_today: 'due today',
    due_this_week: 'this week',
  } as const;
  return (
    <span
      className={`text-2xs uppercase tracking-wider ${
        bucket === 'overdue' ? 'text-accent font-bold' : 'text-paper-muted'
      }`}
    >
      {labels[bucket as keyof typeof labels]}
    </span>
  );
}

function ActionCard({ item, onDone }: { item: ActionCenterItem; onDone: () => void }) {
  return (
    <article className="border-2 border-paper-edge p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap gap-2 items-center">
            <span
              className={`text-2xs uppercase px-1.5 py-0.5 border ${PRIORITY_CLASS[item.priority]}`}
            >
              {PRIORITY_LABEL[item.priority]}
            </span>
            <DueBadge bucket={item.dueBucket} />
          </div>
          <h4 className="font-bold lowercase mt-1 leading-snug">
            {item.href ? (
              <Link href={item.href} className="hover:text-accent">
                {item.title.toLowerCase()}
              </Link>
            ) : (
              item.title.toLowerCase()
            )}
          </h4>
          {item.subtitle && (
            <p className="text-2xs text-paper-muted mt-0.5">{item.subtitle}</p>
          )}
          {item.dueAt && (
            <p className="text-2xs text-paper-dim mt-0.5">
              due {new Date(item.dueAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      <ActionCenterButtons item={item} onDone={onDone} />
    </article>
  );
}

function SectionBlock({
  title,
  description,
  items,
  onDone,
}: {
  title: string;
  description: string;
  items: ActionCenterItem[];
  onDone: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="border-l-4 border-paper-ink pl-4">
        <h3 className="text-lg font-bold lowercase">{title}</h3>
        <p className="text-2xs text-paper-muted italic">{description}</p>
        <p className="text-2xs text-paper-dim tabular-nums mt-1">{items.length} items</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-paper-muted italic py-6 border border-dashed border-paper-edge text-center">
          // nothing here right now
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => (
            <ActionCard key={item.id} item={item} onDone={onDone} />
          ))}
        </div>
      )}
    </section>
  );
}

function NotificationColumn({
  label,
  items,
  onDone,
}: {
  label: string;
  items: ActionCenterItem[];
  onDone: () => void;
}) {
  return (
    <div className="border border-paper-edge p-3 min-h-[6rem]">
      <div className="text-2xs uppercase text-paper-muted tracking-wider mb-2">{label}</div>
      <div className="text-xl font-bold tabular-nums">{items.length}</div>
      {items.length > 0 && (
        <ul className="mt-2 space-y-1 text-2xs">
          {items.slice(0, 4).map((i) => (
            <li key={i.id} className="lowercase truncate">
              {i.href ? (
                <Link href={i.href} className="hover:text-accent">
                  {i.title.toLowerCase()}
                </Link>
              ) : (
                i.title.toLowerCase()
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ActionCenterPanel() {
  const [data, setData] = useState<ActionCenterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/action-center`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<ActionCenterResponse>;
      })
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load action center');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-10">
      <section>
        <div className="section-mark mb-3">
          <span>// action center</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tightest lowercase">things to do now</h1>
        <p className="text-paper-muted mt-2 italic text-sm">
          One-click actions across follow-ups, outreach, approvals, planner, and pipeline.
        </p>
        {data && (
          <p className="text-2xs text-paper-muted mt-3 tabular-nums">
            {data.counts.total} open actions · {data.counts.overdue} overdue ·{' '}
            {data.counts.dueToday} due today
          </p>
        )}
      </section>

      {data?.demoMode && (
        <div className="border border-dashed border-paper-edge px-4 py-2 text-xs text-paper-muted">
          demo mode — actions use existing outreach, planner, and pipeline APIs
        </div>
      )}

      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">
          // error: {error}
        </div>
      )}

      {loading && !data && (
        <div className="py-16 text-center text-paper-muted italic">// loading action center…</div>
      )}

      {data && (
        <>
          {data.doNow.length > 0 && (
            <section className="border-2 border-paper-ink bg-paper-tint px-5 py-4 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider">
                things kellie should do now
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.doNow.map((item) => (
                  <ActionCard key={item.id} item={item} onDone={() => void reload()} />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider">notification center</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <NotificationColumn
                label="overdue"
                items={data.notifications.overdue}
                onDone={() => void reload()}
              />
              <NotificationColumn
                label="due today"
                items={data.notifications.dueToday}
                onDone={() => void reload()}
              />
              <NotificationColumn
                label="due this week"
                items={data.notifications.dueThisWeek}
                onDone={() => void reload()}
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider">benson priorities</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['critical', 'important', 'suggested'] as const).map((level) => (
                <div key={level} className="border border-paper-edge p-3">
                  <div className={`text-2xs uppercase font-bold ${PRIORITY_CLASS[level]}`}>
                    {level}
                  </div>
                  <div className="text-2xl font-bold tabular-nums mt-1">
                    {data.priorities[level].length}
                  </div>
                  <ul className="mt-2 space-y-1 text-2xs text-paper-muted">
                    {data.priorities[level].slice(0, 5).map((i) => (
                      <li key={i.id} className="lowercase truncate">
                        {i.title.toLowerCase()}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <SectionBlock
            title="pending follow ups"
            description="Planner, sponsor CRM, and outreach follow-ups with due dates."
            items={data.sections.pendingFollowUps}
            onDone={() => void reload()}
          />
          <SectionBlock
            title="pending sponsor emails"
            description="Drafts, approvals, and scheduled outreach in the queue."
            items={data.sections.pendingSponsorEmails}
            onDone={() => void reload()}
          />
          <SectionBlock
            title="content waiting for approval"
            description="Share intake reviews and outreach emails needing Kellie's sign-off."
            items={data.sections.contentWaitingForApproval}
            onDone={() => void reload()}
          />
          <SectionBlock
            title="upcoming planned content"
            description="Shortlist and planner items coming up this week."
            items={data.sections.upcomingPlannedContent}
            onDone={() => void reload()}
          />
          <SectionBlock
            title="sponsor opportunities needing updates"
            description="Pipeline deals that are stale, active, or past due."
            items={data.sections.sponsorOpportunitiesNeedingUpdates}
            onDone={() => void reload()}
          />
        </>
      )}
    </div>
  );
}
