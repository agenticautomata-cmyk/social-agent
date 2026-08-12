'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '@/lib/client-api';
import { PartnershipFieldVerificationPanel } from './field-verification-panel';

type VerifiedField = { value: string | null; status: string; source: string | null };
type LocalLocation = {
  name: string;
  address: string | null;
  availability: string;
  notes: string | null;
};

type Partnership = {
  id: string;
  title: string;
  summary: string | null;
  sourceUrl: string | null;
  brandName: string | null;
  retailerName: string | null;
  pipelineStatus: string;
  fitScore: number | null;
  fitScoreBreakdown: Record<string, { score: number; reason: string }> | null;
  research: {
    companySummary?: VerifiedField;
    audienceFitRationale?: VerifiedField;
    creatorProgram?: VerifiedField;
    programBenefits?: VerifiedField;
    localFilmingPotential?: VerifiedField;
    creatorContactPath?: VerifiedField;
    organicBeforeApproval?: VerifiedField;
    needsVerification?: string[];
    localLocations?: LocalLocation[];
    researchSummary?: string | null;
    citations?: Array<{ url: string; title: string | null }>;
  } | null;
  creatorPlay: Record<string, unknown> | null;
  needsVerification: string[];
  monetizationPaths: string[];
  researchStatus: string;
  researchError: string | null;
  followUpAt: string | null;
  calendarReminderAt: string | null;
};

const STATUSES = [
  'discovered',
  'researching',
  'qualified',
  'content_ready',
  'application_ready',
  'pitch_ready',
  'applied',
  'pitched',
  'follow_up',
  'accepted',
  'declined',
  'published',
  'monetizing',
];

function availabilityLabel(code: string): string {
  if (code === 'confirmed_available') return 'CONFIRMED AVAILABLE';
  if (code === 'confirmed_unavailable') return 'CONFIRMED UNAVAILABLE (this location)';
  if (code === 'likely_available') return 'LIKELY AVAILABLE';
  return 'UNKNOWN / CALL FIRST';
}

function ResearchField({ label, field }: { label: string; field?: VerifiedField }) {
  if (!field?.value) return null;
  return (
    <div className="text-sm space-y-1">
      <p className="font-semibold">{label}</p>
      <p className="text-paper-soft">{field.value}</p>
      <p className="text-2xs text-paper-muted capitalize">{field.status.replace(/_/g, ' ')}</p>
    </div>
  );
}

