'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { clientApiUrl, parseApiJsonResponse } from '@/lib/client-api';
import { useActionToast } from '@/components/action-toast';
import {
  KC_COMPENSATION_ACCESS_LABELS,
  KC_EVIDENCE_STATE_LABELS,
  KC_ROUTE_TYPE_LABELS,
  MEDIA_ACCESS_DEFAULT_DISCLAIMER,
  type KcContactBrief,
  type KcFeedbackAction,
} from '@/lib/contact-intelligence-ui';

type BriefApi = {
  ok: true;
  stub: boolean;
  brief: KcContactBrief | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function ContactBriefPanel({
  briefId,
  mode,
}: {
  briefId: string;
  mode: 'contact' | 'recommendation';
}) {
  const searchParams = useSearchParams();
  const recommendationId = searchParams.get('recommendation');
  const [brief, setBrief] = useState<KcContactBrief | null>(null);
  const [stub, setStub] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useActionToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const path =
        mode === 'recommendation'
          ? `/api/contact-intelligence/recommendations/${briefId}/brief`
          : `/api/contact-intelligence/briefs/${briefId}`;
      const res = await fetch(clientApiUrl(path), { cache: 'no-store' });
      const parsed = await parseApiJsonResponse<BriefApi>(res);
      if (!parsed.ok) throw new Error(parsed.error);
      setStub(Boolean(parsed.data.stub));
      setBrief(parsed.data.brief);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load brief');
      setBrief(null);
    } finally {
      setLoading(false);
    }
  }, [briefId, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!brief || mode !== 'contact') return;
    const id = recommendationId ?? brief.recommendationId;
    if (!id) return;
    void fetch(clientApiUrl(`/api/contact-intelligence/recommendations/${id}/feedback`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'viewed' satisfies KcFeedbackAction }),
    });
  }, [brief?.id, recommendationId, mode]);

  async function feedback(action: KcFeedbackAction) {
    setBusy(true);
    try {
      const id = brief?.recommendationId ?? recommendationId ?? briefId;
      const res = await fetch(
        clientApiUrl(`/api/contact-intelligence/briefs/${id}/feedback`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      );
      const parsed = await parseApiJsonResponse(res);
      if (!parsed.ok) throw new Error(parsed.error);
      showToast({
        title: 'Recorded',
        nextStep:
          action === 'saved'
            ? 'Saved for later.'
            : 'Benson will weight future suggestions from this.',
      });
    } catch (err) {
      showToast({
        title: "That didn't save",
        nextStep: err instanceof Error ? err.message : 'Failed',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-paper-muted italic">Loading contact brief…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (!brief) {
    return (
      <div className="space-y-4">
        <Link href="/contacts-programs" className="text-sm text-accent hover:underline">
          ← Contacts & Programs
        </Link>
        <p className="text-sm text-paper-muted italic border border-dashed border-paper-edge px-4 py-8 text-center">
          {stub
            ? 'Brief stub — primary will attach organization, route evidence, and draft fields. No invented contact shown.'
            : 'No brief found for this id.'}
        </p>
      </div>
    );
  }

  const pitchHref =
    brief.pitchApprovalHref ??
    (brief.sendReady ? '/email/approvals' : null);
  const formHref = brief.formPacketHref ?? '/email/form-packets';
  const showFormPacket = Boolean(brief.formPacket && brief.formPacket.length > 0);
  const mediaDisclaimer =
    brief.mediaAccessDisclaimer ??
    (brief.routeType === 'media_access' || brief.compensationAccessType === 'media_access_not_paid'
      ? MEDIA_ACCESS_DEFAULT_DISCLAIMER
      : null);

  return (
    <div className="space-y-5 pb-28">
      <Link href="/contacts-programs" className="text-sm text-accent hover:underline inline-block">
        ← Contacts & Programs
      </Link>

      <header className="space-y-1">
        <h1 className="page-title leading-tight">{brief.organizationName}</h1>
        <p className="text-sm text-paper-muted">
          {[brief.category, brief.area].filter(Boolean).join(' · ') || 'Kansas City metro'}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="text-2xs uppercase border border-paper-edge px-2 py-0.5">
            {KC_ROUTE_TYPE_LABELS[brief.routeType]}
          </span>
          <span className="text-2xs uppercase border border-paper-edge px-2 py-0.5">
            {KC_EVIDENCE_STATE_LABELS[brief.evidenceState]}
          </span>
          <span className="text-2xs uppercase border border-paper-edge px-2 py-0.5">
            {KC_COMPENSATION_ACCESS_LABELS[brief.compensationAccessType]}
          </span>
        </div>
      </header>

      {mediaDisclaimer ? (
        <div className="border border-amber-700/40 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          {mediaDisclaimer}
        </div>
      ) : null}

      {brief.compensationAccessType === 'unknown' ? (
        <p className="text-sm text-paper-muted border border-dashed border-paper-edge px-3 py-2">
          Compensation unknown — leave it unknown. Do not invent rates or guarantees.
        </p>
      ) : null}

      <section className="glass-panel p-4 space-y-3 text-sm">
        <h2 className="text-sm font-semibold">Contact</h2>
        <dl className="grid gap-2">
          <div>
            <dt className="text-2xs uppercase text-paper-muted">Person or team</dt>
            <dd>{brief.contactPersonOrTeam ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-2xs uppercase text-paper-muted">Role</dt>
            <dd>{brief.role ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-2xs uppercase text-paper-muted">Email</dt>
            <dd className="break-all">{brief.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-2xs uppercase text-paper-muted">Phone</dt>
            <dd>{brief.phone ?? '—'}</dd>
          </div>
          {brief.formUrl ? (
            <div>
              <dt className="text-2xs uppercase text-paper-muted">Official form</dt>
              <dd>
                <a href={brief.formUrl} target="_blank" rel="noreferrer" className="text-accent break-all">
                  {brief.formUrl}
                </a>
              </dd>
            </div>
          ) : null}
          {brief.applicationUrl ? (
            <div>
              <dt className="text-2xs uppercase text-paper-muted">Application</dt>
              <dd>
                <a
                  href={brief.applicationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent break-all"
                >
                  {brief.applicationUrl}
                </a>
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-2xs uppercase text-paper-muted">Verified source</dt>
            <dd>
              {brief.verifiedSourceUrl ? (
                <a
                  href={brief.verifiedSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent break-all"
                >
                  {brief.verifiedSourceUrl}
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-2xs uppercase text-paper-muted">Last checked</dt>
            <dd>{formatDate(brief.lastCheckedAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="glass-panel p-4 space-y-3 text-sm">
        <h2 className="text-sm font-semibold">Why this route</h2>
        <p>{brief.whyRouteAppropriate}</p>
        <div>
          <h3 className="text-2xs uppercase text-paper-muted">What to ask for</h3>
          <p className="mt-1">{brief.whatToAskFor}</p>
        </div>
        {brief.whatNotToClaim.length > 0 ? (
          <div>
            <h3 className="text-2xs uppercase text-paper-muted">What not to claim</h3>
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              {brief.whatNotToClaim.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {showFormPacket ? (
        <section className="glass-panel p-4 space-y-3 text-sm border border-amber-700/30">
          <h2 className="text-sm font-semibold">Form packet (not an email)</h2>
          <p className="text-xs text-paper-muted">
            Copy field by field into the official form. Benson will not submit this for you.
          </p>
          <ul className="space-y-3">
            {brief.formPacket!.map((field) => (
              <li key={field.fieldLabel} className="border border-paper-edge px-3 py-2">
                <div className="text-2xs uppercase text-paper-muted">{field.fieldLabel}</div>
                <p className="mt-1 whitespace-pre-wrap">{field.suggestedValue}</p>
                {field.notes ? <p className="text-xs text-paper-muted mt-1">{field.notes}</p> : null}
              </li>
            ))}
          </ul>
          <Link href={formHref} className="bracket text-sm hover:text-accent">
            Open form packets queue →
          </Link>
        </section>
      ) : (
        <section className="glass-panel p-4 space-y-3 text-sm">
          <h2 className="text-sm font-semibold">Pitch draft</h2>
          {brief.suggestedSubjectLine ? (
            <div>
              <h3 className="text-2xs uppercase text-paper-muted">Subject</h3>
              <p className="mt-1 font-medium">{brief.suggestedSubjectLine}</p>
            </div>
          ) : null}
          {brief.tailoredPitchDraft ? (
            <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
              {brief.tailoredPitchDraft}
            </pre>
          ) : (
            <p className="text-paper-muted italic">No draft yet — approval still required before any send.</p>
          )}
        </section>
      )}

      <section className="glass-panel p-4 space-y-3 text-sm">
        <h2 className="text-sm font-semibold">Collateral & history</h2>
        <div>
          <h3 className="text-2xs uppercase text-paper-muted">Media kit</h3>
          <p className="mt-1">
            {brief.mediaKitVariant ?? 'Not selected'}
            {brief.mediaKitHref || brief.mediaKitId ? (
              <>
                {' '}
                <Link href={brief.mediaKitHref ?? '/media-kits'} className="text-accent">
                  open
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {brief.supportingContentExamples.length > 0 ? (
          <ul className="space-y-1">
            {brief.supportingContentExamples.map((ex) => (
              <li key={ex.label}>
                {ex.href ? (
                  <a href={ex.href} className="text-accent" target="_blank" rel="noreferrer">
                    {ex.label}
                  </a>
                ) : (
                  ex.label
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {brief.applicationRequirements.length > 0 ? (
          <div>
            <h3 className="text-2xs uppercase text-paper-muted">Application requirements</h3>
            <ul className="mt-1 list-disc pl-4">
              {brief.applicationRequirements.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {brief.affiliatePublished ? (
          <div className="space-y-1">
            <h3 className="text-2xs uppercase text-paper-muted">Affiliate (published only)</h3>
            <p>Commission: {brief.affiliatePublished.commission ?? 'unknown'}</p>
            <p>Cookie: {brief.affiliatePublished.cookieDuration ?? 'unknown'}</p>
            <p>Requirements: {brief.affiliatePublished.requirements ?? '—'}</p>
            {brief.affiliatePublished.sourceUrl ? (
              <a
                href={brief.affiliatePublished.sourceUrl}
                className="text-accent break-all"
                target="_blank"
                rel="noreferrer"
              >
                {brief.affiliatePublished.sourceUrl}
              </a>
            ) : null}
          </div>
        ) : null}
        <div>
          <h3 className="text-2xs uppercase text-paper-muted">Suggested follow-up</h3>
          <p className="mt-1">{formatDate(brief.suggestedFollowUpDate)}</p>
        </div>
        {brief.usageRightsOrDeliverableConcerns.length > 0 ? (
          <ul className="list-disc pl-4 text-amber-900 dark:text-amber-100">
            {brief.usageRightsOrDeliverableConcerns.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}
        <div>
          <h3 className="text-2xs uppercase text-paper-muted">Previous contact / reply</h3>
          <p className="mt-1">{brief.previousOutreachSummary ?? 'No prior outreach on record.'}</p>
        </div>
      </section>

      {/* Sticky mobile CTA: brief → pitch approval */}
      <div className="fixed bottom-16 inset-x-0 z-20 border-t border-paper-edge bg-paper/95 backdrop-blur px-4 py-3 sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="max-w-3xl mx-auto flex flex-wrap gap-2">
          {showFormPacket ? (
            <Link
              href={formHref}
              className="studio-btn-primary text-sm px-4 py-2 min-h-[44px] inline-flex items-center flex-1 justify-center sm:flex-none"
            >
              Review form packet
            </Link>
          ) : pitchHref ? (
            <Link
              href={pitchHref}
              className="studio-btn-primary text-sm px-4 py-2 min-h-[44px] inline-flex items-center flex-1 justify-center sm:flex-none"
              onClick={() => void feedback('draft_created')}
            >
              Open pitch approval
            </Link>
          ) : (
            <span className="text-sm text-paper-muted self-center">
              {brief.needsVerification
                ? 'Needs verification before pitch approval.'
                : 'Pitch not ready — verify the route first.'}
            </span>
          )}
          <button
            type="button"
            disabled={busy}
            className="btn-ghost text-sm px-3 py-2 min-h-[44px]"
            onClick={() => void feedback('saved')}
          >
            Save
          </button>
          <Link href="/media-kits" className="btn-ghost text-sm px-3 py-2 min-h-[44px] inline-flex items-center">
            Media kits
          </Link>
        </div>
      </div>
    </div>
  );
}
