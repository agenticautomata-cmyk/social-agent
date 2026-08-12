'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clientApiUrl } from '../../lib/client-api';
import { formatDate, formatDateTime } from '../../lib/datetime';
import { humanizeCategoryLabel } from '../../lib/category-label';

type TopOpportunity = {
  id: string;
  title: string;
  category: string | null;
  location: string | null;
  eventDate: string | null;
  composite: number;
  rationale: string;
  sourceUrl: string | null;
};

type BensonLearning = {
  summary: string;
  insights: Array<{
    id: string;
    insight: string;
    confidence: string;
    action?: string;
  }>;
  isStale?: boolean;
};

type TikTokStatus = {
  status?: string;
  connection?: {
    status?: string;
    lastSuccessfulSyncAt?: string | null;
  };
};

type SourcesSummary = {
  count: number;
  enabledCount: number;
};

// Strict prospect-demo visibility gate — layered on top of the existing
// top-opportunities quality scoring, purely for what /demo is allowed to
// feature. Never weakens or replaces the underlying quarantine/suppression
// gates in the API; this only decides whether an already-scored candidate is
// good enough to show a paying prospect. If nothing qualifies, /demo shows
// fewer (zero) records rather than a weak one.
const CIVIC_MEETING_RE =
  /\b(city council|council district|public (hearing|meeting)|board meeting|town hall|planning commission|zoning|piac|committee meeting|school board)\b/i;
const LIBRARY_RE = /\blibrary\b/i;
const OBITUARY_RE = /\b(obituary|passed away|preceded (him|her|them)? ?in death|celebration of life|funeral|visitation)\b/i;
const HTML_CSS_ARTIFACT_RE = /(<[a-z!/][^>]*>|&#\d+;|&[a-z]+;|!important|display:\s*none|[a-z-]+:\s*[^;{}]+;|\{[^}]*:[^}]*\})/i;
const GENERIC_RATIONALE_RE = /^category:\s*[\w /-]+\.?$/i;
// "opening this Monday" / "TONIGHT" style titles with no structured event date
// can't be verified as still current — showing one live risks presenting a
// stale, already-past claim as if it were fresh.
const UNVERIFIABLE_RELATIVE_DATE_RE =
  /\b(today|tonight|tomorrow|this (monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|week))\b/i;
// A bare "Kansas City, MO" isn't a usable venue/address for planning a visit —
// only accept it when paired with a real venue/street elsewhere in the string.
const GENERIC_CITY_ONLY_LOCATION_RE = /^kansas city,?\s*(mo|missouri)?\.?$/i;

function isDemoSafeOpportunity(o: TopOpportunity): boolean {
  const haystack = `${o.title} ${o.rationale} ${o.category ?? ''}`;
  if (CIVIC_MEETING_RE.test(haystack)) return false;
  if (LIBRARY_RE.test(haystack)) return false;
  if (OBITUARY_RE.test(haystack)) return false;
  if (HTML_CSS_ARTIFACT_RE.test(haystack)) return false;
  if (!o.rationale || o.rationale.trim().length < 20) return false;
  if (GENERIC_RATIONALE_RE.test(o.rationale.trim())) return false;
  if (!o.location || !o.location.trim()) return false;
  if (GENERIC_CITY_ONLY_LOCATION_RE.test(o.location.trim())) return false;
  if (!o.eventDate && UNVERIFIABLE_RELATIVE_DATE_RE.test(o.title)) return false;
  if (o.eventDate) {
    const eventTime = new Date(o.eventDate).getTime();
    if (Number.isFinite(eventTime) && eventTime < Date.now() - 24 * 60 * 60 * 1000) return false;
  }
  return true;
}

/** Prefer a candidate with a concrete, verifiable future date over an undated one when both otherwise qualify. */
function sortDemoOpportunities(candidates: TopOpportunity[]): TopOpportunity[] {
  return [...candidates].sort((a, b) => Number(!a.eventDate) - Number(!b.eventDate));
}

function StepCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-2 border-paper-edge p-5 space-y-3">
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center w-7 h-7 border border-paper-edge text-xs font-bold shrink-0">
          {step}
        </span>
        <h2 className="font-bold lowercase text-lg">{title}</h2>
      </div>
      <div className="pl-10 space-y-2 text-sm">{children}</div>
    </section>
  );
}

