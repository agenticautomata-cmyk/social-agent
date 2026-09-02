'use client';

import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clientApiUrl, parseApiJsonResponse } from '../../../lib/client-api';
import { useActionToast } from '../../../components/action-toast';

const SIGNAL_CONFIRMATIONS: Record<string, { title: string; nextStep: string }> = {
  '/approve': {
    title: 'Verified',
    nextStep: 'Promoted to a confirmed Opportunity — find it under Opportunities and on your calendar.',
  },
  '/keep-unverified': {
    title: 'Kept as unverified',
    nextStep: 'Saved to Opportunities flagged unverified. Benson keeps hunting for an official source.',
  },
  '/research': {
    title: 'Research started',
    nextStep: 'Benson is looking for the official listing now. Reload in a minute to see what it found.',
  },
  '/skip': {
    title: 'Skipped for now',
    nextStep: 'Off your list. Benson keeps watching it and brings it back only if it heats up.',
  },
  '/dismiss': {
    title: 'Dismissed',
    nextStep: 'Gone from Early Signals for good, and Benson will weight this kind of signal lower.',
  },
  '/report-malformed': {
    title: 'Reported malformed',
    nextStep: 'Removed from your queue and logged for operators to fix the ingest pipeline.',
  },
};

type OfficialLinks = {
  organizer?: string | null;
  venue?: string | null;
  ticket?: string | null;
  social?: string | null;
};

type SignalDetail = {
  signal: {
    id: string;
    title: string;
    subtitle?: string | null;
    summary: string;
    businessName: string | null;
    confidenceLevel: string;
    confidenceScore: number;
    confidenceExplanation: Array<{ factor: string; points: number; detail: string }>;
    urgencyLevel: string;
    urgencyExplanation: Array<{ factor: string; points: number; detail: string }>;
    verificationStatus: string;
    sourceUrl: string | null;
    sourceName: string | null;
    sourceCategory: string | null;
    eventDate: string | null;
    city: string | null;
    regionState: string | null;
    missingVerification: string[];
    contentRecommendation: {
      kind?: string;
      suggestedHook?: string;
      confirmedFacts?: string[];
      needsVerification?: string[];
      recommendedAction?: string;
      callToAction?: string;
      discloseNotVisited?: boolean;
      sourceAttribution?: string;
    };
    evidence: Array<{
      id: string;
      extractedClaim: string;
      sourceUrl: string | null;
      sourceName: string | null;
      reliabilityScore: number;
    }>;
    linkedOpportunityId: string | null;
    metadata: Record<string, unknown>;
  };
  deliveries: Array<{ channel: string; success: boolean; deliveredAt: string; providerResponse: string | null }>;
};

function isPlaceholderUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  return /BLACKSPACES_FIXTURE|\/p\/FIXTURE|example\.com|placeholder/i.test(url);
}

function sourceClassificationLabel(signal: SignalDetail['signal']): string {
  const handle = String(signal.sourceName ?? '').match(/@([\w.]+)/i)?.[1]?.toLowerCase();
  if (signal.sourceCategory === 'curator_watchlist' || handle === 'jasfoodjourney') {
    return 'Trusted creator / secondary source';
  }
  if (signal.verificationStatus === 'verified') {
    return signal.sourceName ?? 'Official source';
  }
  return signal.sourceName ?? 'Source';
}

function resolveOpenSource(signal: SignalDetail['signal']): {
  url: string | null;
  label: string;
  note: string | null;
} {
  const meta = signal.metadata ?? {};
  const normalized = meta.normalizedData as { discoveredViaPostUrl?: string } | undefined;
  const discovered =
    typeof meta.discoveredViaPostUrl === 'string'
      ? meta.discoveredViaPostUrl
      : typeof normalized?.discoveredViaPostUrl === 'string'
        ? normalized.discoveredViaPostUrl
        : null;

  const candidates = [discovered, signal.sourceUrl].filter(
    (url): url is string => Boolean(url) && !isPlaceholderUrl(url),
  );
  for (const url of candidates) {
    if (/instagram\.com\/(p|reel|tv)\//i.test(url)) {
      return { url, label: 'Open original source', note: null };
    }
    if (!/instagram\.com\/?$/i.test(url) && !/\/instagram\.com\/[^/]+\/?$/i.test(url)) {
      return { url, label: 'Open original source', note: null };
    }
  }

  return {
    url: null,
    label: 'Original source unavailable',
    note: 'The exact post or email link was not captured for this record. Use Research official source.',
  };
}

function formatEventWhen(eventDate: string | null, summary: string): string {
  const timeMatch = summary.match(/Time:\s*([^\n]+)/i);
  const date = eventDate ? new Date(eventDate) : null;
  const dateLabel =
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null;
  return [dateLabel, timeMatch?.[1]?.trim()].filter(Boolean).join(' · ') || 'Date/time TBD';
}

