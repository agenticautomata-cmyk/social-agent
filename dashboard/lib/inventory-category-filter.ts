'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clientApiUrl } from './client-api';

export const INVENTORY_EXCLUDED_CATEGORIES_KEY = 'benson.inventory.excludedCategories';

export function parseExcludedCategories(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function excludedCategoriesQueryParam(excluded: string[]): string {
  if (excluded.length === 0) return '';
  return `excludeCategories=${encodeURIComponent(excluded.join(','))}`;
}

export function appendExcludeCategories(url: string, excluded: string[]): string {
  if (excluded.length === 0) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${excludedCategoriesQueryParam(excluded)}`;
}

function readStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(INVENTORY_EXCLUDED_CATEGORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeStorage(excluded: string[], options?: { fromServer?: boolean }) {
  localStorage.setItem(INVENTORY_EXCLUDED_CATEGORIES_KEY, JSON.stringify(excluded));
  window.dispatchEvent(new CustomEvent('benson:excluded-categories', { detail: excluded }));
  if (!options?.fromServer) {
    schedulePushToServer(excluded);
  }
}

// ----------------------------------------------------------------------------
// Server sync — preferences live in creator_preferences on the API so Benson
// chat can learn them ("I'm not ready for estate sales") and the checkboxes
// cycle automatically. localStorage stays as an instant-load cache.
// ----------------------------------------------------------------------------

let lastServerSyncAt = 0;
let serverSyncInFlight: Promise<void> | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
const SERVER_SYNC_MIN_MS = 20_000;

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}

function schedulePushToServer(excluded: string[]) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void fetch(clientApiUrl('/api/preferences'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excludedCategories: excluded }),
    }).catch(() => {});
  }, 600);
}

function syncFromServer(force = false): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (serverSyncInFlight) return serverSyncInFlight;
  if (!force && Date.now() - lastServerSyncAt < SERVER_SYNC_MIN_MS) return Promise.resolve();

  serverSyncInFlight = fetch(clientApiUrl('/api/preferences'), { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json()) as {
        ok?: boolean;
        preferences?: { excludedCategories?: string[] };
      };
      const serverList = data?.preferences?.excludedCategories;
      if (!Array.isArray(serverList)) return;
      lastServerSyncAt = Date.now();
      // A pending local change wins; otherwise the server is the source of truth.
      if (pushTimer) return;
      if (!sameSet(serverList, readStorage())) {
        writeStorage(serverList, { fromServer: true });
      }
    })
    .catch(() => {})
    .finally(() => {
      serverSyncInFlight = null;
    });
  return serverSyncInFlight;
}

export type InventoryCategoryFilter = {
  excludedCategories: string[];
  setExcludedCategories: (next: string[] | ((prev: string[]) => string[])) => void;
  toggleCategory: (category: string) => void;
  showAll: () => void;
  hideAll: (all: string[]) => void;
  hydrated: boolean;
};

export function useInventoryCategoryFilter(options?: { syncUrl?: boolean }): InventoryCategoryFilter {
  const [excludedCategories, setExcludedCategoriesState] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const skipUrlSyncRef = useRef(true);

  useEffect(() => {
    const fromUrl = parseExcludedCategories(
      new URLSearchParams(window.location.search).get('excludeCategories'),
    );
    const fromStorage = readStorage();
    setExcludedCategoriesState(fromUrl.length > 0 ? fromUrl : fromStorage);
    setHydrated(true);
    // Pull server-side preferences (Benson may have learned new exclusions in chat).
    if (fromUrl.length === 0) void syncFromServer();
  }, []);

  useEffect(() => {
    const onFocus = () => void syncFromServer();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === INVENTORY_EXCLUDED_CATEGORIES_KEY) {
        setExcludedCategoriesState(readStorage());
      }
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<string[]>).detail;
      if (Array.isArray(detail)) setExcludedCategoriesState(detail);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('benson:excluded-categories', onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('benson:excluded-categories', onCustom);
    };
  }, []);

  const setExcludedCategories = useCallback(
    (next: string[] | ((prev: string[]) => string[])) => {
      setExcludedCategoriesState((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        writeStorage(resolved);
        return resolved;
      });
    },
    [],
  );

  const toggleCategory = useCallback(
    (category: string) => {
      setExcludedCategories((prev) =>
        prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
      );
    },
    [setExcludedCategories],
  );

  const showAll = useCallback(() => setExcludedCategories([]), [setExcludedCategories]);

  const hideAll = useCallback(
    (all: string[]) => setExcludedCategories([...all]),
    [setExcludedCategories],
  );

  useEffect(() => {
    if (!options?.syncUrl || !hydrated) return;
    if (skipUrlSyncRef.current) {
      skipUrlSyncRef.current = false;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (excludedCategories.length > 0) {
      params.set('excludeCategories', excludedCategories.join(','));
    } else {
      params.delete('excludeCategories');
    }
    const qs = params.toString();
    const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, '', nextUrl);
    }
  }, [excludedCategories, options?.syncUrl, hydrated]);

  return {
    excludedCategories,
    setExcludedCategories,
    toggleCategory,
    showAll,
    hideAll,
    hydrated,
  };
}
