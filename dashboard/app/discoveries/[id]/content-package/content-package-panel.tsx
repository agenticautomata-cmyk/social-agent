'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { clientApiUrl } from '../../../../lib/client-api';
import { useActionToast } from '../../../../components/action-toast';
import { useDiscoveryRecord } from '../../../../lib/use-discovery-record';

export function ContentPackagePanel({ contentItemId }: { contentItemId: string }) {
  const { record, error, loading, reload, setRecord } = useDiscoveryRecord(
    contentItemId,
    'generate_content_plan',
  );
  const { showToast } = useActionToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedHook, setSelectedHook] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState<string | null>(null);

  const pkg = record?.assistancePackage?.contentPackage;
  const hookOptions = useMemo(() => {
    if (!pkg) return [];
    if (pkg.hookOptions?.length) return pkg.hookOptions;
    return [pkg.openingHook, ...(pkg.talkingPoints ?? []).slice(0, 2)].filter(Boolean) as string[];
  }, [pkg]);
  const activeHook = selectedHook ?? pkg?.openingHook ?? hookOptions[0] ?? null;
  const caption = captionDraft ?? pkg?.caption ?? '';

  async function regenerate() {
    setBusy('regenerate');
    try {
      const res = await fetch(clientApiUrl(`/api/creator-interest/records/${contentItemId}/regenerate-package`), {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Regenerate failed');
      setSelectedHook(null);
      setCaptionDraft(null);
      await reload();
      showToast({ title: 'Content package regenerated', nextStep: 'Fresh hooks, shot list, and caption from current facts.' });
    } catch (err) {
      showToast({ title: "Couldn't regenerate", nextStep: err instanceof Error ? err.message : null, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    setBusy('save');
    try {
      const res = await fetch(clientApiUrl(`/api/creator-interest/records/${contentItemId}/assistance-package`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentPackage: { openingHook: activeHook, caption },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Save failed');
      if (record) setRecord({ ...record, assistancePackage: json.assistancePackage });
      showToast({ title: 'Draft saved', nextStep: 'Your edits are kept with this discovery.' });
    } catch (err) {
      showToast({ title: "Couldn't save", nextStep: err instanceof Error ? err.message : null, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  if (loading && !record) return <p className="text-sm text-paper-muted italic">Loading content package…</p>;
  if (!record) return <p className="text-sm text-red-600">{error ?? 'Discovery not found'}</p>;

  return (
    <div className="space-y-6">
      <Link href={`/discoveries/${contentItemId}`} className="btn-ghost text-xs inline-flex">
        ← {record.normalizedEntityName}
      </Link>

      <header className="space-y-1">
        <p className="text-2xs uppercase tracking-wider text-paper-muted">Content package</p>
        <h1 className="text-xl font-bold">{record.normalizedEntityName}</h1>
        {record.locationName && <p className="text-sm text-paper-muted">{record.locationName}</p>}
      </header>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {!pkg ? (
        <div className="glass-panel p-4 space-y-2">
          <p className="text-sm text-paper-muted italic">
            {record.researchJob?.status === 'researching' || record.researchJob?.status === 'queued'
              ? 'Benson is building your content package from verified facts…'
              : 'No content package yet.'}
          </p>
          {record.researchJob?.status === 'failed' && (
            <p className="text-xs text-red-400">{record.researchJob.errorMessage}</p>
          )}
        </div>
      ) : (
        <>
          <section className="glass-panel p-4 space-y-3">
            <p className="text-2xs uppercase tracking-wider text-paper-muted">Format</p>
            <p className="text-sm font-bold">{pkg.recommendedFormat}</p>
          </section>

          <section className="glass-panel p-4 space-y-3">
            <p className="text-2xs uppercase tracking-wider text-paper-muted">Hook options</p>
            <div className="space-y-2">
              {hookOptions.map((hook) => (
                <button
                  key={hook}
                  type="button"
                  onClick={() => setSelectedHook(hook)}
                  className={`w-full text-left text-sm p-3 rounded-lg border ${
                    activeHook === hook ? 'border-accent bg-accent/5' : 'border-paper-edge'
                  }`}
                >
                  {hook}
                </button>
              ))}
            </div>
          </section>

          {pkg.shotList?.length ? (
            <section className="glass-panel p-4 space-y-2">
              <p className="text-2xs uppercase tracking-wider text-paper-muted">Shot list</p>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {pkg.shotList.map((shot) => (
                  <li key={shot}>{shot}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {pkg.talkingPoints?.length ? (
            <section className="glass-panel p-4 space-y-2">
              <p className="text-2xs uppercase tracking-wider text-paper-muted">Talking points / B-roll checklist</p>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {pkg.talkingPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="glass-panel p-4 space-y-2">
            <p className="text-2xs uppercase tracking-wider text-paper-muted">Caption</p>
            <textarea
              className="w-full text-sm p-3 rounded-lg border border-paper-edge bg-paper min-h-[100px]"
              value={caption}
              onChange={(e) => setCaptionDraft(e.target.value)}
            />
            {pkg.callToAction && <p className="text-xs text-paper-muted">CTA: {pkg.callToAction}</p>}
          </section>

          {pkg.hashtags?.length ? (
            <section className="glass-panel p-4 space-y-2">
              <p className="text-2xs uppercase tracking-wider text-paper-muted">Hashtags</p>
              <p className="text-sm">{pkg.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}</p>
            </section>
          ) : null}

          {pkg.searchPhrases?.length ? (
            <section className="glass-panel p-4 space-y-2">
              <p className="text-2xs uppercase tracking-wider text-paper-muted">SEO / search phrases</p>
              <p className="text-sm text-paper-soft">{pkg.searchPhrases.join(' · ')}</p>
            </section>
          ) : null}

          {(pkg.unknowns?.length || pkg.verificationQuestions?.length) ? (
            <section className="glass-panel p-4 space-y-2 border-l-2 border-accent/40">
              <p className="text-2xs uppercase tracking-wider text-accent">Confirm before filming</p>
              {pkg.unknowns?.length ? (
                <div>
                  <p className="text-xs font-bold text-paper-muted">Still unknown</p>
                  <ul className="list-disc pl-5 text-xs space-y-0.5">
                    {pkg.unknowns.map((u) => (
                      <li key={u}>{u}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {pkg.verificationQuestions?.length ? (
                <div>
                  <p className="text-xs font-bold text-paper-muted">Ask on-site</p>
                  <ul className="list-disc pl-5 text-xs space-y-0.5">
                    {pkg.verificationQuestions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {pkg.disclosure && (
            <p className="text-2xs text-paper-dim italic">{pkg.disclosure}</p>
          )}
          {pkg.sourceAttribution && (
            <p className="text-2xs text-paper-muted">Source: {pkg.sourceAttribution}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} onClick={() => void saveDraft()} className="btn-primary text-xs min-h-[40px] px-4">
              {busy === 'save' ? 'Saving…' : 'Save draft'}
            </button>
            <button type="button" disabled={!!busy} onClick={() => void regenerate()} className="btn-ghost text-xs min-h-[40px] px-3">
              {busy === 'regenerate' ? 'Regenerating…' : 'Regenerate'}
            </button>
            <Link href={`/discoveries/${contentItemId}/visit-plan`} className="btn-ghost text-xs min-h-[40px] px-3 inline-flex items-center">
              Plan visit →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
