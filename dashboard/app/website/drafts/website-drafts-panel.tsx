'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { WebsiteNav } from '../../../components/website-nav';
import { WebsiteDraftPreview } from '../../../components/website-draft-preview';
import { WebsiteBensonRevise } from '../../../components/website-benson-revise';
import { clientApiUrl } from '../../../lib/client-api';
import type { DraftEditFields, WebsiteDraftRecord, WebsiteSectionRecord } from '../../../lib/website-types';
import {
  WEBSITE_CATEGORY_OPTIONS,
  WEBSITE_CONTENT_TYPE_OPTIONS,
  WEBSITE_PLACEMENT_OPTIONS,
  draftEditFromRecord,
  draftHasRequiredFields,
  draftStatusClass,
  draftStatusLabel,
} from '../../../lib/website-types';
import {
  friendlyWebsiteError,
  websiteFieldClass,
  websiteLabelClass,
  websitePanelClass,
  websiteTitleClass,
} from '../../../lib/website-ui';

export function WebsiteDraftsPanel() {
  const [drafts, setDrafts] = useState<WebsiteDraftRecord[]>([]);
  const [sections, setSections] = useState<WebsiteSectionRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [edit, setEdit] = useState<DraftEditFields | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [draftsRes, sectionsRes] = await Promise.all([
        fetch(clientApiUrl('/api/website/drafts'), { cache: 'no-store' }),
        fetch(clientApiUrl('/api/website/sections'), { cache: 'no-store' }),
      ]);
      if (!draftsRes.ok || !sectionsRes.ok) throw new Error('Failed to load drafts');
      const draftsData = (await draftsRes.json()) as { drafts: WebsiteDraftRecord[] };
      const sectionsData = (await sectionsRes.json()) as { sections: WebsiteSectionRecord[] };
      setDrafts(draftsData.drafts);
      setSections(sectionsData.sections);
      setSelectedId((prev) => prev ?? draftsData.drafts[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  useEffect(() => {
    if (selected) {
      setEdit(draftEditFromRecord(selected));
    }
  }, [selected]);

  const canPublish = useMemo(() => edit && draftHasRequiredFields(edit), [edit]);

  async function runAction(action: 'approve' | 'reject' | 'publish' | 'save') {
    if (!selected || !edit) return;
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      if (action === 'save') {
        const res = await fetch(clientApiUrl(`/api/website/drafts/${selected.id}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: edit.title,
            sectionId: edit.sectionId,
            caption: edit.caption,
            altText: edit.altText,
            headline: edit.headline || null,
            ctaLabel: edit.ctaLabel || null,
            ctaHref: edit.ctaHref || null,
            category: edit.category,
            contentType: edit.contentType,
            suggestedPlacement: edit.suggestedPlacement,
          }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? 'Save failed');
        setMessage('Draft saved.');
      } else {
        const path =
          action === 'approve'
            ? 'approve'
            : action === 'reject'
              ? 'reject'
              : 'publish';
        const res = await fetch(clientApiUrl(`/api/website/drafts/${selected.id}/${path}`), {
          method: 'POST',
          headers: action === 'reject' ? { 'Content-Type': 'application/json' } : undefined,
          body: action === 'reject' ? JSON.stringify({ reason: 'Not for the website right now' }) : undefined,
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? `${action} failed`);
        setMessage(
          action === 'publish'
            ? 'Published to kckellie.com!'
            : action === 'approve'
              ? 'Approved — ready to publish.'
              : 'Draft rejected.',
        );
      }
      await load();
    } catch (err) {
      setError(friendlyWebsiteError(err instanceof Error ? err.message : 'Action failed'));
    } finally {
      setBusy(null);
    }
  }

  function applyRevisedDraft(draft: WebsiteDraftRecord, reply: string) {
    setDrafts((prev) => prev.map((d) => (d.id === draft.id ? draft : d)));
    setEdit(draftEditFromRecord(draft));
    setMessage(reply);
  }

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm font-medium text-rose-600">Website Manager</p>
        <h1 className={websiteTitleClass}>Draft review</h1>
        <p className="mt-1 text-paper-muted">
          Approve, edit, or reject Benson&apos;s website updates. Nothing publishes without your approval.
        </p>
      </header>

      <WebsiteNav />

      {error ? (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}
      {message ? (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading drafts…</p>
      ) : drafts.length === 0 ? (
        <p className="text-sm text-neutral-500">No drafts awaiting review. Upload media first.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <ul className="space-y-2">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(draft.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    selectedId === draft.id
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 bg-white hover:bg-neutral-50'
                  }`}
                >
                  <span className="block truncate font-medium">{draft.title}</span>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      selectedId === draft.id ? 'bg-white/20 text-white' : draftStatusClass(draft.status)
                    }`}
                  >
                    {draftStatusLabel(draft.status)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected && edit ? (
            <div className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-2">
                <WebsiteDraftPreview draft={selected} />
                <div className={`${websitePanelClass} space-y-4`}>
                  <h2 className="font-semibold text-paper-ink">Benson recommendation</h2>
                  {selected.bensonReasoning ? (
                    <p className="text-sm text-paper-muted">{selected.bensonReasoning}</p>
                  ) : null}
                  <div className="grid gap-3 text-sm">
                    <label className="block">
                      <span className={websiteLabelClass}>Title</span>
                      <input
                        className={websiteFieldClass}
                        value={edit.title}
                        onChange={(e) => setEdit((s) => (s ? { ...s, title: e.target.value } : s))}
                      />
                    </label>
                    <label className="block">
                      <span className={websiteLabelClass}>Section</span>
                      <select
                        className={websiteFieldClass}
                        value={edit.sectionId}
                        onChange={(e) => setEdit((s) => (s ? { ...s, sectionId: e.target.value } : s))}
                      >
                        {sections.map((section) => (
                          <option key={section.id} value={section.id}>
                            {section.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="block">
                        <span className={websiteLabelClass}>Category</span>
                        <select
                          className={websiteFieldClass}
                          value={edit.category}
                          onChange={(e) => setEdit((s) => (s ? { ...s, category: e.target.value } : s))}
                        >
                          {WEBSITE_CATEGORY_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className={websiteLabelClass}>Content type</span>
                        <select
                          className={websiteFieldClass}
                          value={edit.contentType}
                          onChange={(e) => setEdit((s) => (s ? { ...s, contentType: e.target.value } : s))}
                        >
                          {WEBSITE_CONTENT_TYPE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className={websiteLabelClass}>Placement</span>
                        <select
                          className={websiteFieldClass}
                          value={edit.suggestedPlacement}
                          onChange={(e) =>
                            setEdit((s) => (s ? { ...s, suggestedPlacement: e.target.value } : s))
                          }
                        >
                          {WEBSITE_PLACEMENT_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block">
                      <span className={websiteLabelClass}>Headline</span>
                      <input
                        className={websiteFieldClass}
                        value={edit.headline}
                        onChange={(e) => setEdit((s) => (s ? { ...s, headline: e.target.value } : s))}
                      />
                    </label>
                    <label className="block">
                      <span className={websiteLabelClass}>Caption</span>
                      <textarea
                        className={websiteFieldClass}
                        rows={3}
                        value={edit.caption}
                        onChange={(e) => setEdit((s) => (s ? { ...s, caption: e.target.value } : s))}
                      />
                    </label>
                    <label className="block">
                      <span className={websiteLabelClass}>Alt text</span>
                      <input
                        className={websiteFieldClass}
                        value={edit.altText}
                        onChange={(e) => setEdit((s) => (s ? { ...s, altText: e.target.value } : s))}
                      />
                    </label>
                  </div>
                  {!canPublish ? (
                    <p className="text-xs text-amber-200/90">
                      Title, caption, and alt text are required before publishing.
                    </p>
                  ) : null}
                </div>
              </div>

              {selected.status !== 'published' ? (
                <WebsiteBensonRevise
                  draftId={selected.id}
                  draft={selected}
                  disabled={!!busy}
                  onRevised={applyRevisedDraft}
                />
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!!busy || selected.status !== 'draft' || !canPublish}
                  onClick={() => void runAction('approve')}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy === 'approve' ? 'Approving…' : 'Approve'}
                </button>
                <button
                  type="button"
                  disabled={!!busy || selected.status === 'rejected'}
                  onClick={() => void runAction('reject')}
                  className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  {busy === 'reject' ? 'Rejecting…' : 'Reject'}
                </button>
                <button
                  type="button"
                  disabled={
                    !!busy ||
                    (selected.status !== 'approved' && selected.status !== 'published') ||
                    !canPublish
                  }
                  onClick={() => void runAction('publish')}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {busy === 'publish' ? 'Publishing…' : 'Publish to site'}
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void runAction('save')}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
                >
                  {busy === 'save' ? 'Saving…' : 'Save edits'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
