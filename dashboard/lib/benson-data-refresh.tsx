'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { clientApiUrl } from './client-api';

export type DataRevisionDomain =
  | 'analytics'
  | 'discoveries'
  | 'early_signals'
  | 'scout'
  | 'calendar'
  | 'opportunities'
  | 'sponsors'
  | 'email'
  | 'worker_health'
  | 'recommendations'
  | 'home_briefing';

type DomainRevisionStatus = {
  domain: DataRevisionDomain;
  revision: number;
  updatedAt: string;
  recalculating?: boolean;
  recalculatingMessage?: string;
};

type RevisionStatus = {
  revisions: Record<DataRevisionDomain, DomainRevisionStatus>;
  globalRevision: number;
  serverTime: string;
};

type RefreshListener = (domains: DataRevisionDomain[]) => void;

type BensonDataRefreshContextValue = {
  status: RevisionStatus | null;
  notifyLocalChange: (domains: DataRevisionDomain[]) => void;
  subscribe: (domains: DataRevisionDomain[], listener: RefreshListener) => () => void;
  recalculatingMessage: string | null;
};

const BensonDataRefreshContext = createContext<BensonDataRefreshContextValue | null>(null);

const CHANNEL_NAME = 'benson-data-revision';
const POLL_MS = 12_000;
const FOREGROUND_POLL_MS = 3_000;

async function fetchRevisionStatus(): Promise<RevisionStatus | null> {
  try {
    const res = await fetch(clientApiUrl('/api/data-revision/status'), { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as RevisionStatus & { ok?: boolean };
    return {
      revisions: json.revisions,
      globalRevision: json.globalRevision,
      serverTime: json.serverTime,
    };
  } catch {
    return null;
  }
}

export function BensonDataRefreshProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<RevisionStatus | null>(null);
  const statusRef = useRef<RevisionStatus | null>(null);
  const listenersRef = useRef<Map<string, Set<RefreshListener>>>(new Map());
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const emitDomainChanges = useCallback((domains: DataRevisionDomain[]) => {
    if (domains.length === 0) return;
    for (const [key, listeners] of listenersRef.current) {
      const watched = key.split(',') as DataRevisionDomain[];
      if (domains.some((d) => watched.includes(d))) {
        for (const listener of listeners) listener(domains);
      }
    }
  }, []);

  const applyStatus = useCallback(
    (next: RevisionStatus, source: 'poll' | 'local' | 'broadcast') => {
      const prev = statusRef.current;
      statusRef.current = next;
      setStatus(next);

      if (!prev) return;
      const changed: DataRevisionDomain[] = [];
      for (const domain of Object.keys(next.revisions) as DataRevisionDomain[]) {
        if ((prev.revisions[domain]?.revision ?? 0) !== (next.revisions[domain]?.revision ?? 0)) {
          changed.push(domain);
        }
      }
      if (changed.length > 0) {
        emitDomainChanges(changed);
        if (source === 'poll' && typeof BroadcastChannel !== 'undefined') {
          channelRef.current?.postMessage({ type: 'revision', globalRevision: next.globalRevision });
        }
      }
    },
    [emitDomainChanges],
  );

  const poll = useCallback(async () => {
    const next = await fetchRevisionStatus();
    if (next) applyStatus(next, 'poll');
  }, [applyStatus]);

  const notifyLocalChange = useCallback(
    (domains: DataRevisionDomain[]) => {
      void poll();
      emitDomainChanges(domains);
      if (typeof BroadcastChannel !== 'undefined') {
        channelRef.current?.postMessage({ type: 'local', domains });
      }
    },
    [emitDomainChanges, poll],
  );

  const subscribe = useCallback((domains: DataRevisionDomain[], listener: RefreshListener) => {
    const key = [...domains].sort().join(',');
    const set = listenersRef.current.get(key) ?? new Set();
    set.add(listener);
    listenersRef.current.set(key, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) listenersRef.current.delete(key);
    };
  }, []);

  useEffect(() => {
    void poll();
    pollTimerRef.current = setInterval(() => void poll(), POLL_MS);

    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = channel;
      channel.onmessage = (event: MessageEvent<{ type: string; domains?: DataRevisionDomain[] }>) => {
        if (event.data?.type === 'local' && event.data.domains?.length) {
          emitDomainChanges(event.data.domains);
          void poll();
        } else if (event.data?.type === 'revision') {
          void poll();
        }
      };
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void poll();
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        pollTimerRef.current = setInterval(() => void poll(), FOREGROUND_POLL_MS);
        setTimeout(() => {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = setInterval(() => void poll(), POLL_MS);
        }, 30_000);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      channelRef.current?.close();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [emitDomainChanges, poll]);

  const recalculatingMessage = useMemo(() => {
    if (!status) return null;
    for (const domain of ['recommendations', 'home_briefing'] as DataRevisionDomain[]) {
      const row = status.revisions[domain];
      if (row?.recalculating && row.recalculatingMessage) return row.recalculatingMessage;
    }
    return null;
  }, [status]);

  const value = useMemo(
    () => ({ status, notifyLocalChange, subscribe, recalculatingMessage }),
    [status, notifyLocalChange, subscribe, recalculatingMessage],
  );

  return (
    <BensonDataRefreshContext.Provider value={value}>{children}</BensonDataRefreshContext.Provider>
  );
}

export function useBensonDataRefresh() {
  const ctx = useContext(BensonDataRefreshContext);
  if (!ctx) {
    throw new Error('useBensonDataRefresh must be used within BensonDataRefreshProvider');
  }
  return ctx;
}

/** Subscribe and refetch when watched domains change revision. */
export function useBensonRevisionRefresh(
  domains: DataRevisionDomain[],
  onRefresh: () => void,
): { recalculatingMessage: string | null; lastRevisionAt: string | null } {
  const { subscribe, recalculatingMessage, status } = useBensonDataRefresh();
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    return subscribe(domains, () => {
      onRefreshRef.current();
    });
  }, [domains.join(','), subscribe]);

  const lastRevisionAt = domains
    .map((d) => status?.revisions[d]?.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  return { recalculatingMessage, lastRevisionAt };
}

/** Notify other tabs/panels that calendar or related domains changed. */
export function notifyLocalChange(domains: DataRevisionDomain[]): void {
  if (typeof BroadcastChannel !== 'undefined') {
    new BroadcastChannel(CHANNEL_NAME).postMessage({ type: 'local', domains });
  }
}

export async function skipDiscoveryItem(options: {
  contentItemId: string;
  sourceScreen: string;
  snoozePreset?: 'later_today' | 'tomorrow' | 'this_weekend' | 'next_week';
  snoozeUntil?: string;
}): Promise<{ ok: boolean }> {
  const res = await fetch(clientApiUrl(`/api/data-revision/skip/${options.contentItemId}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceScreen: options.sourceScreen,
      snoozePreset: options.snoozePreset,
      snoozeUntil: options.snoozeUntil,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean }>;
}