class RecordErrorBoundary extends Component<
  { children: ReactNode; onDismiss?: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[signal-detail] record render failed', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="glass-panel p-5 space-y-3 border border-red-400/30">
          <h1 className="text-lg font-bold">Record could not be displayed</h1>
          <p className="text-sm text-paper-dim">
            This verification card failed to render. The failure was logged for operators.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost text-xs min-h-[44px] px-4" onClick={this.props.onDismiss}>
              Dismiss / go back
            </button>
            <button
              type="button"
              className="btn-ghost text-xs min-h-[44px] px-4"
              onClick={() => this.setState({ error: null })}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SignalDetailPanel({ signalId }: { signalId: string }) {
  const router = useRouter();
  const [data, setData] = useState<SignalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const { showToast } = useActionToast();

  const reload = useCallback(() => {
    return fetch(clientApiUrl(`/api/early-signals/${signalId}`), { cache: 'no-store' })
      .then(async (res) => {
        const parsed = await parseApiJsonResponse<SignalDetail>(res);
        if (!parsed.ok) throw new Error(parsed.error);
        return parsed.data;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [signalId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function act(path: string, body?: object, options?: { leaveOnSuccess?: boolean }) {
    const previous = data;
    setBusy(path);
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch(clientApiUrl(`/api/early-signals/${signalId}${path}`), {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const parsed = await parseApiJsonResponse<Record<string, unknown>>(res);
      if (!parsed.ok) throw new Error(parsed.error);
      const confirmation = SIGNAL_CONFIRMATIONS[path];
      showToast({
        title: confirmation?.title ?? 'Saved',
        nextStep: confirmation?.nextStep ?? null,
      });
      if (options?.leaveOnSuccess) {
        setActionMessage(confirmation?.nextStep ?? 'Saved — removing from active view…');
        router.push('/signals');
        router.refresh();
        return;
      }
      await reload();
      setActionMessage(confirmation?.nextStep ?? 'Saved');
    } catch (err) {
      setData(previous);
      const message = err instanceof Error ? err.message : 'Action failed';
      setError(message);
      showToast({ title: "That didn't save", nextStep: message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) return <p className="text-sm text-red-300">{error}</p>;
  if (!data) return <p className="text-sm text-paper-muted italic">Loading signal…</p>;

  return (
    <RecordErrorBoundary onDismiss={() => router.push('/signals')}>
      <SignalDetailBody
        data={data}
        busy={busy}
        error={error}
        actionMessage={actionMessage}
        onAct={act}
        onBack={() => router.push('/signals')}
      />
    </RecordErrorBoundary>
  );
}

function SignalDetailBody({
  data,
  busy,
  error,
  actionMessage,
  onAct,
  onBack,
}: {
  data: SignalDetail;
  busy: string | null;
  error: string | null;
  actionMessage: string | null;
  onAct: (path: string, body?: object, options?: { leaveOnSuccess?: boolean }) => Promise<void>;
  onBack: () => void;
}) {
  const s = data.signal;
  const rec = s.contentRecommendation ?? {};
  const confirmedFacts = Array.isArray(rec.confirmedFacts) ? rec.confirmedFacts : [];
  const needsVerification = Array.isArray(rec.needsVerification)
    ? rec.needsVerification
    : Array.isArray(s.missingVerification)
      ? s.missingVerification
      : [];
  const explanations = [
    ...(Array.isArray(s.confidenceExplanation) ? s.confidenceExplanation : []),
    ...(Array.isArray(s.urgencyExplanation) ? s.urgencyExplanation : []),
  ];
  const openSource = resolveOpenSource(s);
  const official = (s.metadata?.officialLinks ??
    (s.metadata?.normalizedData as { officialLinks?: OfficialLinks } | undefined)?.officialLinks ??
    {}) as OfficialLinks;
  const officialUrl = official.ticket || official.organizer || official.venue || official.social || null;
  const slideNumber =
    typeof s.metadata.discoveredViaSlideNumber === 'number'
      ? s.metadata.discoveredViaSlideNumber
      : typeof (s.metadata.normalizedData as { discoveredViaSlideNumber?: number } | undefined)
            ?.discoveredViaSlideNumber === 'number'
        ? (s.metadata.normalizedData as { discoveredViaSlideNumber: number }).discoveredViaSlideNumber
        : null;
  const sourceKind = sourceClassificationLabel(s);
  const venue = s.businessName;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 space-y-3">
        <div className="flex flex-wrap gap-2 text-2xs uppercase text-paper-muted">
          <span className="px-2 py-1 rounded bg-paper-edge">{sourceKind}</span>
          <span className="px-2 py-1 rounded bg-paper-edge">{s.verificationStatus} verification</span>
          <span className="px-2 py-1 rounded bg-paper-edge">
            {Math.round(Number(s.confidenceScore) <= 1 ? Number(s.confidenceScore) * 100 : Number(s.confidenceScore))}%
            confidence
          </span>
        </div>
        <h1 className="text-xl font-bold line-clamp-3 break-words">{s.title}</h1>
        {s.subtitle ? <p className="text-sm text-paper-muted line-clamp-2">{s.subtitle}</p> : null}
        {venue ? <p className="text-sm text-paper-dim">{venue}</p> : null}
        <p className="text-sm">{formatEventWhen(s.eventDate, s.summary)}</p>
        {(s.city || s.regionState) && (
          <p className="text-xs text-paper-muted">
            {[s.city, s.regionState].filter(Boolean).join(', ')}
          </p>
        )}
        <p className="text-sm text-paper-soft whitespace-pre-wrap">{s.summary}</p>
        {slideNumber != null ? (
          <p className="text-2xs text-paper-muted">Carousel slide {slideNumber}</p>
        ) : null}
        {openSource.note ? <p className="text-2xs text-amber-200">{openSource.note}</p> : null}
      </div>

      <section className="glass-panel p-4">
        <h2 className="text-sm font-semibold mb-2">Recommended action</h2>
        <p className="text-sm font-medium">{rec.recommendedAction ?? 'Review and verify'}</p>
        {rec.callToAction ? <p className="text-sm text-paper-dim mt-2">{rec.callToAction}</p> : null}
        {rec.suggestedHook ? <p className="text-xs text-paper-muted mt-2">Hook: {rec.suggestedHook}</p> : null}
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="glass-panel p-4">
          <h2 className="text-sm font-semibold mb-2">Captured evidence</h2>
          <ul className="text-sm space-y-1">
            {(confirmedFacts.length ? confirmedFacts : ['No confirmed facts yet']).map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
        </section>
        <section className="glass-panel p-4">
          <h2 className="text-sm font-semibold mb-2">Still needs verification</h2>
          <ul className="text-sm space-y-1">
            {(needsVerification.length ? needsVerification : ['Official confirmation']).map((f) => (
              <li key={f}>? {f}</li>
            ))}
          </ul>
        </section>
      </div>

      {explanations.length > 0 ? (
        <section className="glass-panel p-4">
          <h2 className="text-sm font-semibold mb-2">Why Benson scored it this way</h2>
          <ul className="text-sm space-y-1">
            {explanations.map((line, idx) => (
              <li key={`${line.factor}-${idx}`}>
                <span className="text-paper-dim">{line.factor}</span>
                {line.points ? ` (+${line.points})` : ''}: {line.detail}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {s.evidence.length > 0 ? (
        <section className="glass-panel p-4">
          <h2 className="text-sm font-semibold mb-2">Evidence</h2>
          <ul className="text-sm space-y-2">
            {s.evidence.map((e) => (
              <li key={e.id}>
                <div>{e.extractedClaim}</div>
                {e.sourceUrl ? (
                  <a href={e.sourceUrl} className="text-2xs text-accent" target="_blank" rel="noreferrer">
                    {e.sourceName ?? e.sourceUrl}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary text-xs min-h-[44px] px-4"
          disabled={!!busy}
          onClick={() => void onAct('/approve', undefined, { leaveOnSuccess: true })}
        >
          Approve as verified
        </button>
        <button
          type="button"
          className="btn-ghost text-xs min-h-[44px] px-4"
          disabled={!!busy}
          onClick={() => void onAct('/keep-unverified', undefined, { leaveOnSuccess: true })}
        >
          Keep as unverified Opportunity
        </button>
        <button
          type="button"
          className="btn-ghost text-xs min-h-[44px] px-4"
          disabled={!!busy}
          onClick={() => void onAct('/research')}
        >
          Research official source
        </button>
        <button
          type="button"
          className="btn-ghost text-xs min-h-[44px] px-4"
          disabled={!!busy}
          onClick={() =>
            void onAct('/skip', { sourceScreen: 'early_signals', reason: 'skipped_for_now' }, { leaveOnSuccess: true })
          }
        >
          Skip for now
        </button>
        <button
          type="button"
          className="btn-ghost text-xs min-h-[44px] px-4"
          disabled={!!busy}
          onClick={() => void onAct('/dismiss', { reason: 'dismissed' }, { leaveOnSuccess: true })}
        >
          Dismiss
        </button>
        <button
          type="button"
          className="btn-ghost text-xs min-h-[44px] px-4"
          disabled={!!busy}
          onClick={() => void onAct('/report-malformed', { note: 'ui_report' }, { leaveOnSuccess: true })}
        >
          Report malformed record
        </button>
        {openSource.url ? (
          <a
            href={openSource.url}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost text-xs min-h-[44px] px-4 inline-flex items-center"
          >
            {openSource.label}
          </a>
        ) : null}
        {officialUrl ? (
          <a
            href={officialUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost text-xs min-h-[44px] px-4 inline-flex items-center"
          >
            Open researched official source
          </a>
        ) : null}
        <Link
          href={`/?ask=${encodeURIComponent(`Research and verify: ${s.title}${venue ? ` at ${venue}` : ''}`)}`}
          className="btn-ghost text-xs min-h-[44px] px-4 inline-flex items-center"
        >
          Ask Benson
        </Link>
        {s.linkedOpportunityId ? (
          <Link href={`/review/inventory?id=${s.linkedOpportunityId}`} className="btn-ghost text-xs min-h-[44px] px-4 inline-flex items-center">
            View opportunity
          </Link>
        ) : null}
      </div>

      {actionMessage ? <p className="text-sm text-accent">{actionMessage}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <button type="button" className="btn-ghost text-xs min-h-[44px] px-4" onClick={onBack}>
        ← Back to Early Signals
      </button>
    </div>
  );
}
