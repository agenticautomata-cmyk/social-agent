'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BensonChatPanel } from '../../../components/benson-chat-panel';
import { DiscoverySkipButton } from '../../../components/discovery-skip-button';
import { clientApiUrl } from '../../../lib/client-api';
import { formatDateTime } from '../../../lib/datetime';

type VerifiedField = {
  value?: unknown;
  status?: string;
  source?: string | null;
};

type DiscoveryRecord = {
  contentItemId: string;
  normalizedEntityName: string;
  entityType: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  processingStatus: string;
  creatorRelevanceStatus: string;
  lifecycleStatus: string;
  enrichmentComplete: boolean;
  title: string;
  summary: string | null;
  locationName: string | null;
  category: string | null;
  interest: {
    id: string;
    interestLevel: string;
    enrichmentStatus: string;
    nextAction: string | null;
    researchJobId: string | null;
  } | null;
  researchJob: {
    id: string;
    status: string;
    errorMessage: string | null;
    retryCount: number;
  } | null;
  enrichment: Record<string, VerifiedField> | null;
  assistancePackage: {
    whyItMayFit?: Record<string, string>;
    contentOptions?: string[];
    visitPlan?: Record<string, unknown>;
    contentPackage?: Record<string, unknown>;
    businessAction?: Record<string, unknown>;
  } | null;
};

const ASK_STARTERS = [
  'What is this place?',
  'Is it currently open?',
  'What should I film here?',
  'What does it cost?',
  'When should I go?',
  'Has Kellie covered anything similar?',
];

function fieldLabel(key: string, field?: VerifiedField): string | null {
  if (!field || field.status === 'unavailable' || field.value == null) return null;
  const value = Array.isArray(field.value) ? field.value.join(', ') : String(field.value);
  return `${key}: ${value} (${field.status})`;
}

