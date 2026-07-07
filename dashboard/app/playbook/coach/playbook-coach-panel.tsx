'use client';

import { useCallback, useEffect, useState } from 'react';
import { PlaybookNav } from '../../../components/playbook-nav';
import { clientApiUrl, clientApiLongRunningUrl } from '../../../lib/client-api';
import type { PlaybookAskResponse, PlaybookQuickAction } from '../../../lib/playbook-types';
import { SCRIPT_FORMAT_OPTIONS } from '../../../lib/playbook-types';
import {
  websiteFieldClass,
  websiteLabelClass,
  websitePanelClass,
  websiteTitleClass,
} from '../../../lib/website-ui';

export function PlaybookCoachPanel() {
  const [quickActions, setQuickActions] = useState<PlaybookQuickAction[]>([]);
  const [question, setQuestion] = useState('');
  const [scriptFormat, setScriptFormat] = useState<string>('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<PlaybookAskResponse | null>(null);

  useEffect(() => {
    void fetch(clientApiUrl('/api/playbook'), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { quickActions: PlaybookQuickAction[] }) => setQuickActions(d.quickActions ?? []))
      .catch(() => {});
  }, []);

  const ask = useCallback(
    async (input: {
      question: string;
      capability?: string;
      sourceSlug?: string | null;
      imageDataUrl?: string | null;
    }) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(clientApiLongRunningUrl('/api/playbook/ask'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: input.question,
            capability: input.capability,
            sourceSlug: input.sourceSlug,
            scriptFormat: scriptFormat || null,
            imageDataUrl: input.imageDataUrl ?? imageDataUrl,
          }),
        });
        const data = (await res.json()) as PlaybookAskResponse & { ok: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? 'Ask failed');
        setResponse(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ask failed');
      } finally {
        setBusy(false);
      }
    },
    [imageDataUrl, scriptFormat],
  );

  function onScreenshotPick(file: File | null) {
    if (!file) {
      setImageDataUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm font-medium text-rose-600">TikTok Creator Playbook</p>
        <h1 className={websiteTitleClass}>TikTok Coach</h1>
        <p className="mt-1 text-paper-muted">
          Hooks, captions, Search, Studio metrics, sponsor angles, scripts, and pre-post checklists —
          grounded in official TikTok docs plus Kellie&apos;s analytics when live.
        </p>
      </header>

      <PlaybookNav />

      <div className={`${websitePanelClass} mb-6 border border-accent/20`}>
        <h2 className="font-semibold text-paper-ink">Quick coach</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickActions.map((btn) => (
            <button
              key={btn.slug}
              type="button"
              disabled={busy}
              onClick={() => {
                setQuestion(btn.prompt);
                void ask({
                  question: btn.prompt,
                  capability: btn.capability,
                  sourceSlug: btn.sourceSlug,
                });
              }}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-paper-ink hover:bg-white/10 disabled:opacity-50 text-left"
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className={websiteLabelClass}>Script format (optional)</span>
          <select
            className={websiteFieldClass}
            value={scriptFormat}
            onChange={(e) => setScriptFormat(e.target.value)}
          >
            <option value="">General</option>
            {SCRIPT_FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={websiteLabelClass}>Screenshot (for analyze)</span>
          <input
            type="file"
            accept="image/*"
            className="block w-full text-sm text-paper-muted"
            onChange={(e) => onScreenshotPick(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <label className="block mb-4">
        <span className={websiteLabelClass}>Your question or paste hook/caption/idea</span>
        <textarea
          className={websiteFieldClass}
          rows={5}
          placeholder="e.g. Hook: 'OK but this KC spot…' — make it more searchable for TikTok"
          value={question}
          disabled={busy}
          onChange={(e) => setQuestion(e.target.value)}
        />
      </label>

      <button
        type="button"
        disabled={busy || (!question.trim() && !imageDataUrl)}
        onClick={() => void ask({ question: question.trim() || 'Analyze this TikTok screenshot.' })}
        className="btn-primary text-sm disabled:opacity-50"
      >
        {busy ? 'Benson is coaching…' : 'Ask TikTok Coach'}
      </button>

      {error ? (
        <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}

      {response ? (
        <div className={`${websitePanelClass} mt-6 space-y-4`}>
          <div>
            <p className="text-xs font-medium text-accent mb-1">Benson · TikTok Coach</p>
            <div className="text-sm text-paper-ink whitespace-pre-wrap">{response.answer}</div>
          </div>
          {response.sources.length > 0 ? (
            <div>
              <p className={websiteLabelClass}>Playbook sources</p>
              <ul className="mt-2 space-y-1 text-sm text-paper-muted">
                {response.sources.map((s, i) => (
                  <li key={i}>
                    {s.sourceName} — {s.documentTitle}
                    {s.pageNumber ? `, p.${s.pageNumber}` : ''}
                    {s.sectionTitle ? ` (${s.sectionTitle})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {response.usedAnalytics ? (
            <p className="text-xs text-emerald-200/90">Used Kellie&apos;s live TikTok analytics.</p>
          ) : null}
          {response.usedGeneralStrategy ? (
            <p className="text-xs text-amber-200/90">
              Includes general creator strategy — not guaranteed to match official TikTok docs.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
