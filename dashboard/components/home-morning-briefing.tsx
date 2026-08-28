'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { HomeShowroom, HomeShowroomCard, PreAlphaHome } from '../lib/pre-alpha-types';
import { clientApiUrl } from '../lib/client-api';
import { notifyLocalChange } from '../lib/benson-data-refresh';
import { formatDateTime } from '../lib/datetime';
import { BensonPulseCard } from './benson-pulse-card';
import { DiscoverySkipButton } from './discovery-skip-button';
import { SectionTitleRow } from './section-help';
import { useActionToast } from './action-toast';

function ShowroomCardRow({
  card,
  emptyPrimary,
}: {
  card: HomeShowroomCard;
  emptyPrimary?: string;
}) {
  const primary = card.actions.find((a) => a.kind === 'primary' && a.href);
  const details = card.actions.find((a) => a.kind === 'details' && a.href);
  const hasSkip = Boolean(card.contentItemId);

  return (
    <li className="rounded-xl border border-paper-edge/80 bg-white/[0.03] p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {card.statusLabel ? (
            <p className="text-2xs uppercase tracking-wider text-accent">{card.statusLabel}</p>
          ) : null}
          <p className="text-sm font-semibold leading-snug mt-0.5">{card.title}</p>
          <p className="text-xs text-paper-muted mt-1 leading-relaxed">{card.reason}</p>
        </div>
        {primary ? (
          <Link href={primary.href} className="btn-primary text-2xs py-2 px-3 min-h-[36px] shrink-0">
            {primary.label}
          </Link>
        ) : emptyPrimary ? (
          <span className="text-2xs text-paper-dim shrink-0">{emptyPrimary}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {hasSkip ? (
          <DiscoverySkipButton
            contentItemId={card.contentItemId!}
            sourceScreen="home_showroom"
            showSnooze
            className="btn-secondary text-2xs py-2 min-h-[36px] px-3"
          />
        ) : null}
        {details && details.href !== primary?.href ? (
          <Link href={details.href} className="btn-ghost text-2xs py-2 min-h-[36px] px-3">
            Details
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function TodaysBriefOrHero({ showroom }: { showroom: HomeShowroom }) {
  const brief = showroom.todaysBrief;
  const changes = (brief?.changes ?? []).slice(0, 3);
  const hasBrief =
    brief != null && (Boolean(brief.headline?.trim()) || changes.length > 0 || Boolean(brief.anomaly));

  if (hasBrief && brief) {
    return (
      <section className="glass-panel-strong gradient-border p-3 md:p-4 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold gradient-text leading-snug">Today&apos;s Brief</h2>
          {brief.asOf ? (
            <p className="text-2xs text-paper-dim shrink-0">{formatDateTime(brief.asOf)}</p>
          ) : null}
        </div>
        {brief.headline ? (
          <p className="text-sm font-medium leading-snug text-paper-ink">{brief.headline}</p>
        ) : (
          <p className="text-sm text-paper-muted leading-snug">{showroom.hero.subline}</p>
        )}
        {brief.anomaly ? (
          <p className="text-xs rounded-lg border border-amber-400/25 bg-amber-400/10 px-2.5 py-1.5 text-amber-100">
            {brief.anomaly}
          </p>
        ) : null}
        {changes.length > 0 ? (
          <ul className="text-xs space-y-1 list-disc list-inside text-paper-soft">
            {changes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  return (
    <section className="glass-panel-strong gradient-border p-3 md:p-4 space-y-1">
      <h2 className="text-base font-semibold gradient-text leading-snug">{showroom.hero.headline}</h2>
      <p className="text-xs text-paper-muted">{showroom.hero.subline}</p>
    </section>
  );
}

function CreatorMomentum({ showroom }: { showroom: HomeShowroom }) {
  const analytics = showroom.creatorAnalytics;
  const snapshot = showroom.analyticsSnapshot;
  const followers = analytics?.followers;
  const snapshotChanges = (snapshot?.changes ?? []).slice(0, 3);
  const hasTiles = (showroom.creatorMomentum?.length ?? 0) > 0;
  const hasCore =
    followers != null ||
    analytics?.activeDeals != null ||
    analytics?.sponsorPipelineActive != null ||
    snapshot?.followers != null ||
    snapshotChanges.length > 0 ||
    Boolean(snapshot?.headline) ||
    Boolean(snapshot?.anomaly);

  if (!hasCore && !hasTiles) return null;

  const showProgress =
    followers != null && !followers.milestoneReached && followers.progressPct != null;
  const followerCount = followers?.count ?? snapshot?.followers ?? null;

  return (
    <section className="glass-panel-strong gradient-border p-3 md:p-4 space-y-3">
      <SectionTitleRow
        title={<span className="gradient-text">Creator Momentum</span>}
        subtitle="Growth and pipeline — live from Benson"
        actions={
          <Link href="/analytics/tiktok" className="btn-ghost text-xs py-2 min-h-[36px] px-3">
            TikTok
          </Link>
        }
      />

      {snapshot?.headline ? (
        <p className="text-sm font-medium leading-snug">{snapshot.headline}</p>
      ) : null}
      {snapshot?.anomaly ? (
        <p className="text-xs rounded-lg border border-amber-400/25 bg-amber-400/10 px-2.5 py-1.5 text-amber-100">
          {snapshot.anomaly}
        </p>
      ) : null}
      {snapshotChanges.length > 0 ? (
        <ul className="text-xs space-y-1 list-disc list-inside text-paper-soft">
          {snapshotChanges.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {followerCount != null ? (
        <Link
          href="/analytics/tiktok"
          className={`block rounded-xl border p-3 transition-colors ${
            followers?.nearMilestone
              ? 'border-purple-400/40 bg-purple-500/10'
              : 'border-paper-edge/50 hover:border-accent/40'
          }`}
        >
          <p className="text-2xs uppercase tracking-wider text-paper-muted">
            {showProgress || followers?.milestoneReached ? 'Followers → 10K' : 'TikTok followers'}
          </p>
          <p className="text-2xl md:text-3xl font-bold stat-mono tabular-nums mt-0.5 text-paper-ink">
            {followerCount.toLocaleString()}
            {snapshot?.followerDelta != null && snapshot.followerDelta !== 0 ? (
              <span className="text-sm font-semibold text-accent ml-2">
                {snapshot.followerDelta > 0 ? '+' : ''}
                {snapshot.followerDelta}
              </span>
            ) : null}
          </p>
          {showProgress && followers?.remaining != null ? (
            <p className="text-xs text-paper-muted mt-1">
              {followers.remaining.toLocaleString()} to go · {followers.progressPct}%
            </p>
          ) : followers?.milestoneReached ? (
            <p className="text-xs text-paper-muted mt-1">10K money milestone</p>
          ) : null}
          {followers?.trendLabel ? (
            <p className="text-2xs text-paper-dim mt-1">{followers.trendLabel}</p>
          ) : null}
        </Link>
      ) : null}

      {showProgress && followers?.progressPct != null ? (
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-amber-400 transition-all duration-700"
              style={{ width: `${Math.min(100, followers.progressPct)}%` }}
            />
          </div>
        </div>
      ) : null}

      {(analytics?.activeDeals != null || analytics?.sponsorPipelineActive != null) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-paper-muted">
          {analytics?.activeDeals != null ? (
            <Link href="/pipeline" className="hover:text-accent">
              <span className="text-paper-dim">Active deals</span>{' '}
              <span className="font-semibold text-paper-ink tabular-nums">{analytics.activeDeals}</span>
            </Link>
          ) : null}
          {analytics?.activeDeals != null && analytics?.sponsorPipelineActive != null ? (
            <span className="text-paper-edge" aria-hidden>
              ·
            </span>
          ) : null}
          {analytics?.sponsorPipelineActive != null ? (
            <Link href="/sponsor-intelligence" className="hover:text-accent">
              <span className="text-paper-dim">Sponsor pipeline</span>{' '}
              <span className="font-semibold text-paper-ink tabular-nums">
                {analytics.sponsorPipelineActive}
              </span>
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}

const BEST_USE_LABEL: Record<'film' | 'share' | 'research' | 'contact', string> = {
  film: 'Film',
  share: 'Share',
  research: 'Research',
  contact: 'Contact',
};

function WorthALookSection({
  items,
}: {
  items: NonNullable<HomeShowroom['worthALook']>;
}) {
  const { showToast } = useActionToast();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const visible = items.filter((item) => !hiddenIds.has(item.id));

  if (visible.length === 0) return null;

  function hide(id: string) {
    setHiddenIds((prev) => new Set(prev).add(id));
  }

  async function markInterested(contentItemId: string, id: string) {
    setBusyId(id);
    hide(id);
    try {
      const res = await fetch(clientApiUrl(`/api/creator-interest/records/${contentItemId}/interest`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'interested', sourceScreen: 'home_worth_a_look' }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; nextStep?: string };
      if (!res.ok) throw new Error(body.error ?? `Interest failed (${res.status})`);
      notifyLocalChange(['opportunities', 'discoveries', 'recommendations', 'home_briefing']);
      showToast({ title: 'Interested', nextStep: body.nextStep ?? 'Saved for follow-up.' });
    } catch (err) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      const message = err instanceof Error ? err.message : 'Could not save interest';
      showToast({ title: "That didn't save", nextStep: message, tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="glass-panel p-3 md:p-4 space-y-3">
      <SectionTitleRow title="Worth a Look" subtitle="Valuable, not urgent" />
      <ul className="space-y-3">
        {visible.map((item) => {
          const busy = busyId === item.id;
          return (
            <li
              key={item.id}
              className="rounded-xl border border-paper-edge/80 bg-white/[0.03] p-3 space-y-2"
            >
              <div className="min-w-0 space-y-1">
                <Link href={item.href} className="text-sm font-semibold leading-snug hover:text-accent">
                  {item.title}
                </Link>
                <p className="text-xs text-paper-soft">{item.whatItIs}</p>
                {item.whenWhere ? (
                  <p className="text-2xs text-paper-muted">{item.whenWhere}</p>
                ) : null}
                <p className="text-xs text-paper-muted leading-relaxed">{item.reason}</p>
                <p className="text-2xs text-paper-dim">
                  Best use: {BEST_USE_LABEL[item.bestUse]}
                  {item.verificationGap ? ` · Gap: ${item.verificationGap}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void markInterested(item.contentItemId, item.id)}
                  className="btn-primary text-2xs py-2 min-h-[36px] px-3"
                >
                  Interested
                </button>
                {item.contentItemId ? (
                  <DiscoverySkipButton
                    contentItemId={item.contentItemId}
                    sourceScreen="home_worth_a_look"
                    showSnooze
                    onSkipped={() => hide(item.id)}
                    className="btn-secondary text-2xs py-2 min-h-[36px] px-3"
                  />
                ) : null}
                {item.sourceUrl ? (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost text-2xs py-2 min-h-[36px] px-3"
                  >
                    Source
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HomeMorningBriefing({ data }: { data: PreAlphaHome }) {
  const showroom = data.showroom;
  if (!showroom) return null;

  const worthALook = showroom.worthALook ?? [];

  return (
    <div className="space-y-4">
      <TodaysBriefOrHero showroom={showroom} />

      <BensonPulseCard />

      <section className="glass-panel-strong gradient-border p-3 md:p-4 space-y-3">
        <SectionTitleRow
          title="Best Move"
          subtitle="One strongest action — or nothing urgent"
          actions={
            <Link href="/editor" className="btn-ghost text-xs py-2 min-h-[36px] px-3">
              Open Today
            </Link>
          }
        />
        {showroom.bestMove ? (
          <ul className="space-y-3">
            <ShowroomCardRow card={showroom.bestMove} />
          </ul>
        ) : (
          <p className="text-sm text-paper-muted">
            Benson has nothing urgent. Ready when you are.
          </p>
        )}
      </section>

      {showroom.needsYou.length > 0 ? (
        <section className="glass-panel p-3 md:p-4 space-y-3">
          <SectionTitleRow
            title="Needs You"
            subtitle="Only decisions Benson cannot finish alone"
          />
          <ul className="space-y-3">
            {showroom.needsYou.slice(0, 3).map((card) => (
              <ShowroomCardRow key={card.id} card={card} />
            ))}
          </ul>
        </section>
      ) : null}

      {showroom.moneyOnTheTable.length > 0 ? (
        <section className="glass-panel p-3 md:p-4 space-y-3">
          <SectionTitleRow title="Money on the Table" subtitle="Real monetization paths Benson advanced" />
          <ul className="space-y-3">
            {showroom.moneyOnTheTable.map((card) => (
              <ShowroomCardRow key={card.id} card={card} />
            ))}
          </ul>
        </section>
      ) : null}

      {worthALook.length > 0 ? <WorthALookSection items={worthALook} /> : null}

      <CreatorMomentum showroom={showroom} />

      {showroom.whatBensonHandled.length > 0 ? (
        <details className="glass-panel p-3 md:p-4 group">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-paper-ink">What Benson Handled</span>
            <span className="text-2xs text-paper-dim group-open:hidden">
              {showroom.whatBensonHandled.length} items
            </span>
          </summary>
          <ul className="mt-3 space-y-2">
            {showroom.whatBensonHandled.map((item) => (
              <li
                key={item.id}
                className="text-sm text-paper-ink leading-snug flex gap-2"
              >
                <span className="text-accent shrink-0">✓</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