export function PartnershipDetailPanel({ partnershipId }: { partnershipId: string }) {
  const [partnership, setPartnership] = useState<Partnership | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followUpAt, setFollowUpAt] = useState('');
  const [calendarReminderAt, setCalendarReminderAt] = useState('');
  const [activities, setActivities] = useState<
    Array<{
      id: string;
      activityType: string;
      entityType: string;
      entityName: string | null;
      subject: string | null;
      matchConfidence: number | null;
      matchedOn: string | null;
      suggestedAction: string | null;
      suggestedStatus: string | null;
      requiresConfirmation: boolean;
      confirmationStatus: string;
      createdAt: string;
    }>
  >([]);

  const load = useCallback(async () => {
    const res = await fetch(clientApiUrl(`/api/creator-partnerships/${partnershipId}`), { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error ?? 'not_found');
    setPartnership(data.partnership);
    setFollowUpAt(data.partnership.followUpAt?.slice(0, 16) ?? '');
    setCalendarReminderAt(data.partnership.calendarReminderAt?.slice(0, 16) ?? '');

    const activityRes = await fetch(clientApiUrl(`/api/creator-partnerships/${partnershipId}/activities`), {
      cache: 'no-store',
    });
    const activityData = await activityRes.json();
    if (activityData.ok) setActivities(activityData.activities ?? []);
  }, [partnershipId]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        await load();
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Load failed');
          setLoading(false);
        }
      }
    }
    void poll();
    const interval = setInterval(() => {
      if (partnership?.researchStatus === 'researching' || partnership?.researchStatus === 'queued') {
        void poll().catch(() => undefined);
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [load, partnership?.researchStatus]);

  async function runAction(action: 'research' | 'build-creator-play') {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(clientApiUrl(`/api/creator-partnerships/${partnershipId}/${action}`), {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? `${action}_failed`);
      setPartnership(data.partnership);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  async function activityAction(activityId: string, action: 'confirm' | 'reject' | 'apply-status' | 'open-email') {
    setBusy(`${action}-${activityId}`);
    setError(null);
    try {
      if (action === 'open-email') {
        const res = await fetch(
          clientApiUrl(`/api/creator-partnerships/${partnershipId}/activities/${activityId}/open-email`),
        );
        const data = await res.json();
        if (!data.ok || !data.url) throw new Error(data.error ?? 'open_failed');
        window.open(data.url, '_blank', 'noopener,noreferrer');
        return;
      }
      const res = await fetch(
        clientApiUrl(`/api/creator-partnerships/${partnershipId}/activities/${activityId}/${action}`),
        { method: 'POST' },
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? `${action}_failed`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activity action failed');
    } finally {
      setBusy(null);
    }
  }

  async function saveStatus(status: string) {
    setBusy('status');
    setError(null);
    try {
      const res = await fetch(clientApiUrl(`/api/creator-partnerships/${partnershipId}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipelineStatus: status,
          followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null,
          calendarReminderAt: calendarReminderAt ? new Date(calendarReminderAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'status_failed');
      setPartnership(data.partnership);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status update failed');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-paper-muted">Loading partnership…</p>;
  if (!partnership) return <p className="text-sm text-red-400">{error ?? 'Not found'}</p>;

  const play = partnership.creatorPlay as Record<string, unknown> | null;
  const breakdown = partnership.fitScoreBreakdown ?? {};

  return (
    <div className="space-y-6">
      <Link href="/partnerships" className="text-xs text-accent">
        ← All partnerships
      </Link>

      <header className="glass-panel-strong p-4 space-y-2">
        <p className="text-2xs uppercase tracking-wider text-paper-muted">Creator partnership</p>
        <h1 className="text-xl font-bold">{partnership.title}</h1>
        <p className="text-sm text-paper-soft">
          {[partnership.brandName, partnership.retailerName].filter(Boolean).join(' · ')}
        </p>
        <div className="flex flex-wrap gap-2 text-2xs">
          <span className="rounded-full border border-paper-edge px-2 py-0.5 capitalize">
            {partnership.pipelineStatus.replace(/_/g, ' ')}
          </span>
          {partnership.fitScore != null ? (
            <span className="rounded-full border border-accent/40 text-accent px-2 py-0.5">
              Fit {partnership.fitScore}
            </span>
          ) : null}
          {partnership.monetizationPaths.map((path) => (
            <span key={path} className="rounded-full border border-paper-edge px-2 py-0.5">
              {path.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
        {partnership.sourceUrl ? (
          <a href={partnership.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-accent">
            Open source
          </a>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => runAction('research')}
          className="btn-ghost text-xs min-h-[40px] px-3"
        >
          {busy === 'research' ? 'Researching…' : 'Re-run research'}
        </button>
        <button
          type="button"
          disabled={!!busy || partnership.researchStatus !== 'complete' && partnership.researchStatus !== 'needs_verification'}
          onClick={() => runAction('build-creator-play')}
          className="btn-primary text-xs min-h-[40px] px-4"
        >
          {busy === 'build-creator-play' ? 'Building…' : 'Build Creator Play'}
        </button>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {partnership.researchError ? (
        <p className="text-sm text-yellow-300">Research error: {partnership.researchError}</p>
      ) : null}

      {Object.keys(breakdown).length > 0 ? (
        <section className="glass-panel p-4 space-y-3">
          <h2 className="font-semibold">Creator fit score</h2>
          {Object.entries(breakdown)
            .filter(([key]) => key !== 'composite' && key !== 'summary')
            .map(([key, val]) => (
              <div key={key} className="text-sm border-l-2 border-accent/20 pl-3">
                <p className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                <p className="text-accent text-xs">{val.score}/100</p>
                <p className="text-paper-soft text-xs">{val.reason}</p>
              </div>
            ))}
          {'summary' in breakdown ? (
            <p className="text-sm text-paper-soft">{(breakdown.summary as { reason?: string; score?: number })?.reason ?? String(breakdown.summary)}</p>
          ) : null}
        </section>
      ) : null}

      {partnership.research ? (
        <section className="glass-panel p-4 space-y-4">
          <h2 className="font-semibold">Research</h2>
          {partnership.research.researchSummary ? (
            <p className="text-sm text-paper-soft">{partnership.research.researchSummary}</p>
          ) : null}
          <ResearchField label="What it is" field={partnership.research.companySummary} />
          <ResearchField label="Audience fit" field={partnership.research.audienceFitRationale} />
          <ResearchField label="Creator program" field={partnership.research.creatorProgram} />
          <ResearchField label="Program benefits" field={partnership.research.programBenefits} />
          <ResearchField label="Local filming" field={partnership.research.localFilmingPotential} />
          <ResearchField label="Creator contact path" field={partnership.research.creatorContactPath} />
          <ResearchField label="Organic before approval" field={partnership.research.organicBeforeApproval} />

          {partnership.research.localLocations?.length ? (
            <div className="space-y-2">
              <p className="font-semibold text-sm">Local verification</p>
              {partnership.research.localLocations.map((loc) => (
                <div key={loc.name} className="text-sm border border-paper-edge rounded-lg p-3">
                  <p className="font-medium">{loc.name}</p>
                  <p className="text-2xs text-accent">{availabilityLabel(loc.availability)}</p>
                  {loc.address ? <p className="text-xs text-paper-soft">{loc.address}</p> : null}
                  {loc.notes ? <p className="text-xs text-paper-muted mt-1">{loc.notes}</p> : null}
                </div>
              ))}
            </div>
          ) : null}

          {(partnership.needsVerification.length > 0 || partnership.research.needsVerification?.length) ? (
            <div className="space-y-1">
              <p className="font-semibold text-sm">Needs verification</p>
              {[...partnership.needsVerification, ...(partnership.research.needsVerification ?? [])].map((item) => (
                <p key={item} className="text-xs text-yellow-300">
                  {item}
                </p>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <PartnershipFieldVerificationPanel
        partnershipId={partnershipId}
        brandName={partnership.brandName}
        retailerName={partnership.retailerName}
        onPartnershipUpdated={(updated) => setPartnership(updated as Partnership)}
        onRebuildCreatorPlay={() => runAction('build-creator-play')}
        rebuildBusy={busy === 'build-creator-play'}
      />

      {play ? (
        <section className="glass-panel p-4 space-y-3">
          <h2 className="font-semibold">Creator Play</h2>
          {(
            [
              ['Opportunity summary', play.opportunitySummary],
              ['Why Kellie should care', play.whyKellieShouldCare],
              ['Recommended strategy', play.recommendedStrategy],
              [
                'Organic vs pitch',
                `${String(play.organicFirstVsPitchFirst ?? '')} — ${String(play.organicFirstRationale ?? '')}`,
              ],
              ['Opening hook', play.openingHook],
              ['Partnership pitch', play.partnershipPitch],
              ['Follow-up', play.followUpRecommendation],
            ] as Array<[string, unknown]>
          ).map(([label, value]) =>
            value ? (
              <div key={label} className="text-sm">
                <p className="font-semibold">{label}</p>
                <p className="text-paper-soft whitespace-pre-wrap">{String(value)}</p>
              </div>
            ) : null,
          )}
          {Array.isArray(play.contentConcepts) ? (
            <div>
              <p className="font-semibold text-sm">Content concepts</p>
              <ul className="list-disc pl-5 text-sm text-paper-soft">
                {play.contentConcepts.map((c) => (
                  <li key={String(c)}>{String(c)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="glass-panel p-4 space-y-3">
        <h2 className="font-semibold">Inbox activity</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-paper-muted">No matched inbox emails yet.</p>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="border border-paper-edge rounded-lg p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-2xs">
                <span className="rounded-full border border-paper-edge px-2 py-0.5 capitalize">
                  {activity.entityType}
                  {activity.entityName ? `: ${activity.entityName}` : ''}
                </span>
                <span className="rounded-full border border-paper-edge px-2 py-0.5">
                  {activity.activityType.replace(/_/g, ' ')}
                </span>
                {activity.matchConfidence != null ? (
                  <span className="rounded-full border border-accent/30 text-accent px-2 py-0.5">
                    {Math.round(activity.matchConfidence * 100)}% match
                  </span>
                ) : null}
                <span className="text-paper-muted">{new Date(activity.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-sm font-medium">{activity.subject ?? '(no subject)'}</p>
              {activity.matchedOn ? (
                <p className="text-xs text-paper-soft">Matched on: {activity.matchedOn}</p>
              ) : null}
              {activity.suggestedAction ? (
                <p className="text-xs text-paper-soft">Suggested action: {activity.suggestedAction}</p>
              ) : null}
              {activity.suggestedStatus ? (
                <p className="text-xs text-accent">
                  Suggested lifecycle: {activity.suggestedStatus.replace(/_/g, ' ')}
                  {activity.requiresConfirmation ? ' (confirmation required)' : ''}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!!busy || activity.confirmationStatus !== 'pending'}
                  onClick={() => activityAction(activity.id, 'confirm')}
                  className="btn-ghost text-xs min-h-[36px] px-3"
                >
                  Confirm match
                </button>
                <button
                  type="button"
                  disabled={!!busy || activity.confirmationStatus !== 'pending'}
                  onClick={() => activityAction(activity.id, 'reject')}
                  className="btn-ghost text-xs min-h-[36px] px-3"
                >
                  Reject match
                </button>
                {activity.suggestedStatus ? (
                  <button
                    type="button"
                    disabled={!!busy || activity.confirmationStatus === 'rejected'}
                    onClick={() => activityAction(activity.id, 'apply-status')}
                    className="btn-primary text-xs min-h-[36px] px-3"
                  >
                    Apply suggested status
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => activityAction(activity.id, 'open-email')}
                  className="btn-ghost text-xs min-h-[36px] px-3"
                >
                  Open email
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="glass-panel p-4 space-y-3">
        <h2 className="font-semibold">Pipeline & reminders</h2>
        <select
          className="input text-sm"
          value={partnership.pipelineStatus}
          onChange={(e) => saveStatus(e.target.value)}
          disabled={!!busy}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <label className="block text-xs space-y-1">
          Follow-up date
          <input
            type="datetime-local"
            className="input w-full text-sm"
            value={followUpAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
          />
        </label>
        <label className="block text-xs space-y-1">
          Calendar reminder
          <input
            type="datetime-local"
            className="input w-full text-sm"
            value={calendarReminderAt}
            onChange={(e) => setCalendarReminderAt(e.target.value)}
          />
        </label>
        <button type="button" className="btn-ghost text-xs" disabled={!!busy} onClick={() => saveStatus(partnership.pipelineStatus)}>
          Save reminder dates
        </button>
      </section>
    </div>
  );
}
