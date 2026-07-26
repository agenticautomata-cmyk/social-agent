'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../../../lib/client-api';

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
};

type ScoutItem = {
  id: string;
  itemUrl: string;
  itemType: string;
  captionText: string | null;
  detectedAt: string;
  creatorValueStatus: string;
  linkedEarlySignalId: string | null;
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
};

type CuratorHealth = {
  postsProcessed: number;
  eventsExtracted: number;
  verifiedYield: number;
  noiseRate: number | null;
  reliabilityScore: number | null;
};

export function WatchlistDetailPanel() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const [item, setItem] = useState<WatchlistCard | null>(null);
  const [scoutItems, setScoutItems] = useState<ScoutItem[]>([]);
  const [curatorLeads, setCuratorLeads] = useState<CuratorLead[]>([]);
  const [curatorHealth, setCuratorHealth] = useState<CuratorHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

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
        }) => {
          if (!json.ok || !json.item) throw new Error('Not found');
          setItem(json.item);
          setScoutItems(json.scoutItems ?? []);
          setCuratorLeads(json.curatorLeads ?? []);
          setCuratorHealth(json.curatorHealth ?? null);
        },
      )
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkNow() {
    setMessage(null);
    const res = await fetch(clientApiUrl(`/api/watchlist/${id}/check-now`), { method: 'POST' });
    const json = (await res.json()) as { ok: boolean; error?: string; newItems?: number };
    setMessage(json.ok ? `Check complete — ${json.newItems ?? 0} new item(s)` : (json.error ?? 'Check failed'));
    await load();
  }

  async function togglePause(paused: boolean) {
    await fetch(clientApiUrl(`/api/watchlist/${id}/pause`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused }),
    });
    await load();
  }

  async function stopWatching() {
    await fetch(clientApiUrl(`/api/watchlist/${id}`), { method: 'DELETE' });
    router.push('/watchlist');
  }

  async function dismissLead(leadId: string) {
    await fetch(clientApiUrl(`/api/watchlist/leads/${leadId}/dismiss`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'dismissed_from_watchlist' }),
    });
    await load();
  }

  if (loading) return <p className="text-sm text-paper-muted italic">Loading…</p>;
  if (!item) return <p className="text-sm text-red-600">Source not found</p>;

  return (
    <div className="space-y-6">
      <Link href="/watchlist" className="btn-ghost text-xs inline-flex">
        ← Watchlist
      </Link>

      <header className="space-y-1">
        <h1 className="text-xl font-bold">{item.sourceName}</h1>
        <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-accent break-all">
          {item.sourceUrl}
        </a>
        <p className="text-xs text-paper-muted">
          {item.platform} · {item.monitoringMode.replace(/_/g, ' ').toLowerCase()}
          {item.sessionStatus === 'login_required' && ' · Login required'}
        </p>
      </header>

      {curatorHealth && (
        <div className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-paper-muted uppercase tracking-wider">Posts processed</p>
            <p className="font-bold text-lg">{curatorHealth.postsProcessed}</p>
          </div>
          <div>
            <p className="text-paper-muted uppercase tracking-wider">Events extracted</p>
            <p className="font-bold text-lg">{curatorHealth.eventsExtracted}</p>
          </div>
          <div>
            <p className="text-paper-muted uppercase tracking-wider">Verified yield</p>
            <p className="font-bold text-lg">{curatorHealth.verifiedYield}</p>
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
        <button type="button" className="btn-primary text-sm" onClick={() => void checkNow()}>
          Check now
        </button>
        <button type="button" className="btn-ghost text-sm" onClick={() => void togglePause(!item.paused)}>
          {item.paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="btn-ghost text-sm text-red-700" onClick={() => void stopWatching()}>
          Stop watching
        </button>
      </div>

      {message && <p className="text-sm text-paper-muted">{message}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wider">Event leads</h2>
        <p className="text-2xs text-paper-muted">
          Independently researched from curator roundups — facts only, with attribution.
        </p>
        {curatorLeads.length === 0 ? (
          <p className="text-sm text-paper-muted italic">No event leads yet. Run Check now after Instagram session is configured.</p>
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
                  Discovered via @{lead.discoveredViaHandle.replace(/^@/, '')}
                </p>
                {lead.creatorRecommendation && (
                  <p className="text-xs text-paper-soft">
                    Recommendation: {lead.creatorRecommendation.replace(/_/g, ' ')}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link href={`/?ask=${encodeURIComponent(`Tell me about ${lead.eventName}`)}`} className="text-xs text-accent">
                    Ask Benson
                  </Link>
                  {lead.ticketUrl && (
                    <a href={lead.ticketUrl} target="_blank" rel="noreferrer" className="text-xs text-accent">
                      Official tickets
                    </a>
                  )}
                  {lead.officialOrganizerUrl && (
                    <a href={lead.officialOrganizerUrl} target="_blank" rel="noreferrer" className="text-xs text-accent">
                      Organizer
                    </a>
                  )}
                  <a href={lead.discoveredViaPostUrl} target="_blank" rel="noreferrer" className="text-xs text-paper-muted">
                    Curator post
                  </a>
                  <button type="button" className="text-xs text-paper-muted" onClick={() => void dismissLead(lead.id)}>
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
    </div>
  );
}
