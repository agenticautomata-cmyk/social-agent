'use client';

type Citation = { url: string; title?: string | null; retrievedAt?: string; sourceType?: string };
type Claim = { value?: unknown; label?: string; citations?: Citation[]; note?: string | null };
type Contact = {
  id: string;
  name?: string | null;
  title?: string | null;
  organization?: string | null;
  email?: string | null;
  phone?: string | null;
  contactFormUrl?: string | null;
  sourceUrl?: string | null;
  verificationStatus?: string;
  rank?: number | null;
  rankReason?: string | null;
  relevanceReason?: string;
  scope?: string;
};
type Program = {
  id: string;
  name?: string | null;
  programType: string;
  officialUrl?: string | null;
  verificationStatus?: string;
  compensationOfficial?: boolean;
  compensation?: string | null;
  notes?: string | null;
  citations?: Citation[];
};
type Stage = { id: string; label: string; status: string; reason?: string | null };
type Fit = { dimension: string; rating: string; reason: string };
type Idea = {
  id: string;
  concept: string;
  whyItFits: string;
  requiredAccess: string;
  estimatedEffort: string;
  permissionNeeded: boolean;
  suggestedTiming: string;
};

export type OpportunityDossier = {
  researchRunId?: string;
  researchedAt?: string;
  status?: string;
  currentStageId?: string | null;
  stages?: Stage[];
  business?: Record<string, Claim>;
  contacts?: Contact[];
  programs?: Program[];
  news?: Array<{ title: string; url: string; factSummary: string }>;
  fit?: Fit[];
  contentRecommendations?: Idea[];
  outreachPrep?: {
    recommendedApproach?: string;
    draft?: string | null;
    personalizationFacts?: string[];
  } | null;
  missingOrConflicting?: string[];
  recommendedNextAction?: string;
  provenance?: { articleUrls?: string[]; emailSource?: string | null };
};

const LABEL_CLASS: Record<string, string> = {
  verified: 'text-accent border-accent/40',
  partially_verified: 'text-paper-ink border-paper-edge',
  unverified_lead: 'text-paper-muted border-paper-edge',
  conflicting: 'text-amber-700 border-amber-400/50',
  not_found: 'text-paper-dim border-paper-edge',
  blocked: 'text-red-600 border-red-300/50',
};

function ClaimRow({ label, claim }: { label: string; claim?: Claim }) {
  if (!claim) return null;
  const status = claim.label ?? 'not_found';
  const display =
    claim.value == null || claim.value === ''
      ? status.replace(/_/g, ' ')
      : Array.isArray(claim.value)
        ? claim.value.join(', ')
        : typeof claim.value === 'object'
          ? Object.entries(claim.value as Record<string, string>)
              .map(([k, v]) => `${k}: ${v}`)
              .join(' · ')
          : String(claim.value);
  return (
    <li className="space-y-0.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-paper-muted">{label}:</span>
        <span>{display}</span>
        <span className={`text-2xs px-1.5 py-0.5 rounded border ${LABEL_CLASS[status] ?? LABEL_CLASS.not_found}`}>
          {status.replace(/_/g, ' ')}
        </span>
      </div>
      {claim.note ? <p className="text-2xs text-paper-dim">{claim.note}</p> : null}
      {claim.citations?.length ? (
        <p className="text-2xs text-paper-muted">
          {claim.citations.slice(0, 2).map((c) => (
            <a key={c.url} href={c.url} target="_blank" rel="noreferrer" className="underline mr-2 break-all">
              {c.title || c.url}
            </a>
          ))}
        </p>
      ) : null}
    </li>
  );
}