export function DemoPanel({ prospectDemoMode }: { prospectDemoMode: boolean }) {
  const [opportunity, setOpportunity] = useState<TopOpportunity | null>(null);
  const [learning, setLearning] = useState<BensonLearning | null>(null);
  const [tiktok, setTiktok] = useState<TikTokStatus | null>(null);
  const [sources, setSources] = useState<SourcesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [oppRes, learningRes, tiktokRes, sourcesRes] = await Promise.all([
          // Overfetch candidates so the strict demo gate below has room to skip
          // weak picks (civic meetings, library programming, generic mass
          // concerts, etc.) rather than being stuck with the single top-scored
          // record if that one doesn't clear the bar for a prospect.
          fetch(clientApiUrl('/api/benson-pulse/top-opportunities?limit=15'), { cache: 'no-store' }),
          fetch(clientApiUrl('/api/benson-learning/latest'), { cache: 'no-store' }),
          fetch(clientApiUrl('/api/analytics/tiktok'), { cache: 'no-store' }),
          fetch(clientApiUrl('/api/sources'), { cache: 'no-store' }),
        ]);
        if (cancelled) return;

        if (oppRes.ok) {
          const data = (await oppRes.json()) as { opportunities?: TopOpportunity[] };
          const safe = sortDemoOpportunities((data.opportunities ?? []).filter(isDemoSafeOpportunity));
          setOpportunity(safe[0] ?? null);
        }
        if (learningRes.ok) {
          const data = (await learningRes.json()) as { learning?: BensonLearning | null };
          setLearning(data.learning ?? null);
        }
        if (tiktokRes.ok) {
          setTiktok((await tiktokRes.json()) as TikTokStatus);
        }
        if (sourcesRes.ok) {
          const data = (await sourcesRes.json()) as { count?: number; enabledCount?: number };
          setSources({ count: data.count ?? 0, enabledCount: data.enabledCount ?? 0 });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load demo data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const tiktokConnected = tiktok?.connection?.status === 'connected' || tiktok?.status === 'connected';
  const tiktokLastSync = tiktok?.connection?.lastSuccessfulSyncAt ?? null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-2xs uppercase tracking-wide text-paper-muted">creator command center</p>
        <h1 className="text-4xl font-bold tracking-tightest lowercase">benson creator studio</h1>
        <p className="text-paper-muted max-w-2xl">
          Benson finds real opportunities in Kansas City, explains why they matter, builds a content
          package, finds the right way to reach the business, and tracks everything so nothing gets
          repeated or lost.
        </p>
        {prospectDemoMode && (
          <p className="text-2xs uppercase tracking-wide text-accent border border-accent/40 inline-block px-2 py-1">
            prospect demo mode
          </p>
        )}
      </header>

      {loading && <p className="text-paper-muted italic">Loading live studio data…</p>}
      {error && <p className="text-red-700 text-sm">{error}</p>}

      {!loading && (
        <div className="space-y-4">
          <StepCard step={1} title="one strong discovery">
            {opportunity ? (
              <div className="space-y-1.5">
                <p className="font-bold text-base">{opportunity.title}</p>
                <p className="text-2xs text-paper-muted">
                  {[
                    humanizeCategoryLabel(opportunity.category),
                    opportunity.location,
                    opportunity.eventDate ? formatDate(opportunity.eventDate) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {opportunity.sourceUrl && (
                  <a
                    href={opportunity.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-2xs text-accent underline break-all"
                  >
                    source
                  </a>
                )}
              </div>
            ) : (
              <p className="text-paper-muted italic">
                No fresh high-quality discovery is queued right now — check{' '}
                <Link href="/opportunities" className="underline">
                  opportunities
                </Link>{' '}
                directly.
              </p>
            )}
          </StepCard>

          <StepCard step={2} title="why benson selected it">
            {opportunity ? (
              <p>{opportunity.rationale}</p>
            ) : (
              <p className="text-paper-muted italic">No rationale available for this cycle.</p>
            )}
          </StepCard>

          <StepCard step={3} title="build the tiktok package">
            <p className="text-paper-muted">
              Assign a filming format, angle, and script starter for this opportunity.
            </p>
            {opportunity && (
              <Link href={`/review/inventory?id=${opportunity.id}`} className="btn-ghost inline-block">
                open in inventory review
              </Link>
            )}
          </StepCard>

          <StepCard step={4} title="plan the visit">
            <p className="text-paper-muted">Slot the shoot into the week so it doesn&apos;t get lost.</p>
            <Link href="/calendar" className="btn-ghost inline-block">
              open calendar
            </Link>
          </StepCard>

          <StepCard step={5} title="contact the business">
            <p className="text-paper-muted">
              Benson only shows a contact path when there&apos;s an actual usable email, official form,
              or verified DM path — never a name alone.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/sponsors" className="btn-ghost inline-block">
                browse business crm
              </Link>
              <Link href="/outreach/compose" className="btn-ghost inline-block">
                compose outreach
              </Link>
            </div>
          </StepCard>

          <StepCard step={6} title="review the outreach draft">
            <p className="text-paper-muted">
              Every draft has one shared Review action — nothing sends without explicit approval.
            </p>
            <Link href="/email/approvals" className="btn-ghost inline-block">
              open pitch review
            </Link>
          </StepCard>

          <StepCard step={7} title="move to pipeline">
            <p className="text-paper-muted">Track the deal from first contact through won or lost.</p>
            <Link href="/pipeline" className="btn-ghost inline-block">
              open pipeline
            </Link>
          </StepCard>

          <StepCard step={8} title="track the follow-up">
            <p className="text-paper-muted">
              Only real, contacted businesses generate a follow-up — simulated drafts never do.
            </p>
            <Link href="/actions" className="btn-ghost inline-block">
              open action center
            </Link>
          </StepCard>

          <StepCard step={9} title="creator learning &amp; analytics">
            <div className="space-y-2">
              <p>{learning?.summary ?? 'No material strategy change this cycle.'}</p>
              {learning?.insights?.[0] && (
                <p className="text-2xs text-paper-muted italic">{learning.insights[0].insight}</p>
              )}
              <p className="text-2xs text-paper-muted">
                TikTok: {tiktokConnected ? 'connected' : 'not connected'}
                {tiktokLastSync ? ` · synced ${formatDateTime(tiktokLastSync)}` : ''}
              </p>
              <Link href="/analytics/tiktok" className="btn-ghost inline-block">
                open analytics
              </Link>
            </div>
          </StepCard>

          <StepCard step={10} title="source health, at a glance">
            <p className="text-paper-muted">
              {sources
                ? `Benson is actively monitoring ${sources.enabledCount} of ${sources.count} configured sources across Kansas City.`
                : 'Source health is temporarily unavailable.'}
            </p>
          </StepCard>
        </div>
      )}
    </div>
  );
}
