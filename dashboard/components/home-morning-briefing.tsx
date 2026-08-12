'use client';

import Link from 'next/link';
import type { HomeShowroom, HomeShowroomCard, PreAlphaHome } from '../lib/pre-alpha-types';
import { BensonPulseCard } from './benson-pulse-card';
import { DiscoverySkipButton } from './discovery-skip-button';
import { SectionTitleRow } from './section-help';

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

function Hero({ showroom }: { showroom: HomeShowroom }) {
  return (
    <section className="glass-panel-strong gradient-border p-5 md:p-6 space-y-4">
      <div>
        <h2 className="text-lg md:text-xl font-semibold gradient-text leading-snug">
          {showroom.hero.headline}
        </h2>
        <p className="text-sm text-paper-muted mt-1">{showroom.hero.subline}</p>
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {showroom.hero.stats.map((stat) => (
          <li key={stat.label} className="rounded-lg bg-white/[0.04] px-3 py-2">
            <div className="text-xl font-bold tabular-nums text-paper-ink">{stat.value}</div>
            <div className="text-2xs text-paper-muted leading-snug">{stat.label}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CreatorAnalytics({
  showroom,
  studioPulse,
}: {
  showroom: HomeShowroom;
  studioPulse: PreAlphaHome['studioPulse'];
}) {
  const analytics = showroom.creatorAnalytics;
  const followers = analytics?.followers;
  if (!followers && analytics?.activeDeals == null && analytics?.sponsorPipelineActive == null) {
    if ((showroom.creatorMomentum?.length ?? 0) === 0) return null;
  }

  const showProgress =
    followers != null && !followers.milestoneReached && followers.progressPct != null;

  // Pitch while hot — only with a real showroom/CTA target (do not manufacture).
  const moneyCue = showroom.moneyOnTheTable.find((c) => Boolean(c.href && c.title));
  const bestCue =
    showroom.bestMove?.href && showroom.bestMove.title ? showroom.bestMove : null;
  const pulseCue =
    studioPulse?.topSponsorPitchHref && studioPulse.topSponsorPitchLabel
      ? { href: studioPulse.topSponsorPitchHref, label: studioPulse.topSponsorPitchLabel }
      : null;
  const pitchWhileHot =
    moneyCue != null
      ? { href: moneyCue.href!, label: moneyCue.title }
      : bestCue != null && pulseCue != null
        ? { href: pulseCue.href, label: bestCue.title }
        : null;

  return (
    <section className="glass-panel-strong gradient-border p-5 md:p-6 space-y-4">
      <SectionTitleRow
        title={<span className="gradient-text">Creator analytics</span>}
        subtitle="Growth and pipeline — live from Benson"
        actions={
          <Link href="/analytics/tiktok" className="btn-ghost text-xs py-2 min-h-[36px] px-3">
            TikTok
          </Link>
        }
      />

      {followers ? (
        <Link
          href="/analytics/tiktok"
          className={`block rounded-xl border p-4 transition-colors ${
            followers.nearMilestone
              ? 'border-purple-400/40 bg-purple-500/10'
              : 'border-paper-edge/50 hover:border-accent/40'
          }`}
        >
          <p className="text-2xs uppercase tracking-wider text-paper-muted">
            {showProgress || followers.milestoneReached ? 'Followers → 10K' : 'TikTok followers'}
          </p>
          <p className="text-3xl md:text-4xl font-bold stat-mono tabular-nums mt-1 text-paper-ink">
            {followers.count.toLocaleString()}
          </p>
          {showProgress && followers.remaining != null ? (
            <p className="text-xs text-paper-muted mt-1">
              {followers.remaining.toLocaleString()} to go · {followers.progressPct}%
            </p>
          ) : followers.milestoneReached ? (
            <p className="text-xs text-paper-muted mt-1">10K money milestone</p>
          ) : null}
          {followers.trendLabel ? (
            <p className="text-2xs text-paper-dim mt-1">{followers.trendLabel}</p>
          ) : null}
        </Link>
      ) : null}

      {showProgress && followers?.progressPct != null ? (
        <div className="space-y-1">
          <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-amber-400 transition-all duration-700"
              style={{ width: `${Math.min(100, followers.progressPct)}%` }}
            />
          </div>
          {followers.nearMilestone ? (
            <p className="text-xs text-purple-200/90 italic">
              Almost there — brand money zone.
            </p>
          ) : null}
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

      {pitchWhileHot ? (
        <Link
          href={pitchWhileHot.href}
          className="block text-sm text-paper-soft hover:text-accent border border-paper-edge/60 rounded-lg px-3 py-2"
        >
          <span className="text-paper-muted">Pitch while hot → </span>
          {pitchWhileHot.label}
        </Link>
      ) : null}
    </section>
  );
}

export function HomeMorningBriefing({ data }: { data: PreAlphaHome }) {
  const showroom = data.showroom;
  if (!showroom) return null;

  return (
    <div className="space-y-6">
      <Hero showroom={showroom} />

      <BensonPulseCard />

      <section className="glass-panel-strong gradient-border p-5 md:p-6 space-y-3">
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

      {showroom.moneyOnTheTable.length > 0 ? (
        <section className="glass-panel p-5 md:p-6 space-y-3">
          <SectionTitleRow title="Money on the Table" subtitle="Real monetization paths Benson advanced" />
          <ul className="space-y-3">
            {showroom.moneyOnTheTable.map((card) => (
              <ShowroomCardRow key={card.id} card={card} />
            ))}
          </ul>
        </section>
      ) : null}

      <CreatorAnalytics showroom={showroom} studioPulse={data.studioPulse} />

      <section className="glass-panel p-5 md:p-6 space-y-3">
        <SectionTitleRow title="What Benson Handled" subtitle="Automatic work completed or prevented" />
        <ul className="space-y-2">
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
      </section>

      <section className="glass-panel p-5 md:p-6 space-y-3">
        <SectionTitleRow
          title="Needs You"
          subtitle="Only decisions Benson cannot finish alone"
        />
        {showroom.needsYou.length > 0 ? (
          <ul className="space-y-3">
            {showroom.needsYou.slice(0, 3).map((card) => (
              <ShowroomCardRow key={card.id} card={card} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-paper-muted">No action needed from you right now.</p>
        )}
      </section>
    </div>
  );
}
