'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../../../lib/client-api';
import { useActionToast } from '../../../components/action-toast';

type WatchlistCard = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  platform: string;
  monitoringMode: string;
  paused: boolean;
  healthStatus: string;
  sessionStatus: string | null;
  lastSuccessfulCheck: string | null;
  fetchMethod: string | null;
  canonicalKey: string | null;
  displayHealth?: string;
  statusExplanation?: string | null;
  reachability?: string | null;
  lastResolvedUrl?: string | null;
  supportsReprocessLatestPost?: boolean;
  supportsRerunLatestCheck?: boolean;
  metricsLabel?: 'posts' | 'pages';
  itemsProcessed?: number;
  recordsExtracted?: number;
  newRecordsFound?: number;
  verifiedYield?: number;
  lastSuccessfulExtractionAt?: string | null;
  lastCompletedCheckAt?: string | null;
  listingPlatform?: string | null;
  extractionMethod?: string | null;
  productionGroupCount?: number | null;
  performanceCount?: number | null;
  listingDisplayMode?: string | null;
  effectiveExtractionUrl?: string | null;
  contentOutcome?: string | null;
};

type ScoutItem = {
  id: string;
  itemUrl: string;
  itemType: string;
  captionText: string | null;
  detectedAt: string;
  creatorValueStatus: string;
  verificationStatus?: string;
  linkedEarlySignalId: string | null;
  relevanceExplanation?: Record<string, unknown> | null;
};

type CuratorLead = {
  id: string;
  eventName: string;
  eventDate: string | null;
  eventTime: string | null;
  venue: string | null;
  neighborhood: string | null;
  verificationStatus: string;
  discoveredViaHandle: string;
  discoveredViaPostUrl: string;
  creatorRecommendation: string | null;
  officialOrganizerUrl: string | null;
  ticketUrl: string | null;
  linkedEarlySignalId?: string | null;
};

type CuratorHealth = {
  postsProcessed: number;
  eventsExtracted: number;
  verifiedYield: number;
  noiseRate: number | null;
  reliabilityScore: number | null;
  lastAttemptedCheck: string | null;
  lastFailureAt: string | null;
  lastFailureMessage: string | null;
  nextCheckEstimate: string | null;
  nextCheckLabel?: string;
  schedulerLive?: boolean;
  paused: boolean;
  authenticationRequired: boolean;
  checkFrequencyHours: number;
  displayHealth?: string;
  statusExplanation?: string | null;
  reachability?: string | null;
  lastResolvedUrl?: string | null;
  configuredUrl?: string | null;
  itemsProcessed?: number;
  recordsExtracted?: number;
  newRecordsFound?: number;
  lastSuccessfulExtractionAt?: string | null;
  lastCompletedCheckAt?: string | null;
  listingPlatform?: string | null;
  extractionMethod?: string | null;
  productionGroupCount?: number | null;
  performanceCount?: number | null;
  listingDisplayMode?: string | null;
  metricsLabel?: 'posts' | 'pages';
  supportsReprocessLatestPost?: boolean;
  supportsRerunLatestCheck?: boolean;
  effectiveExtractionUrl?: string | null;
  contentOutcome?: string | null;
};

type WatchlistFinding = {
  id: string;
  type: string;
  title: string;
  subtitle?: string | null;
  summary: string;
  sourceUrl: string | null;
  route: string;
  baselineKind: string;
  createdAt: string;
  verificationStatus: string;
};

type RunHistoryItem = {
  id: string;
  triggerType: string;
  startedAt: string | null;
  completedAt: string | null;
  finalFetchMethod: string | null;
  itemCount: number;
  newCount: number;
  hiddenCount: number;
  qualifiedCount: number;
  failureCategory: string | null;
  sanitizedFailure: string | null;
  inspectionSummary: string | null;
};

