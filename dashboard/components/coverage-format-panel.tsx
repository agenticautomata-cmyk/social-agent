'use client';

import { clientApiOrigin } from '../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import {
  COVERAGE_FORMAT_LABELS,
  type CoverageFormat,
} from '../lib/coverage-format-types';

const API = clientApiOrigin();

type BackgroundSource = { label: string; url: string | null };

export type GreenScreenPackage = {
  contentItemId: string;
  status: 'draft' | 'prepared' | 'completed';
  suggestedHeadline: string | null;
  openingHook: string | null;
  spokenScript: string | null;
  keyFacts: string[];
  eventDates: string | null;
  location: string | null;
  priceOrOffer: string | null;
  restrictions: string | null;
  backgroundSources: BackgroundSource[];
  onScreenText: string[];
  caption: string | null;
  hashtags: string[];
  callToAction: string | null;
  sourceAttribution: string | null;
  verificationStatus: string;
  verificationFlags: string[];
  visitLaterNotes: string | null;
  duplicateOfContentItemId: string | null;
  duplicateOfTitle: string | null;
};

type CoverageState = {
  coverageFormat: CoverageFormat | null;
  suggestedCoverageFormat: CoverageFormat | null;
  firsthandVisited: boolean;
};

export function CoverageFormatPanel({
  contentItemId,
  initialCoverage,
  initialPackage,
  onUpdated,
}: {
  contentItemId: string;
  initialCoverage?: CoverageState | null;
  initialPackage?: GreenScreenPackage | null;
  onUpdated?: () => void;
}) {
  const [coverage, setCoverage] = useState<CoverageState>(
    initialCoverage ?? {
      coverageFormat: null,
      suggestedCoverageFormat: null,
      firsthandVisited: false,
    },
  );
  const [pkg, setPkg] = useState<GreenScreenPackage | null>(initialPackage ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<GreenScreenPackage>>({});

  useEffect(() => {
    if (initialCoverage) setCoverage(initialCoverage);
  }, [initialCoverage]);

  useEffect(() => {
    if (initialPackage) {
      setPkg(initialPackage);
      setDraft(initialPackage);
    }
  }, [initialPackage]);

  useEffect(() => {
    if (initialCoverage && initialPackage !== undefined) return;
    let cancelled = false;
    void fetch(`${API}/api/inventory/${contentItemId}/green-screen`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((body: { ok?: boolean; coverage?: CoverageState; package?: GreenScreenPackage | null }) => {
        if (cancelled || !body.ok) return;
        if (body.coverage) setCoverage(body.coverage);
        if (body.package) {
          setPkg(body.package);
          setDraft(body.package);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [contentItemId, initialCoverage, initialPackage]);

  const showGreenScreen =
    coverage.coverageFormat === 'green_screen' ||
    coverage.coverageFormat === 'green_screen_then_visit';

  const saveCoverage = useCallback(
    async (format: CoverageFormat | null) => {
      setBusy('coverage');
      setError(null);
      try {
        const res = await fetch(`${API}/api/inventory/${contentItemId}/coverage-format`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coverageFormat: format }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `${res.status}`);
        setCoverage({
          coverageFormat: body.coverageFormat ?? null,
          suggestedCoverageFormat: body.suggestedCoverageFormat ?? null,
          firsthandVisited: body.firsthandVisited ?? false,
        });
        onUpdated?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setBusy(null);
      }
    },
    [contentItemId, onUpdated],
  );

  async function preparePackage() {
    setBusy('prepare');
    setError(null);
    try {
      const res = await fetch(`${API}/api/inventory/${contentItemId}/green-screen/prepare`, {
        method: 'POST',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `${res.status}`);
      setPkg(body.package);
      setDraft(body.package);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prepare failed');
    } finally {
      setBusy(null);
    }
  }

  async function savePackage() {
    setBusy('save');
    setError(null);
    try {
      const res = await fetch(`${API}/api/inventory/${contentItemId}/green-screen`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `${res.status}`);
      setPkg(body.package);
      setDraft(body.package);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  }

  async function markStatus(status: 'prepared' | 'completed') {
    setBusy(status);
    setError(null);
    try {
      const path =
        status === 'prepared' ? 'mark-prepared' : 'mark-completed';
      const res = await fetch(`${API}/api/inventory/${contentItemId}/green-screen/${path}`, {
        method: 'POST',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `${res.status}`);
      setPkg(body.package);
      setDraft(body.package);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(null);
    }
  }

  function updateDraft<K extends keyof GreenScreenPackage>(key: K, value: GreenScreenPackage[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <section className="border border-paper-edge p-4 space-y-4">
      <div>
        <h3 className="text-2xs uppercase text-paper-muted mb-2">Coverage format</h3>
        {coverage.suggestedCoverageFormat && !coverage.coverageFormat && (
          <p className="text-xs text-paper-muted mb-2 italic">
            Benson suggests:{' '}
            {COVERAGE_FORMAT_LABELS[coverage.suggestedCoverageFormat]}
          </p>
        )}
        <select
          value={coverage.coverageFormat ?? ''}
          onChange={(e) => saveCoverage((e.target.value || null) as CoverageFormat | null)}
          disabled={busy !== null}
          className="w-full border border-paper-edge px-2 py-2 text-sm bg-paper"
        >
          <option value="">Unassigned</option>
          {(Object.entries(COVERAGE_FORMAT_LABELS) as Array<[CoverageFormat, string]>).map(
            ([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ),
          )}
        </select>
      </div>

      {showGreenScreen && (
        <div className="space-y-4 border-t border-paper-edge pt-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={preparePackage}
              disabled={busy !== null}
              className="bracket px-4 py-2 bg-paper-ink text-paper font-bold text-sm disabled:opacity-50"
            >
              {busy === 'prepare' ? 'preparing…' : 'Prepare Green Screen Post'}
            </button>
            {pkg && (
              <>
                <button
                  type="button"
                  onClick={savePackage}
                  disabled={busy !== null}
                  className="bracket px-4 py-2 text-sm disabled:opacity-50"
                >
                  {busy === 'save' ? 'saving…' : 'Save edits'}
                </button>
                <button
                  type="button"
                  onClick={() => markStatus('prepared')}
                  disabled={busy !== null || pkg.status === 'prepared'}
                  className="bracket px-4 py-2 text-sm disabled:opacity-50"
                >
                  Mark prepared
                </button>
                <button
                  type="button"
                  onClick={() => markStatus('completed')}
                  disabled={busy !== null || pkg.status === 'completed'}
                  className="bracket px-4 py-2 text-sm disabled:opacity-50"
                >
                  Mark green screen done
                </button>
              </>
            )}
          </div>

          {pkg && (
            <>
              {pkg.verificationFlags.length > 0 && (
                <ul className="text-xs text-accent space-y-1">
                  {pkg.verificationFlags.map((flag) => (
                    <li key={flag}>// {flag}</li>
                  ))}
                </ul>
              )}
              {pkg.duplicateOfContentItemId && (
                <p className="text-xs text-paper-muted">
                  Possible duplicate of:{' '}
                  <a
                    href={`/review/inventory?id=${pkg.duplicateOfContentItemId}`}
                    className="link"
                  >
                    {pkg.duplicateOfTitle ?? pkg.duplicateOfContentItemId}
                  </a>
                </p>
              )}

              <Field
                label="Suggested video headline"
                value={draft.suggestedHeadline ?? ''}
                onChange={(v) => updateDraft('suggestedHeadline', v)}
              />
              <Field
                label="Opening hook"
                value={draft.openingHook ?? ''}
                onChange={(v) => updateDraft('openingHook', v)}
              />
              <TextArea
                label="Spoken script"
                value={draft.spokenScript ?? ''}
                onChange={(v) => updateDraft('spokenScript', v)}
              />
              <Field
                label="Event / opening dates"
                value={draft.eventDates ?? ''}
                onChange={(v) => updateDraft('eventDates', v)}
              />
              <Field label="Location" value={draft.location ?? ''} onChange={(v) => updateDraft('location', v)} />
              <Field
                label="Price or offer"
                value={draft.priceOrOffer ?? ''}
                onChange={(v) => updateDraft('priceOrOffer', v)}
              />
              <Field
                label="Restrictions / eligibility"
                value={draft.restrictions ?? ''}
                onChange={(v) => updateDraft('restrictions', v)}
              />
              <TextArea
                label="Caption"
                value={draft.caption ?? ''}
                onChange={(v) => updateDraft('caption', v)}
              />
              <Field
                label="Hashtags"
                value={(draft.hashtags ?? []).map((h) => `#${h.replace(/^#/, '')}`).join(' ')}
                onChange={(v) =>
                  updateDraft(
                    'hashtags',
                    v.split(/\s+/).map((h) => h.replace(/^#/, '')).filter(Boolean),
                  )
                }
              />
              <Field
                label="Call to action"
                value={draft.callToAction ?? ''}
                onChange={(v) => updateDraft('callToAction', v)}
              />
              <Field
                label="Source attribution"
                value={draft.sourceAttribution ?? ''}
                onChange={(v) => updateDraft('sourceAttribution', v)}
              />
              {coverage.coverageFormat === 'green_screen_then_visit' && (
                <TextArea
                  label="Notes for later in-person visit"
                  value={draft.visitLaterNotes ?? ''}
                  onChange={(v) => updateDraft('visitLaterNotes', v)}
                />
              )}
              <p className="text-2xs text-paper-muted">
                verification: {pkg.verificationStatus} · package status: {pkg.status}
              </p>
            </>
          )}
        </div>
      )}

      {error && <p className="text-accent text-sm">// {error}</p>}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs">
      <span className="text-2xs uppercase text-paper-muted">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-paper-edge px-2 py-1.5 text-sm bg-paper"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs">
      <span className="text-2xs uppercase text-paper-muted">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="mt-1 w-full border border-paper-edge px-2 py-1.5 text-sm bg-paper"
      />
    </label>
  );
}
