'use client';

import { useState } from 'react';
import Link from 'next/link';
import { clientApiUrl } from '../../lib/client-api';

type SearchHit = {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  sourceUrl: string | null;
  eventDate: string | null;
  location: string | null;
  reviewUrl: string;
  whyItQualifies: string[];
};

export default function GlobalInventorySearchPage() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(nextQuery = query) {
    setLoading(true);
    setError(null);
    try {
      const url = clientApiUrl(`/api/creator-agent/search?q=${encodeURIComponent(nextQuery)}&limit=20`);
      const res = await fetch(url);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Search failed');
      setHits(json.matches ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Search Benson inventory</h1>
      <p className="text-sm text-neutral-400">
        Active creator-facing records only. Expired and suppressed items are hidden by default.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Business, event, neighborhood, category…"
          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2"
        />
        <button type="submit" className="rounded-lg bg-white px-4 py-2 text-black" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>
      {error ? <p className="text-red-400">{error}</p> : null}
      <ul className="space-y-3">
        {hits.map((hit) => (
          <li key={hit.id} className="rounded-xl border border-neutral-800 p-4 space-y-2">
            <Link href={hit.reviewUrl} className="font-medium underline-offset-2 hover:underline">
              {hit.title}
            </Link>
            {hit.summary ? <p className="text-sm text-neutral-300">{hit.summary}</p> : null}
            <div className="text-xs text-neutral-500">
              {[hit.category, hit.location, hit.eventDate?.slice(0, 10)].filter(Boolean).join(' · ')}
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link href={hit.reviewUrl} className="underline">
                Open details
              </Link>
              {hit.sourceUrl ? (
                <a href={hit.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                  Open source
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