export function OpportunityResearchDossierPanel({
  dossier,
  busy,
}: {
  dossier: OpportunityDossier | null | undefined;
  busy?: boolean;
}) {
  if (!dossier) {
    return (
      <section className="glass-panel p-4 space-y-2">
        <h2 className="text-sm font-bold">Opportunity dossier</h2>
        <p className="text-xs text-paper-muted">
          {busy ? 'Research in progress…' : 'Run Research this to build a source-backed dossier with contacts, programs, and citations.'}
        </p>
      </section>
    );
  }

  const biz = dossier.business ?? {};
  const running = dossier.status === 'running' || dossier.status === 'queued';

  return (
    <div className="space-y-4">
      <section className="glass-panel p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">Opportunity dossier</h2>
          <span className="text-2xs text-paper-muted">
            {dossier.status?.replace(/_/g, ' ')}
            {dossier.researchRunId ? ` · run ${dossier.researchRunId.slice(0, 8)}` : ''}
          </span>
        </div>
        {running && dossier.currentStageId ? (
          <p className="text-xs text-accent">Current stage: {dossier.currentStageId.replace(/_/g, ' ')}</p>
        ) : null}
        {dossier.recommendedNextAction ? (
          <p className="text-xs leading-relaxed">{dossier.recommendedNextAction}</p>
        ) : null}
      </section>

      <section className="glass-panel p-4 space-y-2">
        <h3 className="text-sm font-bold">Verified business details</h3>
        <ul className="text-xs space-y-2 text-paper-soft">
          <ClaimRow label="Name" claim={biz.officialName} />
          <ClaimRow label="Parent" claim={biz.parentCompany} />
          <ClaimRow label="Category" claim={biz.category} />
          <ClaimRow label="Website" claim={biz.website} />
          <ClaimRow label="Location page" claim={biz.locationPage} />
          <ClaimRow label="Address" claim={biz.streetAddress} />
          <ClaimRow label="City / area" claim={biz.cityStateZip} />
          <ClaimRow label="Phone" claim={biz.phone} />
          <ClaimRow label="Hours" claim={biz.hours} />
          <ClaimRow label="Opening" claim={biz.openingDate} />
          <ClaimRow label="Socials" claim={biz.socials} />
          <ClaimRow label="Map" claim={biz.mapLink} />
        </ul>
      </section>

      <section className="glass-panel p-4 space-y-2">
        <h3 className="text-sm font-bold">Contacts</h3>
        {(dossier.contacts ?? []).length === 0 ? (
          <p className="text-xs text-paper-muted">No public contacts found yet.</p>
        ) : (
          <ul className="text-xs space-y-3">
            {(dossier.contacts ?? [])
              .filter((c) => c.verificationStatus !== 'rejected_guess' && c.verificationStatus !== 'rejected_private')
              .map((c) => (
                <li key={c.id} className="border-l-2 border-accent/30 pl-3 space-y-0.5">
                  <p className="font-bold">
                    {c.rank != null ? `#${c.rank} ` : ''}
                    {c.name ?? c.title ?? c.organization ?? 'Contact'}
                  </p>
                  {c.rankReason ? <p className="text-paper-muted">{c.rankReason}</p> : null}
                  {c.email ? <p>Email: {c.email}</p> : null}
                  {c.phone ? <p>Phone: {c.phone}</p> : null}
                  {c.contactFormUrl ? (
                    <p>
                      Form:{' '}
                      <a href={c.contactFormUrl} target="_blank" rel="noreferrer" className="underline break-all">
                        {c.contactFormUrl}
                      </a>
                    </p>
                  ) : null}
                  {c.sourceUrl ? (
                    <p className="text-2xs">
                      Evidence:{' '}
                      <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="underline break-all">
                        {c.sourceUrl}
                      </a>
                    </p>
                  ) : null}
                  <p className="text-2xs text-paper-dim">
                    {(c.verificationStatus ?? 'unverified_lead').replace(/_/g, ' ')} · {c.scope}
                  </p>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="glass-panel p-4 space-y-2">
        <h3 className="text-sm font-bold">Programs and partnership pathways</h3>
        {(dossier.programs ?? []).length === 0 ? (
          <p className="text-xs text-paper-muted">No official programs confirmed.</p>
        ) : (
          <ul className="text-xs space-y-2">
            {(dossier.programs ?? []).map((p) => (
              <li key={p.id}>
                <span className="font-bold">{p.programType.replace(/_/g, ' ')}</span>
                {p.name ? ` — ${p.name}` : ''}
                <span className="text-paper-muted"> · {(p.verificationStatus ?? 'not_found').replace(/_/g, ' ')}</span>
                {p.officialUrl ? (
                  <div>
                    <a href={p.officialUrl} target="_blank" rel="noreferrer" className="underline break-all">
                      {p.officialUrl}
                    </a>
                  </div>
                ) : null}
                {p.notes ? <p className="text-paper-dim">{p.notes}</p> : null}
                {!p.compensationOfficial && p.compensation == null ? (
                  <p className="text-2xs text-paper-dim">Compensation not confirmed from an official source.</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-panel p-4 space-y-2">
        <h3 className="text-sm font-bold">KCKellie fit</h3>
        <ul className="text-xs space-y-1">
          {(dossier.fit ?? []).map((f) => (
            <li key={f.dimension}>
              <span className="font-bold">{f.dimension.replace(/_/g, ' ')}</span>: {f.rating} — {f.reason}
            </li>
          ))}
        </ul>
      </section>

      <section className="glass-panel p-4 space-y-2">
        <h3 className="text-sm font-bold">Content ideas</h3>
        <ul className="text-xs space-y-2">
          {(dossier.contentRecommendations ?? []).map((idea) => (
            <li key={idea.id}>
              <p className="font-bold">{idea.concept}</p>
              <p>{idea.whyItFits}</p>
              <p className="text-paper-muted">
                Access: {idea.requiredAccess} · Effort: {idea.estimatedEffort}
                {idea.permissionNeeded ? ' · permission advised' : ''}
              </p>
              <p className="text-2xs text-paper-dim">Timing: {idea.suggestedTiming}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass-panel p-4 space-y-2">
        <h3 className="text-sm font-bold">Source articles</h3>
        <ul className="text-xs space-y-1">
          {(dossier.news ?? []).map((n) => (
            <li key={n.url}>
              <a href={n.url} target="_blank" rel="noreferrer" className="underline break-all">
                {n.title}
              </a>
              <p className="text-paper-muted">{n.factSummary}</p>
            </li>
          ))}
          {(dossier.provenance?.articleUrls ?? []).map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer" className="underline break-all">
                {url}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {(dossier.missingOrConflicting ?? []).length > 0 ? (
        <section className="glass-panel p-4 space-y-2">
          <h3 className="text-sm font-bold">Missing or conflicting</h3>
          <ul className="text-xs list-disc pl-4 space-y-1">
            {(dossier.missingOrConflicting ?? []).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="glass-panel p-4 space-y-2">
        <h3 className="text-sm font-bold">Research stages</h3>
        <ul className="text-2xs grid grid-cols-1 sm:grid-cols-2 gap-1">
          {(dossier.stages ?? []).map((s) => (
            <li key={s.id}>
              <span className="text-paper-muted">{s.label}:</span> {s.status.replace(/_/g, ' ')}
              {s.reason ? ` (${s.reason})` : ''}
            </li>
          ))}
        </ul>
        {dossier.researchedAt ? (
          <p className="text-2xs text-paper-dim">Researched {new Date(dossier.researchedAt).toLocaleString()}</p>
        ) : null}
      </section>

      {dossier.outreachPrep?.draft ? (
        <section className="glass-panel p-4 space-y-2">
          <h3 className="text-sm font-bold">Outreach prep (not sent)</h3>
          <p className="text-xs">{dossier.outreachPrep.recommendedApproach}</p>
          <pre className="whitespace-pre-wrap text-xs bg-paper-tint p-3 rounded-lg">{dossier.outreachPrep.draft}</pre>
          <p className="text-2xs text-paper-dim">Human approval required — Benson never sends automatically.</p>
        </section>
      ) : null}
    </div>
  );
}
