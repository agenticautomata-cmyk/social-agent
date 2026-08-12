'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { clientApiUrl } from '@/lib/client-api';
import {
  PROGRAM_LIBRARY_OPERATOR_SUBTITLE,
  PROGRAM_LIBRARY_OPERATOR_TITLE,
} from '@/lib/program-library-ui';

type ProgramRow = {
  id: string;
  programName: string;
  brandName: string;
  programTypeLabel: string;
  scopeLabel: string;
  modeLabel: string;
  verificationLabel: string;
  backgroundStatusLabel?: string | null;
  commissionBenefit: string | null;
  affiliateNetwork: string | null;
  lastVerifiedAt: string | null;
  mode: string;
};

type FilterKey =
  | 'all'
  | 'kc_local'
  | 'national'
  | 'affiliate'
  | 'creator_influencer'
  | 'referral'
  | 'activated'
  | 'needs_verification';

export function ProgramLibraryPanel() {
  const [rows, setRows] = useState<ProgramRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    brandName: '',
    programName: '',
    programType: 'affiliate',
    scope: 'kc_local',
    commissionBenefit: '',
    affiliateNetwork: '',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/program-library?limit=80'), { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'load_failed');
      setRows(data.programs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${PROGRAM_LIBRARY_OPERATOR_TITLE}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      switch (filter) {
        case 'kc_local':
          return row.scopeLabel === 'KC Local';
        case 'national':
          return row.scopeLabel === 'National';
        case 'affiliate':
          return row.programTypeLabel === 'Affiliate';
        case 'creator_influencer':
          return row.programTypeLabel === 'Creator' || row.programTypeLabel === 'Influencer';
        case 'referral':
          return row.programTypeLabel === 'Referral';
        case 'activated':
          return row.mode === 'activated';
        case 'needs_verification':
          return row.verificationLabel === 'Needs verification' || row.verificationLabel === 'Operator supplied';
        default:
          return true;
      }
    });
  }, [rows, filter]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brandName.trim() || !form.programName.trim()) return;
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/program-library'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName: form.brandName.trim(),
          programName: form.programName.trim(),
          programType: form.programType,
          scope: form.scope,
          commissionBenefit: form.commissionBenefit.trim() || null,
          affiliateNetwork: form.affiliateNetwork.trim() || null,
          notes: form.notes.trim() || null,
          sourceScreen: 'program_library_ui',
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'add_failed');
      setShowAdd(false);
      setForm({
        brandName: '',
        programName: '',
        programType: 'affiliate',
        scope: 'kc_local',
        commissionBenefit: '',
        affiliateNetwork: '',
        notes: '',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed');
    }
  }

  const filters: Array<{ key: FilterKey; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'kc_local', label: 'KC Local' },
    { key: 'national', label: 'National' },
    { key: 'affiliate', label: 'Affiliate' },
    { key: 'creator_influencer', label: 'Creator / Influencer' },
    { key: 'referral', label: 'Referral' },
    { key: 'activated', label: 'Activated' },
    { key: 'needs_verification', label: 'Needs verification' },
  ];

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{PROGRAM_LIBRARY_OPERATOR_TITLE}</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            {PROGRAM_LIBRARY_OPERATOR_SUBTITLE} Saved programs stay quiet until you activate them.
          </p>
        </div>
        <button
          type="button"
          className="studio-btn-primary text-sm px-4 py-2"
          onClick={() => setShowAdd((v) => !v)}
        >
          Add program
        </button>
      </div>

      {showAdd ? (
        <form onSubmit={handleAdd} className="glass-panel p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Brand
              <input
                className="studio-input mt-1 w-full"
                value={form.brandName}
                onChange={(e) => setForm((f) => ({ ...f, brandName: e.target.value }))}
                required
              />
            </label>
            <label className="block text-sm">
              Program name
              <input
                className="studio-input mt-1 w-full"
                value={form.programName}
                onChange={(e) => setForm((f) => ({ ...f, programName: e.target.value }))}
                required
              />
            </label>
            <label className="block text-sm">
              Type
              <select
                className="studio-input mt-1 w-full"
                value={form.programType}
                onChange={(e) => setForm((f) => ({ ...f, programType: e.target.value }))}
              >
                <option value="affiliate">Affiliate</option>
                <option value="creator">Creator</option>
                <option value="influencer">Influencer</option>
                <option value="referral">Referral</option>
                <option value="ambassador">Ambassador</option>
              </select>
            </label>
            <label className="block text-sm">
              Scope
              <select
                className="studio-input mt-1 w-full"
                value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
              >
                <option value="kc_local">KC Local</option>
                <option value="regional">Regional</option>
                <option value="national">National</option>
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              Commission / benefit
              <input
                className="studio-input mt-1 w-full"
                value={form.commissionBenefit}
                onChange={(e) => setForm((f) => ({ ...f, commissionBenefit: e.target.value }))}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              Affiliate network
              <input
                className="studio-input mt-1 w-full"
                value={form.affiliateNetwork}
                onChange={(e) => setForm((f) => ({ ...f, affiliateNetwork: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="studio-btn-primary text-sm px-4 py-2">
              Save to library
            </button>
            <button type="button" className="studio-btn-secondary text-sm px-4 py-2" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border ${
              filter === f.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background/60 border-border text-muted-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      <div className="grid gap-3">
        {filtered.map((row) => (
          <Link
            key={row.id}
            href={`/program-library/${row.id}`}
            className="glass-panel block p-4 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{row.programName}</p>
                <p className="text-sm text-muted-foreground truncate">{row.brandName}</p>
              </div>
              <span className="shrink-0 text-xs rounded-full px-2 py-0.5 bg-muted">{row.modeLabel}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{row.scopeLabel}</span>
              <span>·</span>
              <span>{row.programTypeLabel}</span>
              {row.commissionBenefit ? (
                <>
                  <span>·</span>
                  <span>{row.commissionBenefit}</span>
                </>
              ) : null}
              {row.affiliateNetwork ? (
                <>
                  <span>·</span>
                  <span>{row.affiliateNetwork}</span>
                </>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {row.verificationLabel}
              {row.backgroundStatusLabel ? (
                <>
                  <span> · </span>
                  <span>{row.backgroundStatusLabel}</span>
                </>
              ) : null}
            </p>
          </Link>
        ))}
        {!loading && filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No programs match this filter.</p>
        ) : null}
      </div>
    </div>
  );
}
