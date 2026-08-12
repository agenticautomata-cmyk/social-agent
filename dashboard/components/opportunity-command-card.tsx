'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

type AssistancePackage = {
  whyItMayFit?: Record<string, string>;
  contentOptions?: string[];
  visitPlan?: {
    suggestedTiming?: string;
    address?: string | null;
    mapUrl?: string | null;
    filmingRequirements?: string;
    shotList?: string[];
    questionsToAsk?: string[];
    verifyBeforeLeaving?: string[];
  };
  contentPackage?: {
    recommendedFormat?: string;
    openingHook?: string;
    talkingPoints?: string[];
    shotList?: string[];
    caption?: string;
    callToAction?: string;
    sourceAttribution?: string;
    disclosure?: string | null;
  };
  businessAction?: {
    contactChannel?: string | null;
    outreachRecommendation?: string;
    draftOutreach?: string | null;
    visitNormallyInstead?: boolean;
  };
};

type Props = {
  contentItemId: string;
  title: string;
  venue?: string | null;
  sourceUrl?: string | null;
  sourceName?: string | null;
  verificationLabel?: string | null;
  assistancePackage?: AssistancePackage | null;
  busyAction?: string | null;
  onAction: (action: string) => Promise<void>;
};

export function OpportunityCommandCard({
  contentItemId,
  title,
  venue,
  sourceUrl,
  sourceName,
  verificationLabel,
  assistancePackage,
  busyAction,
  onAction,
}: Props) {
  const router = useRouter();
  const pkg = assistancePackage;

  const hooks = [
    pkg?.contentPackage?.openingHook,
    ...(pkg?.contentPackage?.talkingPoints?.slice(0, 2) ?? []),
  ].filter(Boolean) as string[];

  return (
    <section className="glass-panel-strong gradient-border p-4 md:p-5 space-y-4">
      <header className="space-y-1">
        <p className="text-2xs uppercase tracking-wider text-paper-muted">Opportunity command</p>
        <h2 className="text-lg font-bold leading-snug">{title}</h2>
        {venue ? <p className="text-sm text-paper-soft">{venue}</p> : null}
        <div className="flex flex-wrap gap-2 text-2xs">
          {sourceName ? (
            <span className="rounded-full border border-paper-edge px-2 py-0.5">{sourceName.replace(/^\[Benson\]\s*/i, '')}</span>
          ) : null}
          {verificationLabel ? (
            <span className="rounded-full border border-accent/40 text-accent px-2 py-0.5">{verificationLabel}</span>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busyAction}
          onClick={() => router.push(`/discoveries/${contentItemId}/visit-plan`)}
          className="btn-primary text-xs min-h-[40px] px-4"
        >
          {pkg?.visitPlan ? 'Review visit plan' : 'Plan visit'}
        </button>
        <button
          type="button"
          disabled={!!busyAction}
          onClick={() => router.push(`/discoveries/${contentItemId}/content-package`)}
          className="btn-ghost text-xs min-h-[40px] px-3"
        >
          {pkg?.contentPackage ? 'Review content' : 'Build content'}
        </button>
        <button
          type="button"
          disabled={!!busyAction}
          onClick={() => router.push(`/discoveries/${contentItemId}/contact`)}
          className="btn-ghost text-xs min-h-[40px] px-3"
        >
          {pkg?.businessAction ? 'Review contact' : 'Contact business'}
        </button>
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost text-xs min-h-[40px] px-3 inline-flex items-center">
            Open source
          </a>
        ) : null}
      </div>

      {pkg?.whyItMayFit ? (
        <div className="text-xs space-y-1 border-l-2 border-accent/30 pl-3">
          <p className="font-bold">Why Kellie should care</p>
          {Object.entries(pkg.whyItMayFit)
            .slice(0, 3)
            .map(([key, value]) => (
              <p key={key}>
                <span className="text-paper-muted">{key}: </span>
                {value}
              </p>
            ))}
        </div>
      ) : null}

      {pkg?.visitPlan ? (
        <div className="text-xs space-y-2 border border-paper-edge rounded-lg p-3">
          <p className="font-bold">Plan visit</p>
          {pkg.visitPlan.suggestedTiming ? <p>When: {pkg.visitPlan.suggestedTiming}</p> : null}
          {pkg.visitPlan.address ? <p>Address: {pkg.visitPlan.address}</p> : null}
          {pkg.visitPlan.filmingRequirements ? <p>Filming: {pkg.visitPlan.filmingRequirements}</p> : null}
          {pkg.visitPlan.shotList?.length ? (
            <ul className="list-disc pl-4 space-y-0.5">
              {pkg.visitPlan.shotList.slice(0, 6).map((shot) => (
                <li key={shot}>{shot}</li>
              ))}
            </ul>
          ) : null}
          {pkg.visitPlan.questionsToAsk?.length ? (
            <p className="text-paper-muted">Questions: {pkg.visitPlan.questionsToAsk.slice(0, 3).join(' · ')}</p>
          ) : null}
          {pkg.visitPlan.mapUrl ? (
            <a href={pkg.visitPlan.mapUrl} target="_blank" rel="noreferrer" className="text-accent underline">
              Map link
            </a>
          ) : null}
          <p className="text-2xs text-paper-dim">Calendar suggestion only — no automatic Google export.</p>
        </div>
      ) : null}

      {pkg?.contentPackage ? (
        <div className="text-xs space-y-2 border border-paper-edge rounded-lg p-3">
          <p className="font-bold">Build TikTok package</p>
          {pkg.contentPackage.recommendedFormat ? <p>Format: {pkg.contentPackage.recommendedFormat}</p> : null}
          {hooks.length ? (
            <div>
              <p className="text-paper-muted mb-1">Hooks</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {hooks.map((hook) => (
                  <li key={hook}>{hook}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {pkg.contentPackage.shotList?.length ? (
            <p>Shot list: {pkg.contentPackage.shotList.slice(0, 5).join(' · ')}</p>
          ) : null}
          {pkg.contentPackage.caption ? <p className="italic">Caption: {pkg.contentPackage.caption.slice(0, 280)}</p> : null}
          {pkg.contentPackage.callToAction ? <p>CTA: {pkg.contentPackage.callToAction}</p> : null}
          {pkg.contentPackage.sourceAttribution ? (
            <p className="text-paper-muted">Source: {pkg.contentPackage.sourceAttribution}</p>
          ) : null}
          {pkg.contentPackage.disclosure ? <p className="text-paper-dim">{pkg.contentPackage.disclosure}</p> : null}
        </div>
      ) : null}

      {pkg?.businessAction ? (
        <div className="text-xs space-y-2 border border-paper-edge rounded-lg p-3">
          <p className="font-bold">Contact business</p>
          {pkg.businessAction.outreachRecommendation ? <p>{pkg.businessAction.outreachRecommendation}</p> : null}
          {pkg.businessAction.draftOutreach ? (
            <pre className="whitespace-pre-wrap text-paper-soft bg-paper-tint p-2 rounded text-2xs">
              {pkg.businessAction.draftOutreach}
            </pre>
          ) : null}
          {pkg.businessAction.contactChannel ? <p>Channel: {pkg.businessAction.contactChannel}</p> : null}
          <p className="text-2xs text-paper-dim">Review before send — no automatic email.</p>
          {pkg.businessAction.draftOutreach ? (
            <Link
              href={`/outreach/compose?seed=${encodeURIComponent(pkg.businessAction.draftOutreach.slice(0, 500))}`}
              className="btn-ghost text-2xs min-h-[32px] px-2 inline-flex items-center"
            >
              Open compose draft
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
