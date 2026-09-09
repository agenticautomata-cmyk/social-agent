'use client';

import Link from 'next/link';
import {
  KC_ASK_TYPE_LABELS,
  KC_COMPENSATION_ACCESS_LABELS,
  KC_EVIDENCE_STATE_LABELS,
  KC_FRESHNESS_LABELS,
  KC_ROUTE_TYPE_LABELS,
  type KcRecommendationCard,
} from '@/lib/contact-intelligence-ui';

function formatChecked(iso: string | null): string {
  if (!iso) return 'Not verified yet';
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

export function RecommendationCard({
  card,
  onFeedback,
  busy,
}: {
  card: KcRecommendationCard;
  onFeedback?: (action: 'dismissed' | 'saved' | 'viewed') => void;
  busy?: boolean;
}) {
  const briefHref = card.contactId
    ? `/contacts-programs/${card.contactId}${card.id ? `?recommendation=${card.id}` : ''}`
    : `/contacts-programs/recommendations/${card.id}`;

  return (
    <article className="glass-panel p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={briefHref} className="font-semibold text-base hover:text-accent break-words">
            {card.organizationName}
          </Link>
          <p className="text-2xs text-paper-muted mt-0.5">
            {[card.category, card.area].filter(Boolean).join(' · ') || 'Kansas City metro'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 justify-end">
          <span className="text-2xs uppercase tracking-wide border border-paper-edge px-2 py-0.5">
            {KC_ROUTE_TYPE_LABELS[card.routeType]}
          </span>
          <span className="text-2xs uppercase tracking-wide border border-paper-edge px-2 py-0.5">
            {KC_ASK_TYPE_LABELS[card.askType]}
          </span>
        </div>
      </div>

      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-2xs uppercase text-paper-muted">Why fit</dt>
          <dd>{card.whyFit}</dd>
        </div>
        <div>
          <dt className="text-2xs uppercase text-paper-muted">Why now</dt>
          <dd>{card.whyNow}</dd>
        </div>
        <div>
          <dt className="text-2xs uppercase text-paper-muted">Route</dt>
          <dd>{card.routeSummary}</dd>
        </div>
        <div>
          <dt className="text-2xs uppercase text-paper-muted">Evidence</dt>
          <dd>
            {KC_EVIDENCE_STATE_LABELS[card.evidenceState]} · last checked{' '}
            {formatChecked(card.lastVerifiedAt)}
            {card.evidenceSummary ? ` — ${card.evidenceSummary}` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-2xs uppercase text-paper-muted">Realistic ask</dt>
          <dd>{card.askSummary}</dd>
        </div>
        <div>
          <dt className="text-2xs uppercase text-paper-muted">Value to org</dt>
          <dd>{card.valueToOrg}</dd>
        </div>
        <div>
          <dt className="text-2xs uppercase text-paper-muted">Content concept</dt>
          <dd>{card.contentConcept}</dd>
        </div>
        <div>
          <dt className="text-2xs uppercase text-paper-muted">Media kit</dt>
          <dd>
            {card.mediaKitVariant ?? 'Not selected yet'}
            {card.mediaKitId ? (
              <>
                {' '}
                <Link href="/media-kits" className="text-accent hover:underline">
                  open library
                </Link>
              </>
            ) : null}
          </dd>
        </div>
        {card.weaknesses.length > 0 ? (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">Weaknesses</dt>
            <dd>
              <ul className="list-disc pl-4 space-y-0.5">
                {card.weaknesses.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-2xs uppercase text-paper-muted">Access / compensation</dt>
          <dd>
            {KC_COMPENSATION_ACCESS_LABELS[card.compensationAccessType]} ·{' '}
            {KC_FRESHNESS_LABELS[card.freshness]}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href={briefHref}
          className="studio-btn-primary text-sm px-4 py-2 min-h-[44px] inline-flex items-center"
          onClick={() => onFeedback?.('viewed')}
        >
          Open contact brief
        </Link>
        {card.nextActionHref ? (
          <Link
            href={card.nextActionHref}
            className="btn-ghost text-sm px-3 py-2 min-h-[44px] inline-flex items-center"
          >
            {card.nextAction}
          </Link>
        ) : (
          <span className="text-sm text-paper-muted self-center">{card.nextAction}</span>
        )}
        {onFeedback ? (
          <>
            <button
              type="button"
              disabled={busy}
              className="btn-ghost text-sm px-3 py-2 min-h-[44px]"
              onClick={() => onFeedback('saved')}
            >
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              className="btn-ghost text-sm px-3 py-2 min-h-[44px]"
              onClick={() => onFeedback('dismissed')}
            >
              Dismiss
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}
