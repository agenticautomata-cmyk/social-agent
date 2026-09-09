'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { clientApiUrl, parseApiJsonResponse } from '@/lib/client-api';
import { useActionToast } from '@/components/action-toast';
import {
  KC_HUB_VIEWS,
  KC_HUB_VIEW_LABELS,
  KC_COMPENSATION_ACCESS_LABELS,
  KC_EVIDENCE_STATE_LABELS,
  KC_ROUTE_TYPE_LABELS,
  type KcContactIntelligenceFilters,
  type KcFeedbackAction,
  type KcHubListResponse,
  type KcHubView,
  type KcProgramRow,
  type KcRecommendationCard,
} from '@/lib/contact-intelligence-ui';
import { ContactsProgramsFilters } from './filters';
import { RecommendationCard } from './recommendation-card';

const RELATED_LINKS = [
  { href: '/discoveries', label: 'Discover' },
  { href: '/watchlist', label: 'Watchlist' },
  { href: '/partnerships', label: 'Partnerships' },
  { href: '/sponsors', label: 'CRM' },
  { href: '/email/approvals', label: 'Pitches' },
  { href: '/media-kits', label: 'Media Kits' },
  { href: '/editor', label: 'Today' },
  { href: '/program-library', label: 'Program library' },
  { href: '/email/form-packets', label: 'Form packets' },
] as const;

function buildQuery(view: KcHubView, filters: KcContactIntelligenceFilters): string {
  const params = new URLSearchParams();
  params.set('view', view);
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
}

function emptyStateCopy(view: KcHubView, stub: boolean): string {
  if (stub) {
    return 'Contact intelligence is connected but not filled yet. When Benson has verified routes, recommendations appear here — not a dump of every imported row.';
  }
  switch (view) {
    case 'recommended_now':
      return 'No strong recommendations right now. Benson only surfaces fits with a clear why-now.';
    case 'verified_contacts':
      return 'No verified contacts match these filters.';
    case 'programs_applications':
      return 'No programs or applications match these filters.';
    case 'needs_verification':
      return 'Nothing waiting on verification.';
    case 'follow_ups':
      return 'No follow-ups due.';
    case 'recently_changed':
      return 'No recent contact or program changes.';
    default:
      return 'Nothing here yet.';
  }
}

