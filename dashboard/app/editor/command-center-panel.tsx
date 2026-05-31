'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PlannerQuickActions } from '../../components/planner-quick-actions';
import { CreateSponsorLeadButton } from '../../components/create-sponsor-lead-button';
import { LinkedPipelineOpps } from '../../components/linked-pipeline-opps';
import {
  COMMAND_CENTER_SECTION_ORDER,
  metricTone,
  type CommandCenterCard,
  type CommandCenterResponse,
  type CommandCenterSectionId,
  type EditorTab,
} from '../../lib/command-center-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function MetricPill({
  label,
  metric,
}: {
  label: string;
  metric: CommandCenterCard['confidence'];
}) {
  return (
    <div className="text-2xs">
      <span className="text-paper-muted uppercase tracking-wider">{label}</span>
      <div className={`tabular-nums ${metricTone(metric.level)}`}>
        {metric.label}
        <span className="text-paper-dim font-normal ml-1">({metric.score})</span>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const tone = value >= 70 ? 'bg-accent' : value >= 45 ? 'bg-paper-ink' : 'bg-paper-edge';
  return (
    <div className="text-2xs space-y-0.5">
      <div className="flex justify-between text-paper-muted uppercase tracking-wider">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="h-1 bg-paper-edge">
        <div className={`h-1 ${tone}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function BensonBriefingBanner({
  priorities,
}: {
  priorities: NonNullable<CommandCenterResponse['briefingPriorities']>;
}) {
  if (priorities.length === 0) return null;

  return (
    <section className="border-2 border-paper-ink bg-paper-tint px-5 py-4 space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wider">today&apos;s priorities</h2>
      <ol className="space-y-2 text-sm">
        {priorities.map((p) => (
          <li key={p.rank} className="flex gap-3">
            <span className="font-bold tabular-nums text-paper-muted">{p.rank}.</span>
            {p.href ? (
              <Link href={p.href} className="hover:text-accent lowercase">
                {p.label.toLowerCase()}
              </Link>
            ) : (
              <span className="lowercase">{p.label.toLowerCase()}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function OpportunityCard({
  card,
  onAction,
}: {
  card: CommandCenterCard;
  onAction: () => void;
}) {
  return (
    <article
      className={`border-2 p-4 space-y-3 bg-paper transition-colors ${
        card.tracking?.covered
          ? 'border-paper-edge opacity-60'
          : card.tracking?.saved
            ? 'border-accent'
            : 'border-paper-edge hover:border-paper-ink'
      }`}
    >
      <div>
        <h4 className="font-bold lowercase leading-snug">{card.title.toLowerCase()}</h4>
        <div className="text-2xs text-paper-muted mt-1">
          {card.category?.replace(/_/g, ' ') ?? 'general'}
          {card.sourceName ? ` · ${card.sourceName.toLowerCase()}` : ''}
        </div>
      </div>

      <p className="text-xs text-paper-soft leading-relaxed">{card.whyItMatters}</p>

      {card.whyBensonPicked && card.whyBensonPicked.length > 0 && (
        <div className="text-2xs border-l-2 border-accent pl-2 space-y-0.5">
          <span className="uppercase text-paper-muted tracking-wider">why benson picked this</span>
          <ul className="text-paper-soft italic">
            {card.whyBensonPicked.map((reason) => (
              <li key={reason}>· {reason}</li>
            ))}
          </ul>
        </div>
      )}

      {card.tracking?.note && (
        <p className="text-2xs text-paper-muted border-l-2 border-paper-edge pl-2 italic">
          note: {card.tracking.note}
        </p>
      )}

      {card.bensonScores ? (
        <div className="grid grid-cols-2 gap-2 border-y border-paper-edge py-3">
          <ScoreBar label="audience" value={card.bensonScores.audience} />
          <ScoreBar label="sponsor" value={card.bensonScores.sponsor} />
          <ScoreBar label="revenue" value={card.bensonScores.revenue} />
          <ScoreBar label="trend" value={card.bensonScores.trend} />
          <ScoreBar label="confidence" value={card.bensonScores.confidence} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 border-y border-paper-edge py-3">
          <MetricPill label="confidence" metric={card.confidence} />
          <MetricPill label="audience fit" metric={card.audienceFit} />
          <MetricPill label="sponsor" metric={card.sponsorPotential} />
        </div>
      )}

      {card.analyticsSimilar && card.analyticsSimilar.sampleSize > 0 && (
        <div className="text-2xs text-paper-muted space-y-0.5">
          <span className="uppercase tracking-wider">similar content performance</span>
          <p>
            {card.analyticsSimilar.category?.replace(/_/g, ' ') ?? 'category'} · ~
            {card.analyticsSimilar.avgViews?.toLocaleString() ?? '—'} avg views
            {card.analyticsSimilar.avgEngagementRate != null
              ? ` · ${(card.analyticsSimilar.avgEngagementRate * 100).toFixed(1)}% engagement`
              : ''}
            {card.analyticsSimilar.avgCompletionRate != null
              ? ` · ${(card.analyticsSimilar.avgCompletionRate * 100).toFixed(0)}% completion`
              : ''}
            {' '}
            <span className="text-paper-dim">(n={card.analyticsSimilar.sampleSize})</span>
          </p>
        </div>
      )}

      <LinkedPipelineOpps opportunities={card.linkedPipelineOpportunities} />

      <PlannerQuickActions
        target={{ id: card.id, title: card.title, tracking: card.tracking }}
        onAction={onAction}
      />
      <div className="flex flex-wrap gap-2">
        <CreateSponsorLeadButton contentItemId={card.id} title={card.title} compact />
        <Link
          href={`/review/inventory?id=${card.id}`}
          className="inline-block text-2xs border border-paper-edge px-2 py-1 hover:border-paper-ink"
        >
          open details
        </Link>
      </div>
    </article>
  );
}

function CommandSection({
  sectionId,
  question,
  description,
  items,
  onAction,
}: {
  sectionId: CommandCenterSectionId;
  question: string;
  description: string;
  items: CommandCenterCard[];
  onAction: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="border-l-4 border-paper-ink pl-4">
        <h3 className="text-lg font-bold lowercase">{question.toLowerCase()}</h3>
        <p className="text-2xs text-paper-muted mt-1 italic">{description}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-paper-muted italic py-6 border border-dashed border-paper-edge text-center">
          // no strong picks in this lane right now
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((card) => (
            <OpportunityCard key={`${sectionId}-${card.id}`} card={card} onAction={onAction} />
          ))}
        </div>
      )}
    </section>
  );
}

function TabBar({
  tab,
  setTab,
  counts,
}: {
  tab: EditorTab;
  setTab: (t: EditorTab) => void;
  counts: CommandCenterResponse['counts'];
}) {
  const tabs: Array<{ id: EditorTab; label: string; badge?: number }> = [
    { id: 'today', label: 'today' },
    { id: 'week', label: 'this week', badge: undefined },
    { id: 'saved', label: 'saved', badge: counts.saved },
    { id: 'covered', label: 'covered', badge: counts.covered },
  ];

  return (
    <nav className="flex flex-wrap gap-4 border-b-2 border-paper-ink pb-3">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={`text-sm lowercase transition ${
            tab === t.id ? 'font-bold text-paper-ink' : 'text-paper-muted hover:text-paper-ink'
          }`}
        >
          [{t.label}
          {t.badge != null && t.badge > 0 ? ` · ${t.badge}` : ''}]
        </button>
      ))}
    </nav>
  );
}

export function CommandCenterPanel() {
  const [data, setData] = useState<CommandCenterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<EditorTab>('today');

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/editor?limit=6`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<CommandCenterResponse>;
      })
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load editor home');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const greeting = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-8">
      {data?.demoMode && (
        <div className="border border-dashed border-paper-edge px-4 py-2 text-xs text-paper-muted">
          demo mode — editorial workflow with live inventory data
        </div>
      )}

      <section>
        <div className="section-mark mb-3">
          <span>// daily briefing</span>
        </div>
        <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">good morning, kellie</h1>
        <p className="text-paper-muted mt-2 italic">{greeting} — your KC operating dashboard</p>
        {data && (
          <div className="flex flex-wrap gap-4 mt-4 text-2xs text-paper-muted">
            <span>{data.counts.discoveredToday} new today</span>
            <span>{data.counts.followUpsDue} follow-ups due</span>
            <span>{data.counts.saved} saved</span>
            <span>{data.counts.plannedThisWeek} planned this week</span>
            <span>{data.counts.covered} covered</span>
            <span>{data.counts.skipped} skipped</span>
          </div>
        )}
      </section>

      {data?.briefingPriorities && data.briefingPriorities.length > 0 && (
        <BensonBriefingBanner priorities={data.briefingPriorities} />
      )}

      <TabBar tab={tab} setTab={setTab} counts={data?.counts ?? { saved: 0, plannedThisWeek: 0, covered: 0, skipped: 0, followUpsDue: 0, discoveredToday: 0 }} />

      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">
          // error: {error}
        </div>
      )}

      {loading && !data && (
        <div className="py-16 text-center text-paper-muted italic">// loading daily briefing…</div>
      )}

      {data && tab === 'today' &&
        COMMAND_CENTER_SECTION_ORDER.map((sectionId) => {
          const section = data.sections[sectionId];
          return (
            <CommandSection
              key={sectionId}
              sectionId={sectionId}
              question={section.question}
              description={section.description}
              items={section.items}
              onAction={() => void reload()}
            />
          );
        })}

      {data && tab === 'week' && (
        <CommandSection
          sectionId="postWeekend"
          question="What's on deck this week?"
          description="Events, discoveries, and sponsor angles for the next 7 days."
          items={data.weekItems}
          onAction={() => void reload()}
        />
      )}

      {data && tab === 'saved' && (
        <CommandSection
          sectionId="postToday"
          question="Your shortlist"
          description="Opportunities you saved for later."
          items={data.savedItems}
          onAction={() => void reload()}
        />
      )}

      {data && tab === 'covered' && (
        <CommandSection
          sectionId="postToday"
          question="Already covered"
          description="Opportunities you've marked as handled."
          items={data.coveredItems}
          onAction={() => void reload()}
        />
      )}
    </div>
  );
}
