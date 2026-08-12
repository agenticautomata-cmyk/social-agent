'use client';

import Link from 'next/link';
import { useState } from 'react';
import { clientApiUrl } from '../../../../lib/client-api';
import { useActionToast } from '../../../../components/action-toast';
import { useDiscoveryRecord } from '../../../../lib/use-discovery-record';

export function VisitPlanPanel({ contentItemId }: { contentItemId: string }) {
  const { record, error, loading, reload } = useDiscoveryRecord(contentItemId, 'plan_visit');
  const { showToast } = useActionToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [suggestDate, setSuggestDate] = useState('');

  const plan = record?.assistancePackage?.visitPlan;

  async function addToCalendar() {
    if (!suggestDate) {
      showToast({ title: 'Pick a date first', nextStep: 'Choose when you plan to visit.', tone: 'error' });
      return;
    }
    setBusy('calendar');
    try {
      const res = await fetch(clientApiUrl('/api/calendar/items'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Visit: ${record?.normalizedEntityName}`,
          itemType: 'content_filming',
          sourceRecordType: 'content_item',
          sourceRecordId: contentItemId,
          sourceUrl: record?.sourceUrl ?? undefined,
          internalDetailUrl: `/discoveries/${contentItemId}/visit-plan`,
          startAt: new Date(suggestDate).toISOString(),
          location: record?.locationName ?? undefined,
          planningStatus: 'tentative',
          notes: plan?.suggestedTiming ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Could not add to calendar');
      showToast({
        title: 'Added as an internal calendar suggestion',
        nextStep: 'This is not exported to Google Calendar — it just holds the plan on your Benson calendar.',
      });
    } catch (err) {
      showToast({ title: "Couldn't add to calendar", nextStep: err instanceof Error ? err.message : null, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  if (loading && !record) return <p className="text-sm text-paper-muted italic">Loading visit plan…</p>;
  if (!record) return <p className="text-sm text-red-600">{error ?? 'Discovery not found'}</p>;

  return (
    <div className="space-y-6">
      <Link href={`/discoveries/${contentItemId}`} className="btn-ghost text-xs inline-flex">
        ← {record.normalizedEntityName}
      </Link>

      <header className="space-y-1">
        <p className="text-2xs uppercase tracking-wider text-paper-muted">Visit plan</p>
        <h1 className="text-xl font-bold">{record.normalizedEntityName}</h1>
      </header>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {!plan ? (
        <div className="glass-panel p-4">
          <p className="text-sm text-paper-muted italic">
            {record.researchJob?.status === 'researching' || record.researchJob?.status === 'queued'
              ? 'Benson is building your visit plan…'
              : 'No visit plan yet.'}
          </p>
        </div>
      ) : (
        <>
          <section className="glass-panel p-4 space-y-2">
            <p className="text-2xs uppercase tracking-wider text-paper-muted">When to go</p>
            <p className="text-sm">{plan.suggestedTiming}</p>
            {plan.weatherDependent && <p className="text-xs text-accent">Weather-dependent — check forecast before heading out.</p>}
          </section>

          {plan.address && (
            <section className="glass-panel p-4 space-y-2">
              <p className="text-2xs uppercase tracking-wider text-paper-muted">Venue / address</p>
              <p className="text-sm">{plan.address}</p>
              <div className="flex flex-wrap gap-2">
                {plan.mapUrl && (
                  <a href={plan.mapUrl} target="_blank" rel="noreferrer" className="btn-ghost text-xs min-h-[36px] px-3">
                    Directions
                  </a>
                )}
              </div>
              {plan.parkingNotes && <p className="text-xs text-paper-muted">Parking: {plan.parkingNotes}</p>}
            </section>
          )}

          {plan.filmingRequirements && (
            <section className="glass-panel p-4 space-y-1">
              <p className="text-2xs uppercase tracking-wider text-paper-muted">Filming window / requirements</p>
              <p className="text-sm">{plan.filmingRequirements}</p>
            </section>
          )}

          {plan.shotList?.length ? (
            <section className="glass-panel p-4 space-y-2">
              <p className="text-2xs uppercase tracking-wider text-paper-muted">Must-get shots</p>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {plan.shotList.map((shot) => (
                  <li key={shot}>{shot}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {plan.questionsToAsk?.length ? (
            <section className="glass-panel p-4 space-y-2">
              <p className="text-2xs uppercase tracking-wider text-paper-muted">Questions to ask</p>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {plan.questionsToAsk.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {plan.verifyBeforeLeaving?.length ? (
            <section className="glass-panel p-4 space-y-2 border-l-2 border-accent/40">
              <p className="text-2xs uppercase tracking-wider text-accent">Verify before you leave</p>
              <ul className="list-disc pl-5 text-xs space-y-0.5">
                {plan.verifyBeforeLeaving.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="glass-panel p-4 space-y-2">
            <p className="text-2xs uppercase tracking-wider text-paper-muted">Add as internal calendar suggestion</p>
            <p className="text-2xs text-paper-dim">Kept on your Benson calendar only — no automatic Google Calendar export.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={suggestDate}
                onChange={(e) => setSuggestDate(e.target.value)}
                className="text-sm border border-paper-edge bg-paper px-2 py-1.5 rounded"
              />
              <button type="button" disabled={!!busy} onClick={() => void addToCalendar()} className="btn-primary text-xs min-h-[40px] px-4">
                {busy === 'calendar' ? 'Adding…' : 'Add suggestion'}
              </button>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <Link href={`/discoveries/${contentItemId}/content-package`} className="btn-ghost text-xs min-h-[40px] px-3 inline-flex items-center">
              ← Content package
            </Link>
            <Link href={`/discoveries/${contentItemId}/contact`} className="btn-ghost text-xs min-h-[40px] px-3 inline-flex items-center">
              Contact business →
            </Link>
            <button type="button" className="btn-ghost text-xs min-h-[40px] px-3" onClick={() => void reload()}>
              Refresh
            </button>
          </div>
        </>
      )}
    </div>
  );
}
