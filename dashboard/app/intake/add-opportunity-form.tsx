'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const CATEGORY_SUGGESTIONS = [
  '',
  'free_event',
  'business_opening',
  'business_closing',
  'charity_event',
  'celebrity_event',
  'autograph_signing',
  'public_appearance',
  'convention',
  'fan_event',
  'restaurant_special',
  'hotel_package',
  'estate_sale',
  'other',
];

export function AddOpportunityForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  const [categorySuggestion, setCategorySuggestion] = useState('');
  const [imagePlaceholder, setImagePlaceholder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!url.trim() && !text.trim() && !imagePlaceholder) {
      setError('Add a URL, description, or mark image placeholder.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${API}/api/intake/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim() || null,
          text: text.trim() || null,
          notes: notes.trim() || null,
          categorySuggestion: categorySuggestion || null,
          imagePlaceholder,
          submittedBy: 'kellie-dashboard',
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? `${res.status}`);
      }

      router.push('/intake');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="border-2 border-paper-ink p-8 space-y-6 max-w-3xl">
      <p className="text-sm text-paper-muted italic">
        // Benson will draft fields from your share — no AI calls yet (stub extraction).
      </p>

      <label className="block space-y-2">
        <span className="text-2xs uppercase tracking-wider text-paper-muted">url</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.eventbrite.com/e/…"
          className="w-full border border-paper-edge bg-paper px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-2xs uppercase tracking-wider text-paper-muted">text / description</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Paste caption, email excerpt, or message…"
          className="w-full border border-paper-edge bg-paper px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-2xs uppercase tracking-wider text-paper-muted">notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional context for Benson…"
          className="w-full border border-paper-edge bg-paper px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-2xs uppercase tracking-wider text-paper-muted">category suggestion</span>
        <select
          value={categorySuggestion}
          onChange={(e) => setCategorySuggestion(e.target.value)}
          className="w-full border border-paper-edge bg-paper px-3 py-2 text-sm"
        >
          {CATEGORY_SUGGESTIONS.map((cat) => (
            <option key={cat || 'none'} value={cat}>
              {cat || '— none —'}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={imagePlaceholder}
          onChange={(e) => setImagePlaceholder(e.target.checked)}
        />
        <span>Image upload placeholder (screenshot coming in Phase B — no file upload yet)</span>
      </label>

      {error && <p className="text-accent text-sm">// {error}</p>}

      <div className="flex gap-4 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="bracket px-6 py-2 bg-paper-ink text-paper font-bold disabled:opacity-50"
        >
          {busy ? 'sending…' : 'send to benson'}
        </button>
        <a href="/intake" className="bracket px-6 py-2 text-paper-muted hover:text-paper-ink">
          cancel
        </a>
      </div>
    </form>
  );
}
