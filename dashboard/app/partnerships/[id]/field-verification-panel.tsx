'use client';

import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '@/lib/client-api';

type VerificationTask = {
  key: string;
  kind: string;
  title: string;
  description: string;
  locationIndex: number | null;
  priority: string;
  source: string;
  availabilityLabel: string | null;
};

type CallScript = {
  locationName: string;
  locationAddress: string | null;
  objectives: string[];
  suggestedScript: string[];
  followUpQuestions: string[];
  creatorAccessQuestions: string[];
};

type VerificationResult = {
  id: string;
  taskKey: string;
  location: string | null;
  contactedAt: string | null;
  inventoryStatus: string | null;
  filmingStatus: string | null;
  notes: string | null;
  savedAt: string;
};

type InventoryStatusValue = '' | 'confirmed_available' | 'confirmed_unavailable' | 'unknown' | 'ambiguous';
type ProcessStatusValue = '' | 'confirmed_offered' | 'confirmed_not_offered' | 'unknown' | 'ambiguous';
type PermissionStatusValue = '' | 'confirmed_allowed' | 'confirmed_not_allowed' | 'unknown' | 'ambiguous';

const INVENTORY_STATUS_OPTIONS: Array<{ value: InventoryStatusValue; label: string }> = [
  { value: '', label: '—' },
  { value: 'confirmed_available', label: 'Confirmed available (this location)' },
  { value: 'confirmed_unavailable', label: 'Confirmed unavailable (this location)' },
  { value: 'unknown', label: 'Unknown — contact could not answer' },
  { value: 'ambiguous', label: 'Ambiguous — needs follow-up' },
];

const PROCESS_STATUS_OPTIONS: Array<{ value: ProcessStatusValue; label: string }> = [
  { value: '', label: '—' },
  { value: 'confirmed_offered', label: 'Confirmed offered' },
  { value: 'confirmed_not_offered', label: 'Confirmed not offered' },
  { value: 'unknown', label: 'Unknown — contact could not answer' },
  { value: 'ambiguous', label: 'Ambiguous — needs follow-up' },
];

const PERMISSION_STATUS_OPTIONS: Array<{ value: PermissionStatusValue; label: string }> = [
  { value: '', label: '—' },
  { value: 'confirmed_allowed', label: 'Confirmed allowed' },
  { value: 'confirmed_not_allowed', label: 'Confirmed not allowed' },
  { value: 'unknown', label: 'Unknown — contact could not answer' },
  { value: 'ambiguous', label: 'Ambiguous — needs follow-up' },
];

type FormState = {
  taskKey: string;
  locationIndex: number | null;
  location: string;
  contactName: string;
  contactRole: string;
  contactedAt: string;
  inventoryStatus: InventoryStatusValue;
  pickupStatus: ProcessStatusValue;
  shipToStoreStatus: ProcessStatusValue;
  sellerIntakeStatus: ProcessStatusValue;
  filmingStatus: PermissionStatusValue;
  approvalRequirements: string;
  followUpContact: string;
  notes: string;
};

function locationNameFromTask(task?: VerificationTask): string {
  if (!task) return '';
  return task.title.replace(/^Verify [^]+ at /, '');
}

function emptyForm(task?: VerificationTask): FormState {
  return {
    taskKey: task?.key ?? '',
    locationIndex: task?.locationIndex ?? null,
    location: locationNameFromTask(task),
    contactName: '',
    contactRole: '',
    contactedAt: new Date().toISOString().slice(0, 16),
    inventoryStatus: '',
    pickupStatus: '',
    shipToStoreStatus: '',
    sellerIntakeStatus: '',
    filmingStatus: '',
    approvalRequirements: '',
    followUpContact: '',
    notes: '',
  };
}