export function DiscoveryDetailPanel({ contentItemId }: { contentItemId: string }) {
  const [record, setRecord] = useState<DiscoveryRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askSeed, setAskSeed] = useState<string | undefined>();

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch(clientApiUrl(`/api/creator-interest/records/${contentItemId}`), {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Failed to load record (${res.status})`);
    const data = (await res.json()) as { record: DiscoveryRecord };
    setRecord(data.record);
  }, [contentItemId]);

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : 'Load failed'));
    const timer = window.setInterval(() => {
      if (record?.researchJob?.status === 'researching' || record?.researchJob?.status === 'queued') {
        void reload().catch(() => null);
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [reload, record?.researchJob?.status]);

  async function runAction(action: string, extra?: Record<string, unknown>) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(clientApiUrl(`/api/creator-interest/records/${contentItemId}/interest`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sourceScreen: 'discovery_detail', ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      if (data.record) setRecord(data.record);
      else await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  if (!record) {
    return <p className="text-sm text-paper-muted">{error ?? 'Loading discovery…'}</p>;
  }

  const enrichment = record.enrichment;
  const phone = enrichment?.phone;
  const email = enrichment?.email;
  const website = enrichment?.website;
  const address = enrichment?.address;
  const mapUrl =
    enrichment?.coordinates?.value && typeof enrichment.coordinates.value === 'object'
      ? `https://www.google.com/maps/search/?api=1&query=${(enrichment.coordinates.value as { lat: number; lng: number }).lat},${(enrichment.coordinates.value as { lat: number; lng: number }).lng}`
      : address?.value
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(address.value))}`
        : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-2xs uppercase tracking-wider text-paper-muted">discovery · creator workspace</p>
        <h1 className="text-2xl font-bold">{record.normalizedEntityName}</h1>
        <p className="text-sm text-paper-muted">
          {[record.category, record.entityType, record.lifecycleStatus, record.creatorRelevanceStatus]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {record.sourceTitle && (
          <p className="text-2xs text-paper-dim">
            Source: {record.sourceTitle.replace(/^\[Benson\]\s*/i, '')}
          </p>
        )}
      </header>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <section className="glass-panel p-4 space-y-3">
        <p className="text-sm leading-relaxed">{record.summary?.slice(0, 500) ?? record.title}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void runAction('interested')}
            className="btn-primary text-xs min-h-[40px] px-4"
          >
            {busy === 'interested' ? 'Working…' : "I'm interested"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => void runAction('research')} className="btn-ghost text-xs min-h-[40px] px-3">
            Research this
          </button>
          <button type="button" disabled={!!busy} onClick={() => void runAction('save_for_later')} className="btn-ghost text-xs min-h-[40px] px-3">
            Save for later
          </button>
          <button type="button" disabled={!!busy} onClick={() => setAskSeed('What should Kellie film here?')} className="btn-ghost text-xs min-h-[40px] px-3">
            Ask Benson about this
          </button>
          <DiscoverySkipButton
            contentItemId={contentItemId}
            sourceScreen="discovery_detail"
            showSnooze
            onSkipped={() => {
              window.location.href = '/editor';
            }}
            className="btn-ghost text-xs min-h-[40px] px-3"
          />
        </div>
        {record.interest?.nextAction && (
          <p className="text-xs text-accent border-l-2 border-accent/40 pl-3">{record.interest.nextAction}</p>
        )}
        {record.researchJob?.status === 'failed' && (
          <button
            type="button"
            className="text-xs text-accent underline"
            onClick={() =>
              record.researchJob &&
              fetch(clientApiUrl(`/api/creator-interest/research/${record.researchJob.id}/retry`), {
                method: 'POST',
              }).then(() => reload())
            }
          >
            Research failed — retry
          </button>
        )}
      </section>

      <section className="glass-panel p-4 space-y-2">
        <h2 className="text-sm font-bold">Verified details</h2>
        <ul className="text-xs space-y-1 text-paper-soft">
          {[
            fieldLabel('Website', website),
            fieldLabel('Address', address),
            fieldLabel('Phone', phone),
            fieldLabel('Email', email),
            fieldLabel('Hours', enrichment?.hours),
            fieldLabel('Open', enrichment?.currentlyOpen),
            fieldLabel('Pricing', enrichment?.pricing),
          ]
            .filter(Boolean)
            .map((line) => (
              <li key={line}>{line}</li>
            ))}
        </ul>
        {enrichment?.needsVerification && Array.isArray(enrichment.needsVerification) && (
          <p className="text-2xs text-paper-muted">
            Needs confirmation: {(enrichment.needsVerification as string[]).join(', ')}
          </p>
        )}
        {enrichment?.researchSummary && (
          <p className="text-xs text-paper-muted mt-2">{enrichment.researchSummary as string}</p>
        )}
      </section>

      {record.assistancePackage && (
        <section className="glass-panel p-4 space-y-3">
          <h2 className="text-sm font-bold">Creator assistance package</h2>
          {record.assistancePackage.whyItMayFit && (
            <div className="text-xs space-y-1">
              {Object.entries(record.assistancePackage.whyItMayFit).map(([key, value]) => (
                <p key={key}>
                  <span className="text-paper-muted">{key}: </span>
                  {value}
                </p>
              ))}
            </div>
          )}
          {record.assistancePackage.visitPlan && (
            <div className="text-xs border-l-2 border-accent/30 pl-3">
              <p className="font-bold mb-1">Visit plan</p>
              <p>{String((record.assistancePackage.visitPlan as Record<string, unknown>).suggestedTiming ?? '')}</p>
            </div>
          )}
          {record.assistancePackage.contentPackage && (
            <div className="text-xs border-l-2 border-accent/30 pl-3">
              <p className="font-bold mb-1">Content hook</p>
              <p>{String((record.assistancePackage.contentPackage as Record<string, unknown>).openingHook ?? '')}</p>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-wrap gap-2">
        {website?.value != null && website.value !== '' ? (
          <a href={String(website.value)} target="_blank" rel="noreferrer" className="btn-ghost text-xs min-h-[36px] px-3">
            Open website
          </a>
        ) : null}
        {record.sourceUrl && (
          <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost text-xs min-h-[36px] px-3">
            Original source
          </a>
        )}
        {mapUrl && (
          <a href={mapUrl} target="_blank" rel="noreferrer" className="btn-ghost text-xs min-h-[36px] px-3">
            Map it
          </a>
        )}
        {phone?.value != null && phone.status === 'verified' ? (
          <a href={`tel:${String(phone.value)}`} className="btn-ghost text-xs min-h-[36px] px-3">
            Call
          </a>
        ) : null}
        {email?.value != null && email.status === 'verified' ? (
          <a href={`mailto:${String(email.value)}`} className="btn-ghost text-xs min-h-[36px] px-3">
            Email
          </a>
        ) : null}
        <button
          type="button"
          className="btn-ghost text-xs min-h-[36px] px-3"
          onClick={() =>
            fetch(clientApiUrl(`/api/creator-interest/records/${contentItemId}/add-to-today`), {
              method: 'POST',
            }).then(() => reload())
          }
        >
          Add to Today
        </button>
        <Link href={`/review/inventory?id=${contentItemId}`} className="btn-ghost text-xs min-h-[36px] px-3 inline-flex items-center">
          Inventory record
        </Link>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">Ask Benson</h2>
        <div className="flex flex-wrap gap-2">
          {ASK_STARTERS.map((q) => (
            <button
              key={q}
              type="button"
              className="text-2xs border border-paper-edge px-2 py-1"
              onClick={() => setAskSeed(q)}
            >
              {q}
            </button>
          ))}
        </div>
        <BensonChatPanel
          variant="embedded"
          pageContext={`/discoveries/${contentItemId}`}
          contentItemId={contentItemId}
          seedMessage={askSeed}
        />
      </section>
    </div>
  );
}
