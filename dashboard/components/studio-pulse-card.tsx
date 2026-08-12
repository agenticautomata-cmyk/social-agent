'use client';

import Link from 'next/link';
import type { PreAlphaHome } from '../lib/pre-alpha-types';
import { SectionTitleRow } from './section-help';
import { SECTION_HELP } from '../lib/section-help-text';

export function StudioPulseCard({ pulse }: { pulse: PreAlphaHome['studioPulse'] }) {
  if (!pulse) return null;

  const showProgress =
    pulse.followerCount != null && !pulse.milestoneReached && pulse.followerProgressPct != null;

  return (
    <section className="glass-panel-strong gradient-border p-5 md:p-6 space-y-4">
      <SectionTitleRow
        title={<span className="gradient-text">Studio pulse</span>}
        subtitle="Email · followers · sponsor momentum — live from Benson"
        help={SECTION_HELP.home.studioPulse}
        titleClassName="text-sm font-semibold"
        actions={
          <span
            className={`text-2xs uppercase tracking-wider px-2 py-1 rounded-full ${
              pulse.outreachMode === 'live'
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-amber-500/15 text-amber-300'
            }`}
          >
            outreach {pulse.outreachMode}
          </span>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <PulseTile
          href={pulse.topPendingApprovalHref ?? '/email/approvals'}
          label="Pitches"
          value={String(pulse.pendingEmailApprovals)}
          sub={
            pulse.pendingEmailApprovals > 0
              ? 'waiting for your approval'
              : 'open pitch queue'
          }
          highlight={pulse.pendingEmailApprovals > 0}
        />
        <PulseTile
          href="/email/inbox"
          label="Unread replies"
          value={String(pulse.unreadInboxReplies)}
          highlight={pulse.unreadInboxReplies > 0}
        />
        <PulseTile
          href="/analytics/tiktok"
          label={showProgress ? 'Followers → 10K' : 'TikTok followers'}
          value={
            pulse.followerCount != null
              ? pulse.followerCount.toLocaleString()
              : '—'
          }
          sub={
            showProgress && pulse.followersToGo != null
              ? `${pulse.followersToGo.toLocaleString()} to go · ${pulse.followerProgressPct}%`
              : pulse.milestoneReached
                ? '10K money milestone 🎆'
                : undefined
          }
          highlight={pulse.nearMilestone}
        />
      </div>

      {showProgress && pulse.followerProgressPct != null && (
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-amber-400 transition-all duration-700"
              style={{ width: `${pulse.followerProgressPct}%` }}
            />
          </div>
          {pulse.nearMilestone && (
            <p className="text-xs text-purple-200/90 italic">
              Almost there — Benson fires the 10K celebration + Telegram blast when you cross the line. Brand money zone.
            </p>
          )}
        </div>
      )}

      {pulse.topSponsorPitchHref && pulse.topSponsorPitchLabel && (
        <Link
          href={pulse.topSponsorPitchHref}
          className="block text-sm text-paper-soft hover:text-accent border border-paper-edge/60 rounded-lg px-3 py-2"
        >
          <span className="text-paper-muted">Pitch while hot → </span>
          {pulse.topSponsorPitchLabel}
        </Link>
      )}
    </section>
  );
}

function PulseTile({
  href,
  label,
  value,
  sub,
  highlight,
}: {
  href: string;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl border p-3 transition-colors ${
        highlight
          ? 'border-purple-400/40 bg-purple-500/10'
          : 'border-paper-edge/50 hover:border-accent/40'
      }`}
    >
      <p className="text-2xs uppercase tracking-wider text-paper-muted">{label}</p>
      <p className="text-2xl font-bold stat-mono tabular-nums mt-1">{value}</p>
      {sub && <p className="text-2xs text-paper-muted mt-1">{sub}</p>}
    </Link>
  );
}
