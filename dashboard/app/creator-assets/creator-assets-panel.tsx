'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { clientApiLongRunningUrl, clientApiUrl } from '../../lib/client-api';
import {
  DEFAULT_ASSIGN_CLIENT_POLICY,
  assignStatusLabel,
  assignmentsSettledForTargets,
  conflictingActionReason,
  hardTimeoutMessage,
  shouldApplyAssignResult,
  softTimeoutMessage,
  type AssignPhase,
} from '../../lib/creator-assets-assign';

type Assignment = {
  mediaKitId: string;
  placement: string;
  kitName?: string | null;
  variant?: string | null;
  webSlug?: string | null;
  versionNumber?: number | null;
  versionId?: string | null;
  webUrl?: string | null;
  pdfUrl?: string | null;
  generationStatus?: 'ready' | 'pending_build' | 'generation_failed' | 'assigned';
};

type Asset = {
  id: string;
  role: string;
  publicUseState: string;
  displayStatus?: string;
  originalFilename: string | null;
  caption: string | null;
  thumbUrl: string | null;
  webUrl: string | null;
  createdAt: string;
  assignments?: Assignment[];
};

type RebuildStatus = {
  variant: string;
  versionNumber?: number;
  versionId?: string;
  webUrl?: string;
  pdfUrl?: string;
  status: 'ready' | 'generation_failed' | 'unchanged';
  error?: string;
};

const ROLE_OPTIONS = [
  { value: 'headshot', label: 'Headshot' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'hero', label: 'Brand/logo' },
  { value: 'proof_still', label: 'Work/sample' },
  { value: 'other', label: 'Other' },
] as const;

const ASSIGN_KIT_OPTIONS = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'destination', label: 'Destination' },
] as const;

function variantTargetsFromAssignments(assignments: Assignment[] | undefined): string[] {
  const out = new Set<string>();
  for (const row of assignments ?? []) {
    const v = row.variant;
    if (v === 'hotel' || v === 'restaurant' || v === 'destination') out.add(v);
  }
  return [...out];
}

function generationLabel(row: Assignment): string {
  if (row.generationStatus === 'pending_build') {
    return row.versionNumber != null
      ? ` · previous v${row.versionNumber} · generating new kit…`
      : ' · generating kit…';
  }
  if (row.generationStatus === 'generation_failed') {
    return row.versionNumber != null
      ? ` · previous v${row.versionNumber} · generation failed — retry`
      : ' · generation failed — retry';
  }
  if (row.versionNumber != null) return ` · v${row.versionNumber}`;
  return '';
}