function ProgramCard({ row }: { row: KcProgramRow }) {
  const href = row.contactId
    ? `/contacts-programs/${row.contactId}`
    : row.applicationUrl ?? undefined;
  return (
    <article className="glass-panel p-4 space-y-2">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h3 className="font-semibold">{row.organizationName}</h3>
          <p className="text-sm text-paper-muted">{row.programName}</p>
        </div>
        <span className="text-2xs uppercase border border-paper-edge px-2 py-0.5 h-fit">
          {KC_ROUTE_TYPE_LABELS[row.routeType]}
        </span>
      </div>
      <p className="text-sm">
        {KC_EVIDENCE_STATE_LABELS[row.evidenceState]} ·{' '}
        {KC_COMPENSATION_ACCESS_LABELS[row.compensationAccessType]}
      </p>
      {row.benefitSummary ? <p className="text-sm">{row.benefitSummary}</p> : null}
      {row.requirementsSummary ? (
        <p className="text-xs text-paper-muted">Requirements: {row.requirementsSummary}</p>
      ) : null}
      {row.compensationAccessType === 'media_access_not_paid' ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Media access is not paid work and is not guaranteed.
        </p>
      ) : null}
      {row.compensationAccessType === 'unknown' ? (
        <p className="text-xs text-paper-muted">Compensation unknown — do not invent terms.</p>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        {href ? (
          <Link
            href={href}
            className="studio-btn-primary text-sm px-4 py-2 min-h-[44px] inline-flex items-center"
          >
            Open brief
          </Link>
        ) : null}
        {row.applicationUrl ? (
          <a
            href={row.applicationUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost text-sm px-3 py-2 min-h-[44px] inline-flex items-center"
          >
            Application page
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function ContactsProgramsPanel() {
  const searchParams = useSearchParams();
  const initialView = (searchParams.get('view') as KcHubView | null) ?? 'recommended_now';
  const [view, setView] = useState<KcHubView>(
    KC_HUB_VIEWS.includes(initialView) ? initialView : 'recommended_now',
  );
  const [filters, setFilters] = useState<KcContactIntelligenceFilters>({});
  const [data, setData] = useState<KcHubListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { showToast } = useActionToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        clientApiUrl(`/api/contact-intelligence/hub?${buildQuery(view, filters)}`),
        { cache: 'no-store' },
      );
      const parsed = await parseApiJsonResponse<KcHubListResponse>(res);
      if (!parsed.ok) throw new Error(parsed.error);
      setData(parsed.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [view, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendFeedback(id: string, action: KcFeedbackAction) {
    setBusyId(id);
    try {
      const res = await fetch(
        clientApiUrl(`/api/contact-intelligence/recommendations/${id}/feedback`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      );
      const parsed = await parseApiJsonResponse<{ stub?: boolean; recorded?: boolean }>(res);
      if (!parsed.ok) throw new Error(parsed.error);
      if (parsed.data.stub) {
        showToast({
          title: 'Feedback noted locally',
          nextStep: 'Ranking store is not wired yet — primary will persist these actions.',
        });
      } else {
        showToast({
          title: action === 'dismissed' ? 'Dismissed' : action === 'saved' ? 'Saved' : 'Recorded',
          nextStep: 'Benson will use this to improve recommendations.',
        });
        if (action === 'dismissed') await load();
      }
    } catch (err) {
      showToast({
        title: "That didn't save",
        nextStep: err instanceof Error ? err.message : 'Feedback failed',
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  }

  const cards: KcRecommendationCard[] = useMemo(() => {
    if (!data) return [];
    if (view === 'recommended_now' || view === 'follow_ups' || view === 'recently_changed') {
      return data.recommendations;
    }
    if (view === 'programs_applications') return [];
    return data.contacts.length > 0 ? data.contacts : data.recommendations;
  }, [data, view]);

  const programs = data?.programs ?? [];
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const c of [...(data?.recommendations ?? []), ...(data?.contacts ?? [])]) {
      if (c.category) set.add(c.category);
    }
    return [...set].sort();
  }, [data]);
  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const c of [...(data?.recommendations ?? []), ...(data?.contacts ?? [])]) {
      if (c.area) set.add(c.area);
    }
    return [...set].sort();
  }, [data]);

  return (
    <div className="space-y-5 pb-24">
      <header className="space-y-2">
        <h1 className="page-title">Contacts & Programs</h1>
        <p className="page-subtitle max-w-xl">
          Who to contact, why it fits, which route is honest, and what to ask — then straight into a
          brief and pitch approval on your phone.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Related studio surfaces">
        {RELATED_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="bracket hover:text-accent">
            {link.label} →
          </Link>
        ))}
      </nav>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {KC_HUB_VIEWS.map((key) => {
          const active = view === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`shrink-0 text-sm px-3 py-2 min-h-[44px] border ${
                active
                  ? 'border-accent bg-paper-wash font-semibold'
                  : 'border-paper-edge text-paper-muted'
              }`}
            >
              {KC_HUB_VIEW_LABELS[key]}
            </button>
          );
        })}
      </div>

      <ContactsProgramsFilters
        filters={filters}
        onChange={setFilters}
        categories={categories}
        areas={areas}
      />

      {data?.stub ? (
        <p className="text-xs text-paper-muted border border-dashed border-paper-edge px-3 py-2">
          API stub active — empty until primary wires contact intelligence data. No demo rows.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-red-400 border border-red-400/30 px-3 py-2">{error}</p>
      ) : null}
      {loading ? <p className="text-sm text-paper-muted italic">Loading…</p> : null}

      {!loading && !error && view === 'programs_applications' ? (
        programs.length === 0 ? (
          <p className="text-sm text-paper-muted italic py-8 text-center border border-dashed border-paper-edge">
            {emptyStateCopy(view, Boolean(data?.stub))}
          </p>
        ) : (
          <ul className="space-y-3">
            {programs.map((row) => (
              <li key={row.id}>
                <ProgramCard row={row} />
              </li>
            ))}
          </ul>
        )
      ) : null}

      {!loading && !error && view !== 'programs_applications' ? (
        cards.length === 0 ? (
          <p className="text-sm text-paper-muted italic py-8 text-center border border-dashed border-paper-edge">
            {emptyStateCopy(view, Boolean(data?.stub))}
          </p>
        ) : (
          <ul className="space-y-3">
            {cards.map((card) => (
              <li key={card.id}>
                <RecommendationCard
                  card={card}
                  busy={busyId === card.id}
                  onFeedback={(action) => void sendFeedback(card.id, action)}
                />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