export function WatchlistDetailPanel() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const [item, setItem] = useState<WatchlistCard | null>(null);
  const [scoutItems, setScoutItems] = useState<ScoutItem[]>([]);
  const [expandedProductionKeys, setExpandedProductionKeys] = useState<Record<string, boolean>>({});
  const [curatorLeads, setCuratorLeads] = useState<CuratorLead[]>([]);
  const [curatorHealth, setCuratorHealth] = useState<CuratorHealth | null>(null);
  const [runHistory, setRunHistory] = useState<RunHistoryItem[]>([]);
  const [findings, setFindings] = useState<WatchlistFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { showToast } = useActionToast();

  const load = useCallback(() => {
    return fetch(clientApiUrl(`/api/watchlist/${id}`), { cache: 'no-store' })
      .then((res) => res.json())
      .then(
        (json: {
          ok: boolean;
          item?: WatchlistCard;
          scoutItems?: ScoutItem[];
          curatorLeads?: CuratorLead[];
          curatorHealth?: CuratorHealth | null;
          runHistory?: RunHistoryItem[];
          findings?: WatchlistFinding[];
        }) => {
          if (!json.ok || !json.item) throw new Error('Not found');
          setItem(json.item);
          setScoutItems(json.scoutItems ?? []);
          setCuratorLeads(json.curatorLeads ?? []);
          setCuratorHealth(json.curatorHealth ?? null);
          setRunHistory(json.runHistory ?? []);
          setFindings(json.findings ?? []);
        },
      )
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkNow() {
    setMessage(null);
    setChecking(true);
    const res = await fetch(clientApiUrl(`/api/watchlist/${id}/check-now`), { method: 'POST' });
    const json = (await res.json()) as {
      ok: boolean;
      error?: string;
      newItems?: number;
      inspectionSummary?: string;
    };
    setMessage(
      json.ok
        ? `Check complete — ${json.inspectionSummary ?? `${json.newItems ?? 0} new item(s)`}`
        : (json.error ?? 'Check failed'),
    );
    if (json.ok) {
      const found = json.newItems ?? 0;
      const summary = json.inspectionSummary ?? '';
      const isBaseline = /baseline created/i.test(summary);
      showToast({
        title: isBaseline
          ? summary
          : found > 0
            ? `Found ${found} new item${found === 1 ? '' : 's'}`
            : summary || 'Checked — nothing new',
        nextStep: isBaseline
          ? 'Listings are available to review below. Benson will report changes on later checks.'
          : found > 0
            ? 'New finds are listed below and anything promising becomes a discovery you can vote on.'
            : 'Benson keeps checking this source on its normal schedule.',
        tone: found > 0 || isBaseline ? 'success' : 'info',
      });
    } else {
      showToast({ title: 'Check failed', nextStep: json.error ?? null, tone: 'error' });
    }
    await load();
    setChecking(false);
  }

  async function reprocessLatest() {
    setMessage(null);
    const res = await fetch(clientApiUrl(`/api/watchlist/${id}/reprocess-latest`), { method: 'POST' });
    const json = (await res.json()) as { ok: boolean; error?: string; eventsExtracted?: number };
    if (json.ok) {
      showToast({
        title: `Reprocessed latest post — ${json.eventsExtracted ?? 0} event(s) extracted`,
        nextStep: 'Any new leads are listed below.',
        tone: 'success',
      });
    } else {
      showToast({ title: 'Reprocess failed', nextStep: json.error ?? null, tone: 'error' });
    }
    await load();
  }

  async function togglePause(paused: boolean) {
    await fetch(clientApiUrl(`/api/watchlist/${id}/pause`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused }),
    });
    showToast({
      title: paused ? 'Watching paused' : 'Watching resumed',
      nextStep: paused
        ? 'Benson stops checking this source until you resume it. Nothing already found is deleted.'
        : 'Benson checks this source again on its normal schedule.',
    });
    await load();
  }

  async function stopWatching() {
    await fetch(clientApiUrl(`/api/watchlist/${id}`), { method: 'DELETE' });
    showToast({
      title: 'Stopped watching',
      nextStep: 'Removed from your watchlist. Benson will not check this source again.',
    });
    router.push('/watchlist');
  }

  async function dismissLead(leadId: string) {
    await fetch(clientApiUrl(`/api/watchlist/leads/${leadId}/dismiss`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'dismissed_from_watchlist' }),
    });
    showToast({
      title: 'Lead dismissed',
      nextStep: 'Off this list, and Benson will stop surfacing leads like it from this source.',
    });
    await load();
  }

  if (loading) return <p className="text-sm text-paper-muted italic">Loading…</p>;
  if (!item) return <p className="text-sm text-red-600">Source not found</p>;

  const isDirectory =
    (curatorHealth?.metricsLabel ?? item.metricsLabel) === 'pages' ||
    item.platform === 'web' ||
    /eventbrite|event_listing|wix_events|event_directory/i.test(
      `${item.fetchMethod ?? ''}:${curatorHealth?.configuredUrl ?? item.sourceUrl}`,
    );
  const isInstagram = item.platform === 'instagram';
  const showSession = isInstagram || Boolean(curatorHealth?.authenticationRequired);
  const metricsArePages =
    (curatorHealth?.metricsLabel ?? item.metricsLabel) === 'pages' || isDirectory;

  type ProductionGroupView = {
    key: string;
    title: string;
    venue: string | null;
    runStartDate: string | null;
    runEndDate: string | null;
    ticketUrl: string | null;
    items: ScoutItem[];
  };

  const productionGroups: ProductionGroupView[] = (() => {
    const map = new Map<string, ProductionGroupView>();
    for (const si of scoutItems) {
      const rel = (si.relevanceExplanation ?? {}) as Record<string, unknown>;
      const groupKey = typeof rel.productionGroupKey === 'string' ? rel.productionGroupKey : null;
      if (!groupKey) continue;
      const title =
        (typeof rel.productionTitle === 'string' && rel.productionTitle) ||
        si.captionText ||
        'Production';
      let group = map.get(groupKey);
      if (!group) {
        group = {
          key: groupKey,
          title,
          venue: typeof rel.venue === 'string' ? rel.venue : null,
          runStartDate: typeof rel.runStartDate === 'string' ? rel.runStartDate : null,
          runEndDate: typeof rel.runEndDate === 'string' ? rel.runEndDate : null,
          ticketUrl:
            (typeof rel.ticketOrRsvpUrl === 'string' && rel.ticketOrRsvpUrl) ||
            (typeof rel.eventUrl === 'string' && rel.eventUrl) ||
            si.itemUrl,
          items: [],
        };
        map.set(groupKey, group);
      }
      group.items.push(si);
    }
    for (const g of map.values()) {
      g.items.sort((a, b) => {
        const aRel = (a.relevanceExplanation ?? {}) as Record<string, unknown>;
        const bRel = (b.relevanceExplanation ?? {}) as Record<string, unknown>;
        const aStart = typeof aRel.startDateTime === 'string' ? aRel.startDateTime : '';
        const bStart = typeof bRel.startDateTime === 'string' ? bRel.startDateTime : '';
        return aStart.localeCompare(bStart);
      });
    }
    return [...map.values()].sort((a, b) => {
      const aStart =
        ((a.items[0]?.relevanceExplanation ?? {}) as Record<string, unknown>).startDateTime ?? '';
      const bStart =
        ((b.items[0]?.relevanceExplanation ?? {}) as Record<string, unknown>).startDateTime ?? '';
      return String(aStart).localeCompare(String(bStart));
    });
  })();

  const useProductionGroups =
    productionGroups.length > 0 &&
    (item.listingDisplayMode === 'production_groups' ||
      item.extractionMethod === 'theater_season' ||
      productionGroups.length >= 1);

  const productionGroupCount =
    item.productionGroupCount ??
    curatorHealth?.productionGroupCount ??
    (useProductionGroups ? productionGroups.length : null);
  const performanceCount =
    item.performanceCount ??
    curatorHealth?.performanceCount ??
    (useProductionGroups ? scoutItems.length : null);

  return (
    <div className="space-y-6">
      <Link href="/watchlist" className="btn-ghost text-xs inline-flex">
        ← Watchlist
      </Link>

      <header className="space-y-1">
        <h1 className="text-xl font-bold">{item.sourceName}</h1>
        <p className="text-2xs uppercase tracking-wider text-paper-muted">Configured URL</p>
        <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-accent break-all">
          {item.sourceUrl}
        </a>
        {(curatorHealth?.effectiveExtractionUrl || item.effectiveExtractionUrl) &&
        (curatorHealth?.effectiveExtractionUrl ?? item.effectiveExtractionUrl)!
          .replace(/\/$/, '') !== item.sourceUrl.replace(/\/$/, '') ? (
          <>
            <p className="text-2xs uppercase tracking-wider text-paper-muted pt-1">
              Effective extraction URL
            </p>
            <a
              href={(curatorHealth?.effectiveExtractionUrl ?? item.effectiveExtractionUrl)!}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-accent break-all"
            >
              {curatorHealth?.effectiveExtractionUrl ?? item.effectiveExtractionUrl}
            </a>
          </>
        ) : null}
        {curatorHealth?.lastResolvedUrl &&
        curatorHealth.lastResolvedUrl.replace(/\/$/, '') !== item.sourceUrl.replace(/\/$/, '') ? (
          <>
            <p className="text-2xs uppercase tracking-wider text-paper-muted pt-1">Last fetched URL</p>
            <p className="text-sm text-paper-muted break-all">{curatorHealth.lastResolvedUrl}</p>
          </>
        ) : null}
        <p className="text-xs text-paper-muted">
          {item.platform} · {item.monitoringMode.replace(/_/g, ' ').toLowerCase()}
          {showSession && item.sessionStatus === 'login_required' && ' · Login required'}
          {item.paused && ' · Paused'}
          {curatorHealth?.reachability ? ` · Reachability ${curatorHealth.reachability}` : ''}
          {curatorHealth?.contentOutcome || item.contentOutcome
            ? ` · Outcome ${(curatorHealth?.contentOutcome ?? item.contentOutcome)!.replace(/_/g, ' ')}`
            : ''}
        </p>
        {(curatorHealth?.statusExplanation || item.statusExplanation) && (
          <p className="text-sm text-paper-ink">
            {curatorHealth?.statusExplanation ?? item.statusExplanation}
          </p>
        )}
        {item.canonicalKey && (
          <p className="text-2xs text-paper-muted font-mono break-all">{item.canonicalKey}</p>
        )}
      </header>

      <div className="card p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-paper-muted uppercase tracking-wider">Status</p>
          <p className="font-bold">
            {(curatorHealth?.displayHealth ?? item.displayHealth ?? item.healthStatus).replace(/_/g, ' ')}
          </p>
        </div>
        {showSession ? (
          <div>
            <p className="text-paper-muted uppercase tracking-wider">Session</p>
            <p className="font-bold">
              {curatorHealth?.authenticationRequired
                ? 'Login required'
                : (item.sessionStatus ?? 'OK').replace(/_/g, ' ')}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-paper-muted uppercase tracking-wider">Source type</p>
            <p className="font-bold">Website listing</p>
          </div>
        )}
        <div>
          <p className="text-paper-muted uppercase tracking-wider">Check frequency</p>
          <p className="font-bold">{curatorHealth ? `every ${curatorHealth.checkFrequencyHours}h` : '—'}</p>
        </div>
        <div>
          <p className="text-paper-muted uppercase tracking-wider">
            {curatorHealth?.lastSuccessfulExtractionAt || item.lastSuccessfulExtractionAt
              ? 'Last successful extraction'
              : 'Last completed check'}
          </p>
          <p className="font-bold">
            {curatorHealth?.lastSuccessfulExtractionAt
              ? new Date(curatorHealth.lastSuccessfulExtractionAt).toLocaleString()
              : item.lastSuccessfulExtractionAt
                ? new Date(item.lastSuccessfulExtractionAt).toLocaleString()
                : curatorHealth?.lastCompletedCheckAt
                  ? new Date(curatorHealth.lastCompletedCheckAt).toLocaleString()
                  : item.lastCompletedCheckAt
                    ? new Date(item.lastCompletedCheckAt).toLocaleString()
                    : item.lastSuccessfulCheck
                      ? new Date(item.lastSuccessfulCheck).toLocaleString()
                      : 'No successful extraction yet'}
          </p>
          {!curatorHealth?.lastSuccessfulExtractionAt && !item.lastSuccessfulExtractionAt ? (
            <p className="text-2xs text-paper-muted mt-1">No successful extraction yet</p>
          ) : null}
        </div>
        <div>
          <p className="text-paper-muted uppercase tracking-wider">Platform / method</p>
          <p className="font-bold">
            {(curatorHealth?.listingPlatform ??
              item.listingPlatform ??
              curatorHealth?.extractionMethod ??
              item.extractionMethod ??
              item.fetchMethod ??
              '—')
              .toString()
              .replace(/_/g, ' ')}
          </p>
        </div>
        <div>
          <p className="text-paper-muted uppercase tracking-wider">Last attempted check</p>
          <p className="font-bold">
            {curatorHealth?.lastAttemptedCheck
              ? new Date(curatorHealth.lastAttemptedCheck).toLocaleString()
              : 'Never'}
          </p>
        </div>
        <div>
          <p className="text-paper-muted uppercase tracking-wider">Last failed check</p>
          <p className="font-bold">
            {curatorHealth?.lastFailureAt ? new Date(curatorHealth.lastFailureAt).toLocaleString() : 'None'}
          </p>
        </div>
        <div>
          <p className="text-paper-muted uppercase tracking-wider">
            {curatorHealth?.nextCheckLabel ?? 'Next check when scheduler is enabled'}
          </p>
          <p className="font-bold">
            {item.paused
              ? 'Paused'
              : curatorHealth?.nextCheckEstimate
                ? new Date(curatorHealth.nextCheckEstimate).toLocaleString()
                : '—'}
          </p>
          {curatorHealth && !curatorHealth.schedulerLive ? (
            <p className="text-2xs text-paper-muted mt-1">Scheduler not running yet</p>
          ) : null}
        </div>
      </div>

      {curatorHealth?.lastFailureMessage && (
        <div className="card p-3 text-xs bg-red-50 border border-red-200 text-red-800">
          <p className="font-bold uppercase tracking-wider text-2xs">Last error</p>
          <p>{curatorHealth.lastFailureMessage}</p>
        </div>
      )}

      {curatorHealth && (
        <div className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-paper-muted uppercase tracking-wider">
              {metricsArePages ? 'Items/pages processed' : 'Posts processed'}
            </p>
            <p className="font-bold text-lg">
              {curatorHealth.itemsProcessed ?? curatorHealth.postsProcessed}
            </p>
          </div>
          <div>
            <p className="text-paper-muted uppercase tracking-wider">
              {useProductionGroups ? 'Productions' : 'Events extracted'}
            </p>
            <p className="font-bold text-lg">
              {useProductionGroups
                ? (productionGroupCount ?? curatorHealth.recordsExtracted ?? curatorHealth.eventsExtracted)
                : (curatorHealth.recordsExtracted ?? curatorHealth.eventsExtracted)}
            </p>
          </div>
          <div>
            <p className="text-paper-muted uppercase tracking-wider">
              {useProductionGroups ? 'Performances' : 'New events found'}
            </p>
            <p className="font-bold text-lg">
              {useProductionGroups
                ? (performanceCount ?? curatorHealth.verifiedYield)
                : (curatorHealth.newRecordsFound ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-paper-muted uppercase tracking-wider">
              {useProductionGroups ? 'New performances' : 'Verified yield'}
            </p>
            <p className="font-bold text-lg">
              {useProductionGroups
                ? (curatorHealth.newRecordsFound ?? 0)
                : curatorHealth.verifiedYield}
            </p>
          </div>
          <div>
            <p className="text-paper-muted uppercase tracking-wider">Reliability</p>
            <p className="font-bold text-lg">
              {curatorHealth.reliabilityScore != null
                ? `${(curatorHealth.reliabilityScore * 100).toFixed(0)}%`
                : '—'}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary text-sm" disabled={checking} onClick={() => void checkNow()}>
          {checking
            ? 'Checking…'
            : curatorHealth?.supportsRerunLatestCheck || metricsArePages
              ? 'Re-run latest check'
              : 'Check now'}
        </button>
        <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost text-sm">
          Open source
        </a>
        <button type="button" className="btn-ghost text-sm" onClick={() => void togglePause(!item.paused)}>
          {item.paused ? 'Resume' : 'Pause'}
        </button>
        {(curatorHealth?.supportsReprocessLatestPost ?? item.supportsReprocessLatestPost) && isInstagram ? (
          <button type="button" className="btn-ghost text-sm" onClick={() => void reprocessLatest()}>
            Reprocess latest post
          </button>
        ) : null}
        <button type="button" className="btn-ghost text-sm text-red-700" onClick={() => void stopWatching()}>
          Remove
        </button>
      </div>

      {message && <p className="text-sm text-paper-muted">{message}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wider">What Benson found</h2>
        {findings.length === 0 ? (
          <p className="text-sm text-paper-muted italic">
            {scoutItems.length > 0
              ? 'Extracted listings are shown below. No additional Watchlist finding rows from the latest check.'
              : curatorLeads.length > 0
                ? 'Event leads are listed below. No additional Watchlist updates from the latest check.'
                : metricsArePages
                  ? 'No verified event listings from the latest check yet — run Re-run latest check to refresh.'
                  : 'Nothing new from the latest successful check — or this source has not produced a concrete update yet.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {findings.map((finding) => (
              <li key={finding.id} className="card p-3 text-sm space-y-1">
                <p className="text-2xs uppercase tracking-wider text-paper-muted">
                  {finding.type.replace(/_/g, ' ')}
                  {finding.baselineKind === 'historical_baseline' ? ' · historical baseline' : ''}
                  {` · ${finding.route.replace(/_/g, ' ')}`}
                </p>
                <p className="font-semibold line-clamp-2 break-words">{finding.title}</p>
                {finding.subtitle ? <p className="text-xs text-paper-muted line-clamp-2">{finding.subtitle}</p> : null}
                <p className="text-xs text-paper-muted">{finding.summary}</p>
                {finding.sourceUrl ? (
                  <a href={finding.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-accent">
                    Open source
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wider">
          {isInstagram ? 'Event leads' : 'Events to review'}
        </h2>
        <p className="text-2xs text-paper-muted">
          {isInstagram
            ? 'Independently researched from curator roundups — facts only, with attribution.'
            : 'Extracted from the watched page for review — no auto-pitches or alerts from this check.'}
        </p>
        {isInstagram ? (
          curatorLeads.length === 0 ? (
            <p className="text-sm text-paper-muted italic">
              No event leads yet. Run Check now after Instagram session is configured.
            </p>
          ) : (
            <ul className="space-y-3">
              {curatorLeads.map((lead) => (
                <li key={lead.id} className="card p-4 text-sm space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{lead.eventName}</p>
                      <p className="text-xs text-paper-muted">
                        {lead.eventDate ?? 'Date TBD'}
                        {lead.eventTime ? ` · ${lead.eventTime}` : ''}
                        {lead.venue ? ` · ${lead.venue}` : ''}
                        {lead.neighborhood ? ` · ${lead.neighborhood}` : ''}
                      </p>
                    </div>
                    <span className="text-2xs uppercase tracking-wider px-2 py-0.5 rounded bg-paper-edge">
                      {lead.verificationStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-2xs text-accent">
                    Trusted creator / secondary · @{lead.discoveredViaHandle.replace(/^@/, '')} · unverified until
                    official confirmation
                  </p>
                  {lead.creatorRecommendation && (
                    <p className="text-xs text-paper-soft">
                      Recommendation: {lead.creatorRecommendation.replace(/_/g, ' ')}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link href={`/?ask=${encodeURIComponent(`Tell me about ${lead.eventName}`)}`} className="text-xs text-accent min-h-[44px] inline-flex items-center">
                      Ask Benson
                    </Link>
                    {lead.ticketUrl && (
                      <a href={lead.ticketUrl} target="_blank" rel="noreferrer" className="text-xs text-accent min-h-[44px] inline-flex items-center">
                        Official tickets
                      </a>
                    )}
                    {lead.officialOrganizerUrl && (
                      <a href={lead.officialOrganizerUrl} target="_blank" rel="noreferrer" className="text-xs text-accent min-h-[44px] inline-flex items-center">
                        Organizer
                      </a>
                    )}
                    <a
                      href={
                        /BLACKSPACES_FIXTURE|FIXTURE|placeholder/i.test(lead.discoveredViaPostUrl)
                          ? `https://www.instagram.com/${lead.discoveredViaHandle.replace(/^@/, '')}/`
                          : lead.discoveredViaPostUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-paper-muted min-h-[44px] inline-flex items-center"
                    >
                      Open source
                    </a>
                    {lead.linkedEarlySignalId ? (
                      <Link href={`/signals/${lead.linkedEarlySignalId}`} className="text-xs text-accent min-h-[44px] inline-flex items-center">
                        Review / verify
                      </Link>
                    ) : null}
                    <button type="button" className="text-xs text-paper-muted min-h-[44px]" onClick={() => void dismissLead(lead.id)}>
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : scoutItems.length === 0 ? (
          <p className="text-sm text-paper-muted italic">
            No event listings extracted yet. Run Re-run latest check after the page is reachable.
          </p>
        ) : useProductionGroups ? (
          <ul className="space-y-3 pb-24">
            {productionGroups.map((group) => {
              const expanded = Boolean(expandedProductionKeys[group.key]);
              const runLabel =
                group.runStartDate && group.runEndDate
                  ? `${group.runStartDate} → ${group.runEndDate}`
                  : group.runStartDate ?? null;
              return (
                <li key={group.key} className="card p-4 text-sm space-y-2 break-words">
                  <button
                    type="button"
                    className="w-full text-left space-y-1 min-h-[44px]"
                    onClick={() =>
                      setExpandedProductionKeys((prev) => ({
                        ...prev,
                        [group.key]: !prev[group.key],
                      }))
                    }
                    aria-expanded={expanded}
                  >
                    <p className="font-bold">{group.title}</p>
                    <p className="text-xs text-paper-muted">
                      {group.items.length} performance{group.items.length === 1 ? '' : 's'}
                      {runLabel ? ` · ${runLabel}` : ''}
                      {group.venue ? ` · ${group.venue}` : ''}
                    </p>
                    <p className="text-2xs text-accent">
                      {expanded ? 'Hide dates' : 'Show dates & times'}
                    </p>
                  </button>
                  {group.ticketUrl ? (
                    <a
                      href={group.ticketUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-accent inline-flex min-h-[44px] items-center"
                    >
                      Open tickets
                    </a>
                  ) : null}
                  {expanded ? (
                    <ul className="space-y-2 border-t border-paper-edge pt-2">
                      {group.items.map((si) => {
                        const rel = (si.relevanceExplanation ?? {}) as Record<string, unknown>;
                        const startDateTime =
                          typeof rel.startDateTime === 'string' ? rel.startDateTime : null;
                        const performanceLabel =
                          typeof rel.performanceLabel === 'string' ? rel.performanceLabel : null;
                        const whenLabel = (() => {
                          if (startDateTime && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(startDateTime)) {
                            const [d, t] = startDateTime.split('T');
                            const clock = (t ?? '').slice(0, 5);
                            return `${d}${clock ? ` · ${clock}` : ''}`;
                          }
                          return typeof rel.startDate === 'string' ? rel.startDate : null;
                        })();
                        return (
                          <li key={si.id} className="text-xs space-y-0.5 pl-1">
                            <p className="font-medium text-paper-ink">
                              {performanceLabel ?? whenLabel ?? 'Performance'}
                            </p>
                            {performanceLabel && whenLabel ? (
                              <p className="text-paper-muted">{whenLabel}</p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="space-y-3 pb-24">
            {scoutItems.map((si) => {
              const rel = (si.relevanceExplanation ?? {}) as Record<string, unknown>;
              const startDate = typeof rel.startDate === 'string' ? rel.startDate : null;
              const startDateTime = typeof rel.startDateTime === 'string' ? rel.startDateTime : null;
              const endDateTime = typeof rel.endDateTime === 'string' ? rel.endDateTime : null;
              const venue = typeof rel.venue === 'string' ? rel.venue : null;
              const method = typeof rel.method === 'string' ? rel.method : null;
              const platform = typeof rel.platform === 'string' ? rel.platform : method;
              const evidence = Array.isArray(rel.evidence)
                ? rel.evidence.filter((e): e is string => typeof e === 'string').slice(0, 4)
                : [];
              const whenLabel = (() => {
                if (startDateTime && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(startDateTime)) {
                  const [d, t] = startDateTime.split('T');
                  const clock = (t ?? '').slice(0, 5);
                  const endClock =
                    endDateTime && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(endDateTime)
                      ? endDateTime.split('T')[1]?.slice(0, 5)
                      : null;
                  return `${d}${clock ? ` · ${clock}` : ''}${endClock ? `–${endClock}` : ''}`;
                }
                return startDate ?? null;
              })();
              return (
                <li key={si.id} className="card p-4 text-sm space-y-1 break-words">
                  <p className="font-bold">{si.captionText ?? si.itemUrl}</p>
                  <p className="text-xs text-paper-muted">
                    {whenLabel ? (
                      <>
                        <span className="text-paper-ink">{whenLabel}</span>
                        {venue ? ` · ${venue}` : ''}
                      </>
                    ) : (
                      <span>Date unresolved</span>
                    )}
                  </p>
                  <p className="text-2xs text-paper-muted">
                    {(platform ?? 'listing').replace(/_/g, ' ')}
                    {method && method !== platform ? ` · ${method.replace(/_/g, ' ')}` : ''}
                    {` · ${si.verificationStatus ?? si.creatorValueStatus}`}
                  </p>
                  {evidence.length > 0 ? (
                    <p className="text-2xs text-paper-muted line-clamp-2">
                      Evidence: {evidence.join(' · ')}
                    </p>
                  ) : null}
                  <p className="text-2xs text-paper-muted">
                    Extracted {new Date(si.detectedAt).toLocaleString()}
                  </p>
                  <a href={si.itemUrl} target="_blank" rel="noreferrer" className="text-xs text-accent inline-flex min-h-[44px] items-center">
                    Open event
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wider">Recent run history</h2>
        {runHistory.length === 0 ? (
          <p className="text-sm text-paper-muted italic">No runs recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {runHistory.map((run) => (
              <li key={run.id} className="card p-3 text-xs space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">
                    {run.startedAt ? new Date(run.startedAt).toLocaleString() : 'Unknown time'}
                  </span>
                  <span className="text-2xs uppercase tracking-wider px-2 py-0.5 rounded bg-paper-edge">
                    {run.triggerType.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-paper-muted">
                  {run.inspectionSummary
                    ? run.inspectionSummary
                    : `${run.itemCount} discovered · ${run.newCount} new · ${run.hiddenCount} skipped/rejected · ${run.qualifiedCount} qualified`}
                  {run.finalFetchMethod ? ` · via ${run.finalFetchMethod}` : ''}
                </p>
                {run.sanitizedFailure && (
                  <p className="text-red-700">
                    {run.failureCategory ? `${run.failureCategory}: ` : ''}
                    {run.sanitizedFailure}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isInstagram ? (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider">Detected posts</h2>
          {scoutItems.length === 0 ? (
            <p className="text-sm text-paper-muted italic">No scout items yet.</p>
          ) : (
            <ul className="space-y-2">
              {scoutItems.map((si) => (
                <li key={si.id} className="card p-3 text-sm">
                  <p className="font-medium truncate">{si.captionText ?? si.itemUrl}</p>
                  <p className="text-xs text-paper-muted">
                    {new Date(si.detectedAt).toLocaleString()} · {si.creatorValueStatus}
                  </p>
                  {si.linkedEarlySignalId && (
                    <Link href={`/signals/${si.linkedEarlySignalId}`} className="text-xs text-accent">
                      View Early Signal →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