export function CreatorAssetsPanel() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadRole, setUploadRole] = useState<string>('headshot');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [assignPhase, setAssignPhase] = useState<AssignPhase>('idle');
  const [assignDraftId, setAssignDraftId] = useState<string | null>(null);
  const [draftTargets, setDraftTargets] = useState<string[]>([]);
  const [rebuildByAsset, setRebuildByAsset] = useState<Record<string, RebuildStatus[]>>({});
  const [previewId, setPreviewId] = useState<string | null>(null);
  const assignSeqRef = useRef(0);
  const assignPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAssignPoll = useCallback(() => {
    if (assignPollRef.current) {
      clearInterval(assignPollRef.current);
      assignPollRef.current = null;
    }
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }): Promise<Asset[]> => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/creator-assets'));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      const next = (data.assets ?? []) as Asset[];
      setAssets(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      return [];
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => clearAssignPoll();
  }, [load, clearAssignPoll]);

  function openAssignDraft(asset: Asset) {
    setError(null);
    setNotice(null);
    setAssignDraftId(asset.id);
    setDraftTargets(variantTargetsFromAssignments(asset.assignments));
  }

  function closeAssignDraft() {
    setAssignDraftId(null);
    setDraftTargets([]);
  }

  function toggleDraftTarget(value: string) {
    setDraftTargets((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function releaseAssignBusy(seq: number) {
    if (!shouldApplyAssignResult(seq, assignSeqRef.current)) return;
    clearAssignPoll();
    setBusyId(null);
    setBusyAction(null);
    setAssignPhase('idle');
  }

  async function onUpload(file: File) {
    setError(null);
    setNotice(null);
    const form = new FormData();
    form.append('image', file);
    form.append('role', uploadRole);
    form.append('requestPublicUse', 'true');
    form.append('source', 'creator_assets_ui');
    const res = await fetch(clientApiUrl('/api/creator-assets'), { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Upload failed');
      return;
    }
    setNotice(`Uploaded as ${uploadRole}. Waiting for approval — not on any kit yet.`);
    await load();
  }

  /** Keep assign busy owned while another photo's approve/role runs mid-generation. */
  function captureAssignHold(forAssetId: string): { id: string } | null {
    if (
      busyId &&
      busyId !== forAssetId &&
      busyAction === 'assign' &&
      assignPhase !== 'idle'
    ) {
      return { id: busyId };
    }
    return null;
  }

  function releaseSideBusy(heldAssign: { id: string } | null) {
    if (heldAssign) {
      setBusyId(heldAssign.id);
      setBusyAction('assign');
      return;
    }
    setBusyId(null);
    setBusyAction(null);
  }

  async function act(id: string, path: string) {
    if (busyId === id && busyAction === 'assign') return;
    if (busyId && busyId !== id && busyAction === 'assign' && assignPhase !== 'idle') {
      // Other assets remain usable during another photo's kit generation.
    } else if (busyId && busyId !== id && busyAction !== 'assign') {
      return;
    } else if (busyId === id && busyAction && busyAction !== 'assign') {
      return;
    }
    const heldAssign = captureAssignHold(id);
    setBusyId(id);
    setBusyAction(path);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(clientApiUrl(`/api/creator-assets/${id}/${path}`), {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      if (path === 'approve-public-use') {
        setNotice('Approved for public use. Not assigned to any kit yet — choose kits and Save.');
        const asset = (data.asset as Asset | undefined) ?? assets.find((a) => a.id === id);
        if (asset) openAssignDraft({ ...asset, id, assignments: asset.assignments ?? [] });
        else {
          setAssignDraftId(id);
          setDraftTargets([]);
        }
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      releaseSideBusy(heldAssign);
    }
  }

  async function updateRole(id: string, nextRole: string) {
    if (busyId === id && busyAction === 'assign') {
      setNotice(conflictingActionReason(assignPhase) ?? 'Wait — assignment still in progress.');
      return;
    }
    if (busyId === id && busyAction && busyAction !== 'assign') return;
    const heldAssign = captureAssignHold(id);
    setBusyId(id);
    setBusyAction('role');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(clientApiUrl(`/api/creator-assets/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Role update failed');
      setNotice(`Photo role saved as ${nextRole}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role update failed');
    } finally {
      releaseSideBusy(heldAssign);
    }
  }

  function startAssignPoll(id: string, targets: string[], seq: number) {
    clearAssignPoll();
    assignPollRef.current = setInterval(() => {
      void (async () => {
        if (!shouldApplyAssignResult(seq, assignSeqRef.current)) {
          clearAssignPoll();
          return;
        }
        const list = await load({ silent: true });
        const asset = list.find((a) => a.id === id);
        if (!asset) return;
        if (assignmentsSettledForTargets(asset.assignments ?? [], targets)) {
          setAssignPhase('ready');
          setNotice('Assignment saved. Kit versions ready.');
          closeAssignDraft();
          releaseAssignBusy(seq);
        }
      })();
    }, DEFAULT_ASSIGN_CLIENT_POLICY.pollIntervalMs);
  }

  async function saveAssignments(id: string) {
    if (busyId === id && busyAction === 'assign') return;
    const seq = ++assignSeqRef.current;
    setBusyId(id);
    setBusyAction('assign');
    setAssignPhase('saving');
    setError(null);
    setNotice(assignStatusLabel('saving'));
    const targets = draftTargets.length > 0 ? draftTargets : ['unassigned'];
    let holdBusyForPoll = false;

    let softFired = false;
    const softTimer = setTimeout(() => {
      if (!shouldApplyAssignResult(seq, assignSeqRef.current)) return;
      softFired = true;
      setAssignPhase('generating');
      setNotice(softTimeoutMessage());
      holdBusyForPoll = true;
      startAssignPoll(id, targets, seq);
    }, DEFAULT_ASSIGN_CLIENT_POLICY.softTimeoutMs);

    const hardTimer = setTimeout(() => {
      if (!shouldApplyAssignResult(seq, assignSeqRef.current)) return;
      setNotice(hardTimeoutMessage());
      void (async () => {
        const list = await load({ silent: true });
        const asset = list.find((a) => a.id === id);
        if (asset && assignmentsSettledForTargets(asset.assignments ?? [], targets)) {
          setAssignPhase('ready');
          setNotice('Assignment saved. Kit versions ready.');
          closeAssignDraft();
        } else if (asset) {
          setAssignPhase('idle');
          setNotice(
            'Timed out waiting for the response. Refreshed from saved server state — this does not mean the server failed. Retry only if a kit still shows generating/failed.',
          );
          const failed = (asset.assignments ?? []).some(
            (r) => r.generationStatus === 'generation_failed',
          );
          if (!failed) closeAssignDraft();
        }
        releaseAssignBusy(seq);
      })();
    }, DEFAULT_ASSIGN_CLIENT_POLICY.hardTimeoutMs);

    try {
      // Long-running: bypass dashboard proxy timeouts on dual-kit rebuilds.
      const res = await fetch(clientApiLongRunningUrl(`/api/creator-assets/${id}/assign-target`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets }),
      });
      const data = await res.json();
      if (!shouldApplyAssignResult(seq, assignSeqRef.current)) return;

      const rebuilt = (data.result?.rebuilt ?? []) as RebuildStatus[];
      setRebuildByAsset((prev) => ({ ...prev, [id]: rebuilt }));

      if (data.asset) {
        const nextAsset = data.asset as Asset;
        setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...nextAsset } : a)));
      }

      if (!res.ok) throw new Error(data.error || 'Assignment failed');

      if (data.error) {
        setAssignPhase('failed');
        setError(String(data.error));
        setNotice(
          data.result?.assignmentPersisted
            ? 'Assignment rows were saved. Failed kits need retry — nothing was marked as a client timeout failure.'
            : null,
        );
        clearAssignPoll();
        holdBusyForPoll = false;
        await load({ silent: true });
        return;
      }

      if (targets.includes('unassigned') || draftTargets.length === 0) {
        setAssignPhase('ready');
        setNotice('Saved: approved but unassigned. Zero kit assignments.');
      } else {
        const ready = rebuilt.filter((r) => r.status === 'ready');
        setAssignPhase('ready');
        setNotice(
          ready.length
            ? `Assignment saved. ${ready.length} kit version${ready.length === 1 ? '' : 's'} ready.`
            : 'Assignment saved.',
        );
      }
      clearAssignPoll();
      holdBusyForPoll = false;
      closeAssignDraft();
      await load({ silent: true });
    } catch (err) {
      if (!shouldApplyAssignResult(seq, assignSeqRef.current)) return;
      // Network / lost-response: reconcile before claiming server failure.
      const list = await load({ silent: true });
      const asset = list.find((a) => a.id === id);
      if (asset && assignmentsSettledForTargets(asset.assignments ?? [], targets)) {
        setAssignPhase('ready');
        setError(null);
        setNotice('Assignment saved. Kit versions ready (recovered after a lost response).');
        clearAssignPoll();
        holdBusyForPoll = false;
        closeAssignDraft();
      } else if (asset && (asset.assignments?.length ?? 0) > 0) {
        setAssignPhase('generating');
        setError(null);
        setNotice(
          softFired
            ? 'Connection dropped while kits were generating. Assignment may already be saved — status refreshed from server.'
            : 'Could not read the save response. Refreshed from server — retry only if kits still look wrong.',
        );
        holdBusyForPoll = true;
        startAssignPoll(id, targets, seq);
      } else {
        clearAssignPoll();
        holdBusyForPoll = false;
        setAssignPhase('failed');
        setError(err instanceof Error ? err.message : 'Assignment failed');
      }
    } finally {
      clearTimeout(softTimer);
      clearTimeout(hardTimer);
      if (shouldApplyAssignResult(seq, assignSeqRef.current) && !holdBusyForPoll) {
        releaseAssignBusy(seq);
      }
    }
  }

  const preview = assets.find((a) => a.id === previewId) ?? null;

  return (
    <div className="space-y-6 max-w-xl mx-auto px-4 pb-24">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Creator Assets</h1>
        <p className="text-sm text-paper-muted leading-relaxed">
          Photos stay private until you approve public use, then you choose which kits they belong
          in and Save. Nothing is added to a media kit until you apply an assignment.
        </p>
        <Link href="/media-kits" className="text-xs underline text-paper-muted">
          Open Media Kit Library →
        </Link>
      </header>

      <section className="space-y-3 border-t border-paper-border pt-4">
        <label className="block text-sm font-medium">Role for next upload</label>
        <p className="text-xs text-paper-muted">
          Applies only to the next photo you upload here — not to photos already in the list.
        </p>
        <select
          className="w-full rounded-md border border-paper-border bg-transparent px-3 py-2 text-sm"
          value={uploadRole}
          onChange={(e) => setUploadRole(e.target.value)}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <label className="flex items-center justify-center rounded-md border border-dashed border-paper-border px-4 py-8 text-sm cursor-pointer hover:bg-paper-muted/10">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUpload(file);
              e.target.value = '';
            }}
          />
          Tap to upload a photo
        </label>
      </section>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-paper-muted">{notice}</p> : null}
      {loading ? <p className="text-sm text-paper-muted">Loading…</p> : null}

      <ul className="space-y-4">
        {assets.map((asset) => {
          const saving =
            busyId === asset.id &&
            busyAction === 'assign' &&
            (assignPhase === 'saving' || assignPhase === 'generating');
          const roleBusy = busyId === asset.id && busyAction === 'role';
          const approveBusy = busyId === asset.id && busyAction === 'approve-public-use';
          const draftOpen = assignDraftId === asset.id;
          const rebuilds = rebuildByAsset[asset.id] ?? [];
          const phaseHint =
            busyId === asset.id && busyAction === 'assign'
              ? conflictingActionReason(assignPhase)
              : null;

          return (
            <li key={asset.id} className="flex gap-3 items-start border-b border-paper-border pb-4">
              <button
                type="button"
                className="shrink-0"
                onClick={() => setPreviewId(asset.id)}
                aria-label="Preview photo"
              >
                {asset.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={clientApiUrl(asset.thumbUrl)}
                    alt={asset.caption || asset.originalFilename || 'Creator asset'}
                    className="h-20 w-20 object-cover rounded-sm bg-paper-muted/20"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-sm bg-paper-muted/20" />
                )}
              </button>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-medium truncate">
                  {asset.originalFilename || 'Photo'}
                </p>
                <p className="text-xs text-paper-muted">
                  {asset.displayStatus ?? asset.publicUseState}
                </p>
                <label className="block text-xs text-paper-muted">
                  Role for this photo
                  <select
                    className="mt-1 w-full rounded-md border border-paper-border bg-transparent px-2 py-1"
                    value={asset.role}
                    disabled={roleBusy || saving}
                    title={phaseHint ?? undefined}
                    onChange={(e) => void updateRole(asset.id, e.target.value)}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                {phaseHint ? <p className="text-2xs text-paper-muted">{phaseHint}</p> : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => setPreviewId(asset.id)}
                  >
                    Preview
                  </button>
                  {asset.publicUseState === 'pending_public_use' ||
                  asset.publicUseState === 'draft' ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === asset.id}
                        className="text-xs underline"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void act(asset.id, 'approve-public-use');
                        }}
                      >
                        {approveBusy ? 'Approving…' : 'Approve public use'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === asset.id}
                        className="text-xs underline text-paper-muted"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void act(asset.id, 'reject-public-use');
                        }}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  {asset.publicUseState === 'approved_public_use' ? (
                    <button
                      type="button"
                      className="text-xs underline"
                      disabled={saving}
                      title={phaseHint ?? undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (draftOpen) closeAssignDraft();
                        else openAssignDraft(asset);
                      }}
                    >
                      {draftOpen
                        ? 'Cancel assignment edit'
                        : saving
                          ? assignStatusLabel(assignPhase) || 'Working…'
                          : 'Assign to kits'}
                    </button>
                  ) : null}
                </div>

                {draftOpen ? (
                  <div className="pt-2 space-y-2 rounded-md border border-paper-border p-3">
                    <p className="text-xs font-medium">Where should this photo be used?</p>
                    <p className="text-2xs text-paper-muted">
                      Select kits, then Save. Nothing changes until you Save. Leave all unchecked
                      and Save to keep approved but unassigned.
                    </p>
                    <div className="flex flex-col gap-2">
                      {ASSIGN_KIT_OPTIONS.map((t) => (
                        <label key={t.value} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={draftTargets.includes(t.value)}
                            disabled={saving}
                            onChange={() => toggleDraftTarget(t.value)}
                          />
                          {t.label}
                        </label>
                      ))}
                    </div>
                    <p className="text-2xs text-paper-muted">
                      Selected:{' '}
                      {draftTargets.length
                        ? draftTargets
                            .map(
                              (v) =>
                                ASSIGN_KIT_OPTIONS.find((o) => o.value === v)?.label ?? v,
                            )
                            .join(', ')
                        : 'none (approved / unassigned)'}
                    </p>
                    <div className="flex flex-wrap gap-3 pt-1">
                      <button
                        type="button"
                        disabled={saving}
                        className="text-xs underline font-medium"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void saveAssignments(asset.id);
                        }}
                      >
                        {assignPhase === 'saving'
                          ? 'Saving assignment…'
                          : assignPhase === 'generating' && busyId === asset.id
                            ? 'Generating kit…'
                            : 'Save assignment'}
                      </button>
                      <button
                        type="button"
                        disabled={saving && assignPhase === 'saving'}
                        title={
                          assignPhase === 'generating'
                            ? 'Cancel closes the editor; generation continues on the server.'
                            : undefined
                        }
                        className="text-xs underline text-paper-muted"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          closeAssignDraft();
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {asset.assignments && asset.assignments.length > 0 ? (
                  <ul className="text-2xs text-paper-muted pt-1 space-y-1">
                    {asset.assignments.map((row) => (
                      <li key={`${row.mediaKitId}-${row.placement}`}>
                        {row.kitName || row.variant || 'Kit'}
                        {generationLabel(row)}
                        {row.generationStatus === 'ready' ? ' · ready' : ''}
                        {row.webUrl ? (
                          <>
                            {' '}
                            <a className="underline" href={row.webUrl} target="_blank" rel="noreferrer">
                              {row.generationStatus === 'pending_build'
                                ? 'Previous web kit'
                                : 'View web kit'}
                            </a>
                          </>
                        ) : null}
                        {row.pdfUrl ? (
                          <>
                            {' '}
                            <a className="underline" href={row.pdfUrl} target="_blank" rel="noreferrer">
                              {row.generationStatus === 'pending_build' ? 'Previous PDF' : 'PDF'}
                            </a>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : asset.publicUseState === 'approved_public_use' ? (
                  <p className="text-2xs text-paper-muted pt-1">
                    Approved but unassigned — not on any kit yet.
                  </p>
                ) : null}

                {rebuilds.length > 0 ? (
                  <ul className="text-2xs pt-1 space-y-1">
                    {rebuilds.map((r) => (
                      <li
                        key={`${r.variant}-${r.versionNumber ?? r.status}`}
                        className={
                          r.status === 'generation_failed' ? 'text-red-700' : 'text-paper-muted'
                        }
                      >
                        {r.variant}:{' '}
                        {r.status === 'ready'
                          ? `kit ready${r.versionNumber != null ? ` (v${r.versionNumber})` : ''}`
                          : r.status === 'generation_failed'
                            ? `generation failed${r.error ? ` — ${r.error}` : ''} (assignment saved; retry rebuild)`
                            : r.status}
                        {r.webUrl ? (
                          <>
                            {' '}
                            <a className="underline" href={r.webUrl} target="_blank" rel="noreferrer">
                              open
                            </a>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {preview ? (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-paper max-w-lg w-full rounded-md p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold">Preview</h2>
              <button type="button" className="text-xs underline" onClick={() => setPreviewId(null)}>
                Close
              </button>
            </div>
            {preview.webUrl || preview.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clientApiUrl(preview.webUrl || preview.thumbUrl!)}
                alt={preview.originalFilename || 'Preview'}
                className="w-full max-h-[70vh] object-contain"
              />
            ) : null}
            <p className="text-xs text-paper-muted">
              {preview.displayStatus ?? preview.publicUseState} · {preview.role}
            </p>
          </div>
        </div>
      ) : null}

      {!loading && assets.length === 0 ? (
        <p className="text-sm text-paper-muted">
          No photos yet. Upload from here or Ask Benson — then approve before any kit uses them.
        </p>
      ) : null}
    </div>
  );
}
