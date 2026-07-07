'use client';

import { useState } from 'react';
import { EquipmentNav } from '../../../components/equipment-nav';
import { clientApiLongRunningUrl } from '../../../lib/client-api';
import {
  HELP_KELLIE_NOW,
  type EquipmentAskResponse,
} from '../../../lib/equipment-types';
import {
  websiteFieldClass,
  websiteLabelClass,
  websitePanelClass,
  websiteTitleClass,
} from '../../../lib/website-ui';

export function EquipmentAskPanel() {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<EquipmentAskResponse | null>(null);

  async function ask(input: {
    question: string;
    equipmentSlug?: string | null;
    shootType?: string | null;
  }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(clientApiLongRunningUrl('/api/equipment/ask'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as EquipmentAskResponse & { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Ask failed');
      setResponse(data);
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ask failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm font-medium text-rose-600">Gear Coach</p>
        <h1 className={websiteTitleClass}>Ask Benson</h1>
        <p className="mt-1 text-paper-muted">
          Equipment Expert mode — answers from your manuals first, with page references when available.
        </p>
      </header>

      <EquipmentNav />

      <div className={`${websitePanelClass} mb-6 border border-accent/20`}>
        <h2 className="font-semibold text-paper-ink">Help Kellie Now</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {HELP_KELLIE_NOW.map((btn) => (
            <button
              key={btn.label}
              type="button"
              disabled={busy}
              onClick={() =>
                void ask({
                  question: btn.prompt,
                  equipmentSlug: btn.equipmentSlug ?? null,
                  shootType: btn.shootType ?? null,
                })
              }
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-paper-ink hover:bg-white/10 disabled:opacity-50 text-left"
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block mb-4">
        <span className={websiteLabelClass}>Your question</span>
        <textarea
          className={websiteFieldClass}
          rows={4}
          placeholder="e.g. How do I connect the Osmo Mobile 8 to DJI Mimo?"
          value={question}
          disabled={busy}
          onChange={(e) => setQuestion(e.target.value)}
        />
      </label>

      <button
        type="button"
        disabled={busy || !question.trim()}
        onClick={() => void ask({ question })}
        className="btn-primary text-sm disabled:opacity-50"
      >
        {busy ? 'Benson is checking the manual…' : 'Ask Benson'}
      </button>

      {error ? (
        <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}

      {response ? (
        <div className={`${websitePanelClass} mt-6 space-y-4`}>
          <div>
            <p className="text-xs font-medium text-accent mb-1">Benson · Gear Coach</p>
            <div className="text-sm text-paper-ink whitespace-pre-wrap">{response.answer}</div>
          </div>
          {response.sources.length > 0 ? (
            <div>
              <p className={websiteLabelClass}>Manual references</p>
              <ul className="mt-2 space-y-1 text-sm text-paper-muted">
                {response.sources.map((s, i) => (
                  <li key={i}>
                    {s.equipmentName} — {s.manualTitle}
                    {s.pageNumber ? `, p.${s.pageNumber}` : ''}
                    {s.sectionTitle ? ` (${s.sectionTitle})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {response.referenceVideos && response.referenceVideos.length > 0 ? (
            <div>
              <p className={websiteLabelClass}>Reference videos (demos — manuals are source of truth)</p>
              <ul className="mt-2 space-y-2 text-sm">
                {response.referenceVideos.map((v, i) => (
                  <li key={i}>
                    <a
                      href={v.referenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-accent hover:underline"
                    >
                      {v.title}
                    </a>
                    <span className="text-paper-muted">
                      {' '}
                      · {v.sourceChannel}
                      {v.equipmentName ? ` · ${v.equipmentName}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {response.usedGeneralKnowledge ? (
            <p className="text-xs text-amber-200/90">Includes general advice — verify against your manual when possible.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
