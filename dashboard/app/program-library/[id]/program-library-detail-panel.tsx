'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '@/lib/client-api';
import { PROGRAM_LIBRARY_OPERATOR_TITLE } from '@/lib/program-library-ui';

type ProgramDetail = {
  id: string;
  programName: string;
  brandName: string;
  programTypeLabel: string;
  scopeLabel: string;
  modeLabel: string;
  verificationLabel: string;
  backgroundStatusLabel?: string | null;
  commissionBenefit: string | null;
  audienceBenefit: string | null;
  affiliateNetwork: string | null;
  cookieWindow: string | null;
  eligibility: string | null;
  officialProgramUrl: string | null;
  applicationUrl: string | null;
  contactPath: string | null;
  notes: string | null;
  locationNote: string | null;
  evidenceUrls: string[];
  conflictingClaims: Array<{ field: string; claims: Array<{ value: string | null; authority: string }> }>;
  lastVerifiedAt: string | null;
  dateAdded: string;
  mode: string;
  partnershipHref: string | null;
};

export function ProgramLibraryDetailPanel({ programId }: { programId: string }) {
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl(`/api/program-library/${programId}`), { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'load_failed');
      setProgram(data.program);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load program');
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: 'activate' | 'deactivate' | 'verify') {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(clientApiUrl(`/api/program-library/${programId}/${action}`), { method: 'POST' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? `${action}_failed`);
      setProgram(data.program ?? program);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!program) return <p className="text-sm text-destructive">{error ?? 'Program not found'}</p>;

  return (
    <div className="space-y-4 pb-24">
      <Link href="/program-library" className="text-sm text-muted-foreground hover:text-foreground">
        ← {PROGRAM_LIBRARY_OPERATOR_TITLE}
      </Link>

      <div className="glass-panel p-4 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{program.programName}</h1>
            <p className="text-sm text-muted-foreground">{program.brandName}</p>
          </div>
          <span className="text-xs rounded-full px-2 py-0.5 bg-muted">{program.modeLabel}</span>
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <span>{program.scopeLabel}</span>
          <span>·</span>
          <span>{program.programTypeLabel}</span>
          <span>·</span>
          <span>{program.verificationLabel}</span>
          {program.backgroundStatusLabel ? (
            <>
              <span>·</span>
              <span>{program.backgroundStatusLabel}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {program.mode !== 'activated' ? (
          <button
            type="button"
            disabled={busy != null}
            className="studio-btn-primary text-sm px-4 py-2"
            onClick={() => void runAction('activate')}
          >
            {busy === 'activate' ? 'Activating…' : 'Activate'}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy != null}
            className="studio-btn-secondary text-sm px-4 py-2"
            onClick={() => void runAction('deactivate')}
          >
            {busy === 'deactivate' ? 'Saving…' : 'Return to library'}
          </button>
        )}
        <button
          type="button"
          disabled={busy != null}
          className="studio-btn-secondary text-sm px-4 py-2"
          onClick={() => void runAction('verify')}
        >
          {busy === 'verify' ? 'Verifying…' : 'Verify missing info'}
        </button>
        {program.partnershipHref ? (
          <Link href={program.partnershipHref} className="studio-btn-secondary text-sm px-4 py-2 inline-flex items-center">
            Open partnership
          </Link>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="glass-panel p-4 space-y-3 text-sm">
        <h2 className="font-semibold">Program details</h2>
        <DetailRow label="Commission / benefit" value={program.commissionBenefit} />
        <DetailRow label="Audience benefit" value={program.audienceBenefit} />
        <DetailRow label="Network / platform" value={program.affiliateNetwork} />
        <DetailRow label="Cookie / referral window" value={program.cookieWindow} />
        <DetailRow label="Eligibility" value={program.eligibility} />
        <DetailRow label="Location note" value={program.locationNote} />
        <DetailRow label="Official program URL" value={program.officialProgramUrl} link />
        <DetailRow label="Application URL" value={program.applicationUrl} link />
        <DetailRow label="Contact path" value={program.contactPath} />
        <DetailRow label="Notes" value={program.notes} />
        <DetailRow label="Date added" value={new Date(program.dateAdded).toLocaleDateString()} />
        <DetailRow
          label="Last verified"
          value={program.lastVerifiedAt ? new Date(program.lastVerifiedAt).toLocaleString() : 'Not yet verified'}
        />
      </section>

      {program.evidenceUrls.length > 0 ? (
        <section className="glass-panel p-4 space-y-2 text-sm">
          <h2 className="font-semibold">Evidence</h2>
          <ul className="list-disc pl-5 space-y-1">
            {program.evidenceUrls.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer" className="text-primary underline break-all">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {program.conflictingClaims.length > 0 ? (
        <section className="glass-panel p-4 space-y-2 text-sm border-amber-500/30">
          <h2 className="font-semibold">Discrepancies</h2>
          {program.conflictingClaims.map((c) => (
            <div key={c.field}>
              <p className="font-medium">{c.field}</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {c.claims.map((claim, i) => (
                  <li key={i}>
                    {claim.value ?? '—'} ({claim.authority.replace(/_/g, ' ')})
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function DetailRow({
  label,
  value,
  link,
}: {
  label: string;
  value: string | null;
  link?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      {link && value.startsWith('http') ? (
        <a href={value} target="_blank" rel="noreferrer" className="text-primary underline break-all">
          {value}
        </a>
      ) : (
        <p>{value}</p>
      )}
    </div>
  );
}
