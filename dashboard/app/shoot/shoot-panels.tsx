'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clientApiUrl } from '../../lib/client-api';

type ShootView = {
  id: string;
  title: string | null;
  status: string;
  startedAt: string;
};

export function ShootStartPanel() {
  const router = useRouter();
  const [active, setActive] = useState<ShootView | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; title: string; category: string | null }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(clientApiUrl('/api/shoot/active'), { cache: 'no-store' });
    if (!res.ok) return;
    const json = (await res.json()) as { active: ShootView | null };
    setActive(json.active);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      void fetch(clientApiUrl(`/api/shoot/opportunities/search?q=${encodeURIComponent(query)}`))
        .then((r) => r.json())
        .then((json: { items: typeof results }) => setResults(json.items ?? []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function start(contentItemId?: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/shoot/sessions/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentItemId: contentItemId ?? null }),
      });
      const json = (await res.json()) as { session: { id: string } };
      if (!res.ok) throw new Error('Could not start shoot');
      router.push(`/shoot/${json.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Start failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {active ? (
        <Link href={`/shoot/${active.id}`} className="glass-panel-strong gradient-border p-4 block">
          <div className="text-sm font-semibold">Resume active shoot</div>
          <p className="text-xs text-paper-muted mt-1">{active.title ?? 'In progress'}</p>
        </Link>
      ) : null}

      <div className="grid gap-3">
        <button type="button" className="btn-primary min-h-[48px]" disabled={busy} onClick={() => void start()}>
          Start general shoot
        </button>
        <button
          type="button"
          className="btn-secondary min-h-[48px]"
          disabled={busy}
          onClick={() => {
            if (!navigator.geolocation) {
              void start();
              return;
            }
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                void fetch(clientApiUrl('/api/shoot/sessions/start'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    locationLat: pos.coords.latitude,
                    locationLng: pos.coords.longitude,
                    locationLabel: 'Current location',
                  }),
                })
                  .then((r) => r.json())
                  .then((json: { session: { id: string } }) => router.push(`/shoot/${json.session.id}`))
                  .catch(() => setError('Could not start with location'));
              },
              () => void start(),
            );
          }}
        >
          Start with location
        </button>
      </div>

      <div className="glass-panel p-4 space-y-3">
        <label className="text-xs uppercase tracking-wider text-paper-muted">Search opportunity</label>
        <input
          className="input w-full"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Restaurant, event, business…"
        />
        <ul className="space-y-2">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full text-left p-3 rounded-lg bg-white/5 hover:bg-white/10 text-sm"
                onClick={() => void start(item.id)}
              >
                <div>{item.title}</div>
                {item.category ? <div className="text-2xs text-paper-dim mt-1">{item.category}</div> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}

const OFFLINE_KEY = 'benson-shoot-offline';

export function ShootSessionPanel({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [view, setView] = useState<Record<string, unknown> | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);

  const storageKey = useMemo(() => `${OFFLINE_KEY}:${sessionId}`, [sessionId]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(clientApiUrl(`/api/shoot/sessions/${sessionId}`), { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setView(json);
      localStorage.setItem(storageKey, JSON.stringify(json));
      setOffline(false);
    } catch {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        setView(JSON.parse(cached) as Record<string, unknown>);
        setOffline(true);
      }
    }
  }, [sessionId, storageKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const sync = () => {
      if (navigator.onLine) void reload();
    };
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [reload]);

  async function advance(action: 'got_it' | 'next' | 'skip') {
    setBusy(true);
    try {
      const res = await fetch(clientApiUrl(`/api/shoot/sessions/${sessionId}/advance`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      setView(json);
      localStorage.setItem(storageKey, JSON.stringify(json));
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!note.trim() || !view) return;
    const notes = [...((view.notes as Array<{ id: string; text: string; at: string }>) ?? [])];
    notes.push({ id: crypto.randomUUID(), text: note.trim(), at: new Date().toISOString() });
    setBusy(true);
    try {
      const res = await fetch(clientApiUrl(`/api/shoot/sessions/${sessionId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const json = await res.json();
      setView(json);
      setNote('');
    } finally {
      setBusy(false);
    }
  }

  async function finish(reason: string) {
    setBusy(true);
    try {
      await fetch(clientApiUrl(`/api/shoot/sessions/${sessionId}/finish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      router.push('/shoot');
    } finally {
      setBusy(false);
    }
  }

  if (!view) return <p className="text-sm text-paper-muted italic">Loading shoot…</p>;

  const currentShot = view.currentShot as { instruction?: string; hook?: string } | null;
  const talkingPoints = (view.talkingPoints as string[]) ?? [];
  const keyFacts = (view.keyFacts as string[]) ?? [];

  return (
    <div className="space-y-4 pb-24">
      {offline ? (
        <p className="text-xs text-amber-300">Offline — showing cached shoot state. Changes sync when back online.</p>
      ) : null}

      <section className="glass-panel-strong gradient-border p-4 space-y-2">
        <div className="text-xs uppercase tracking-wider text-paper-muted">Now filming</div>
        <h1 className="text-lg font-semibold">{String(view.title ?? 'Field shoot')}</h1>
        {view.address ? <p className="text-sm text-paper-muted">{String(view.address)}</p> : null}
        {view.primaryHook ? <p className="text-sm text-accent">{String(view.primaryHook)}</p> : null}
      </section>

      <section className="glass-panel p-4">
        <div className="text-2xs uppercase text-paper-muted mb-2">
          Shot {(view.shotIndex as number) + 1} / {view.shotTotal as number}
        </div>
        <p className="text-base leading-relaxed">{currentShot?.instruction ?? 'Follow your plan.'}</p>
        {currentShot?.hook ? <p className="text-sm text-paper-dim mt-2">Hook: {currentShot.hook}</p> : null}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <button type="button" className="btn-secondary min-h-[44px] text-xs" disabled={busy} onClick={() => void advance('got_it')}>
            Got it
          </button>
          <button type="button" className="btn-primary min-h-[44px] text-xs" disabled={busy} onClick={() => void advance('next')}>
            Next shot
          </button>
          <button type="button" className="btn-ghost min-h-[44px] text-xs" disabled={busy} onClick={() => void advance('skip')}>
            Skip
          </button>
        </div>
      </section>

      {talkingPoints.length > 0 ? (
        <section className="glass-panel p-4">
          <h2 className="text-sm font-semibold mb-2">Talking points</h2>
          <ul className="text-sm space-y-1 list-disc pl-4">{talkingPoints.map((t) => <li key={t}>{t}</li>)}</ul>
        </section>
      ) : null}

      {keyFacts.length > 0 ? (
        <section className="glass-panel p-4">
          <h2 className="text-sm font-semibold mb-2">Key facts</h2>
          <ul className="text-sm space-y-1">{keyFacts.map((t) => <li key={t}>{t}</li>)}</ul>
        </section>
      ) : null}

      <section className="glass-panel p-4 space-y-2">
        <h2 className="text-sm font-semibold">Add note</h2>
        <textarea className="input w-full min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="btn-secondary min-h-[44px]" disabled={busy} onClick={() => void addNote()}>
          Save note
        </button>
      </section>

      <section className="glass-panel p-4 space-y-2">
        <h2 className="text-sm font-semibold">Finish shoot</h2>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['completed', 'Completed'],
            ['partial', 'Partial'],
            ['could_not_film', 'Could not film'],
            ['business_closed', 'Closed'],
            ['too_crowded', 'Too crowded'],
            ['permission_denied', 'No permission'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="btn-ghost min-h-[44px] text-xs"
              disabled={busy}
              onClick={() => void finish(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