export function PartnershipFieldVerificationPanel({
  partnershipId,
  brandName,
  retailerName,
  onPartnershipUpdated,
  onRebuildCreatorPlay,
  rebuildBusy,
}: {
  partnershipId: string;
  brandName: string | null;
  retailerName: string | null;
  onPartnershipUpdated: (partnership: unknown) => void;
  onRebuildCreatorPlay: () => void;
  rebuildBusy: boolean;
}) {
  const [tasks, setTasks] = useState<VerificationTask[]>([]);
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTaskKey, setActiveTaskKey] = useState<string | null>(null);
  const [callScript, setCallScript] = useState<CallScript | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [offerRebuild, setOfferRebuild] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(clientApiUrl(`/api/creator-partnerships/${partnershipId}/field-verification`), {
      cache: 'no-store',
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error ?? 'load_failed');
    setTasks(data.tasks ?? []);
    setResults(data.results ?? []);
    if (!activeTaskKey && data.tasks?.[0]) {
      setActiveTaskKey(data.tasks[0].key);
      setForm(emptyForm(data.tasks[0]));
    }
  }, [partnershipId, activeTaskKey]);

  useEffect(() => {
    let cancelled = false;
    void load()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  function selectTask(task: VerificationTask) {
    setActiveTaskKey(task.key);
    setForm(emptyForm(task));
    setCallScript(null);
  }

  async function loadCallScript(task: VerificationTask) {
    if (task.locationIndex == null) return;
    setBusy(`call-${task.key}`);
    setError(null);
    try {
      const res = await fetch(
        clientApiUrl(
          `/api/creator-partnerships/${partnershipId}/field-verification/call-location?locationIndex=${task.locationIndex}`,
        ),
        { cache: 'no-store' },
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'call_script_failed');
      setCallScript(data.script);
      setActiveTaskKey(task.key);
      setForm((prev) => ({
        ...emptyForm(task),
        ...prev,
        taskKey: task.key,
        locationIndex: task.locationIndex,
        location: data.script.locationName,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Call script failed');
    } finally {
      setBusy(null);
    }
  }

  async function saveResults() {
    setBusy('save');
    setError(null);
    try {
      const res = await fetch(clientApiUrl(`/api/creator-partnerships/${partnershipId}/field-verification/results`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskKey: form.taskKey,
          locationIndex: form.locationIndex,
          location: form.location || null,
          contactName: form.contactName || null,
          contactRole: form.contactRole || null,
          contactedAt: form.contactedAt ? new Date(form.contactedAt).toISOString() : null,
          inventoryStatus: form.inventoryStatus || null,
          pickupStatus: form.pickupStatus || null,
          shipToStoreStatus: form.shipToStoreStatus || null,
          sellerIntakeStatus: form.sellerIntakeStatus || null,
          filmingStatus: form.filmingStatus || null,
          approvalRequirements: form.approvalRequirements || null,
          followUpContact: form.followUpContact || null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'save_failed');
      onPartnershipUpdated(data.partnership);
      setOfferRebuild(Boolean(data.offerRebuildCreatorPlay));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  }

  function statusField<T extends string>(
    label: string,
    key: keyof Pick<
      FormState,
      'inventoryStatus' | 'pickupStatus' | 'shipToStoreStatus' | 'sellerIntakeStatus' | 'filmingStatus'
    >,
    options: Array<{ value: T; label: string }>,
  ) {
    return (
      <label className="block text-xs space-y-1">
        {label}
        <select
          className="input w-full text-sm"
          value={form[key]}
          onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value as FormState[typeof key] }))}
        >
          {options.map((opt) => (
            <option key={opt.value || 'empty'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (loading) return <p className="text-sm text-paper-muted">Loading field verification…</p>;
  if (tasks.length === 0) {
    return (
      <section className="glass-panel p-4 space-y-2">
        <h2 className="font-semibold">Field verification</h2>
        <p className="text-sm text-paper-muted">No open verification tasks — research uncertainties are resolved or not yet available.</p>
        {results.length > 0 ? (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold">Saved verification results</p>
            {results.map((result) => (
              <div key={result.id} className="text-xs border border-paper-edge rounded-lg p-2">
                <p className="font-medium">{result.location ?? result.taskKey}</p>
                <p className="text-paper-muted">{new Date(result.savedAt).toLocaleString()}</p>
                {result.notes ? <p className="text-paper-soft mt-1">{result.notes}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="glass-panel p-4 space-y-4">
      <div>
        <h2 className="font-semibold">Field verification</h2>
        <p className="text-sm text-paper-soft mt-1">
          Turn research uncertainties into store calls and logged results for {[brandName, retailerName].filter(Boolean).join(' · ') || 'this partnership'}.
          Benson will not contact anyone automatically.
        </p>
      </div>

      <div className="space-y-2">
        {tasks.map((task) => (
          <div
            key={task.key}
            className={`border rounded-lg p-3 space-y-2 ${activeTaskKey === task.key ? 'border-accent/50' : 'border-paper-edge'}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{task.title}</p>
                <p className="text-2xs text-paper-muted">{task.source}</p>
                {task.availabilityLabel ? (
                  <p className="text-2xs text-yellow-300 mt-1">{task.availabilityLabel}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost text-xs min-h-[36px] px-3" onClick={() => selectTask(task)}>
                  Record results
                </button>
                {task.kind === 'location_inventory' && task.locationIndex != null ? (
                  <button
                    type="button"
                    className="btn-primary text-xs min-h-[36px] px-3"
                    disabled={!!busy}
                    onClick={() => loadCallScript(task)}
                  >
                    {busy === `call-${task.key}` ? 'Loading…' : 'Call Location'}
                  </button>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-paper-soft">{task.description}</p>
          </div>
        ))}
      </div>

      {callScript ? (
        <div className="border border-accent/30 rounded-lg p-4 space-y-3 bg-accent/5">
          <p className="font-semibold text-sm">Call Location — {callScript.locationName}</p>
          {callScript.locationAddress ? <p className="text-xs text-paper-soft">{callScript.locationAddress}</p> : null}
          <div>
            <p className="text-xs font-semibold">Verification objectives</p>
            <ul className="list-disc pl-5 text-xs text-paper-soft">
              {callScript.objectives.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold">Suggested call script</p>
            <ul className="list-decimal pl-5 text-xs text-paper-soft space-y-1">
              {callScript.suggestedScript.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold">Follow-up questions</p>
            <ul className="list-disc pl-5 text-xs text-paper-soft">
              {callScript.followUpQuestions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold">Creator-access questions</p>
            <ul className="list-disc pl-5 text-xs text-paper-soft">
              {callScript.creatorAccessQuestions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="border border-paper-edge rounded-lg p-4 space-y-3">
        <p className="font-semibold text-sm">Field verification result</p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs space-y-1 md:col-span-2">
            Location
            <input
              className="input w-full text-sm"
              value={form.location}
              onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
            />
          </label>
          <label className="block text-xs space-y-1">
            Contact name
            <input
              className="input w-full text-sm"
              value={form.contactName}
              onChange={(e) => setForm((prev) => ({ ...prev, contactName: e.target.value }))}
            />
          </label>
          <label className="block text-xs space-y-1">
            Contact role
            <input
              className="input w-full text-sm"
              value={form.contactRole}
              onChange={(e) => setForm((prev) => ({ ...prev, contactRole: e.target.value }))}
            />
          </label>
          <label className="block text-xs space-y-1 md:col-span-2">
            Contacted at
            <input
              type="datetime-local"
              className="input w-full text-sm"
              value={form.contactedAt}
              onChange={(e) => setForm((prev) => ({ ...prev, contactedAt: e.target.value }))}
            />
          </label>
          {statusField('Inventory status', 'inventoryStatus', INVENTORY_STATUS_OPTIONS)}
          {statusField('Pickup status', 'pickupStatus', PROCESS_STATUS_OPTIONS)}
          {statusField('Ship-to-store status', 'shipToStoreStatus', PROCESS_STATUS_OPTIONS)}
          {statusField('Seller / resale intake status', 'sellerIntakeStatus', PROCESS_STATUS_OPTIONS)}
          {statusField('Filming status', 'filmingStatus', PERMISSION_STATUS_OPTIONS)}
          <label className="block text-xs space-y-1 md:col-span-2">
            Approval requirements
            <input
              className="input w-full text-sm"
              value={form.approvalRequirements}
              onChange={(e) => setForm((prev) => ({ ...prev, approvalRequirements: e.target.value }))}
            />
          </label>
          <label className="block text-xs space-y-1 md:col-span-2">
            Follow-up contact
            <input
              className="input w-full text-sm"
              value={form.followUpContact}
              onChange={(e) => setForm((prev) => ({ ...prev, followUpContact: e.target.value }))}
            />
          </label>
          <label className="block text-xs space-y-1 md:col-span-2">
            Notes
            <textarea
              className="input w-full text-sm min-h-[88px]"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </label>
        </div>
        <p className="text-2xs text-paper-muted">
          A confirmed yes or no both count as verified certainty. Unknown means the contact could not answer. Facts apply to this location only — not the whole chain.
        </p>
        <button type="button" className="btn-primary text-xs min-h-[40px] px-4" disabled={!!busy} onClick={saveResults}>
          {busy === 'save' ? 'Saving…' : 'Save verification results'}
        </button>
      </div>

      {offerRebuild ? (
        <div className="border border-accent/40 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-paper-soft">Verified information is ready to feed into Creator Play.</p>
          <button type="button" className="btn-primary text-xs min-h-[40px] px-4" disabled={rebuildBusy} onClick={onRebuildCreatorPlay}>
            {rebuildBusy ? 'Rebuilding…' : 'Rebuild Creator Play with verified information'}
          </button>
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold">Previous verification results</p>
          {results
            .slice()
            .reverse()
            .map((result) => (
              <div key={result.id} className="text-xs border border-paper-edge rounded-lg p-2">
                <p className="font-medium">{result.location ?? result.taskKey}</p>
                <p className="text-paper-muted">{new Date(result.savedAt).toLocaleString()}</p>
                <p className="text-paper-soft mt-1">
                  {[
                    result.inventoryStatus ? `inventory: ${result.inventoryStatus}` : null,
                    result.filmingStatus ? `filming: ${result.filmingStatus}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {result.notes ? <p className="text-paper-soft mt-1">{result.notes}</p> : null}
              </div>
            ))}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </section>
  );
}
