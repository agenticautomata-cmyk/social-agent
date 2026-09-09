/**
 * Review-queue admission for newly discovered contact evidence.
 *
 * Discovery must never make records actionable on its own. Findings enter a
 * review queue; only an explicit admission (human or integrator policy) may
 * mark them actionable for recommendations — and even then send gates still
 * apply via the contact-evidence contract.
 */

import type { DiscoveryEvidenceRecord } from './evidence.js';
import { evaluateDiscoveryFreshness } from './freshness.js';
import { evaluateDiscoveryPurpose } from './purpose-blocklist.js';
import {
  isDiscoveryPotentiallyUseful,
  type DiscoveryContactState,
} from './states.js';

export const DISCOVERY_REVIEW_QUEUE_STATUSES = [
  'pending_review',
  'admitted_actionable',
  'rejected',
  'monitor_only',
  'quarantined',
] as const;

export type DiscoveryReviewQueueStatus = (typeof DISCOVERY_REVIEW_QUEUE_STATUSES)[number];

export type DiscoveryReviewQueueItem = {
  status: DiscoveryReviewQueueStatus;
  record: DiscoveryEvidenceRecord;
  admittedAt: string | null;
  admissionReasons: string[];
  rejectionReasons: string[];
  /** Always false from discovery — pitches are owned elsewhere after human approval. */
  autoCreatePitch: false;
};

export type ReviewAdmissionDecision = {
  admit: boolean;
  status: DiscoveryReviewQueueStatus;
  reasons: string[];
};

/**
 * Decides whether a freshly built evidence record may enter the review queue
 * (pending) vs being rejected / monitor-only / quarantined immediately.
 *
 * Admission to the queue ≠ actionable. Actionable requires {@link admitDiscoveryRecord}.
 */
export function enqueueDiscoveryForReview(
  record: DiscoveryEvidenceRecord,
  now = new Date(),
): DiscoveryReviewQueueItem {
  if (record.producesPitch !== false) {
    return {
      status: 'rejected',
      record,
      admittedAt: null,
      admissionReasons: [],
      rejectionReasons: ['Discovery must not produce pitches.'],
      autoCreatePitch: false,
    };
  }

  if (record.discoveryState === 'conflicting' || record.conflictNote?.trim()) {
    return {
      status: 'quarantined',
      record,
      admittedAt: null,
      admissionReasons: [],
      rejectionReasons: [
        record.conflictNote?.trim() ||
          'Conflicting evidence is quarantined until a human resolves it.',
      ],
      autoCreatePitch: false,
    };
  }

  if (record.discoveryState === 'blocked_or_removed') {
    return {
      status: 'rejected',
      record,
      admittedAt: null,
      admissionReasons: [],
      rejectionReasons: record.creationBlockers.length
        ? record.creationBlockers
        : ['Contact is blocked or removed.'],
      autoCreatePitch: false,
    };
  }

  if (record.searchStepId === 'monitor_only' || record.discoveryState === 'unknown') {
    const hasNoRoute =
      !record.email && !record.contactFormUrl && !record.programUrl && !record.phone;
    if (hasNoRoute) {
      return {
        status: 'monitor_only',
        record,
        admittedAt: null,
        admissionReasons: [],
        rejectionReasons: [
          'No legitimate published route — monitor-only until an official page publishes one.',
        ],
        autoCreatePitch: false,
      };
    }
  }

  if (record.email) {
    const purpose = evaluateDiscoveryPurpose({ email: record.email });
    if (!purpose.allowed) {
      return {
        status: 'rejected',
        record,
        admittedAt: null,
        admissionReasons: [],
        rejectionReasons: [purpose.reason ?? 'Wrong-purpose inbox.'],
        autoCreatePitch: false,
      };
    }
  }

  if (record.discoveryState === 'inferred_unverified') {
    return {
      status: 'pending_review',
      record,
      admittedAt: null,
      admissionReasons: [
        'Inferred/unverified finding queued for human review — not actionable and not send-ready.',
      ],
      rejectionReasons: [],
      autoCreatePitch: false,
    };
  }

  if (isDiscoveryPotentiallyUseful(record.discoveryState) || record.discoveryState === 'stale_needs_recheck') {
    return {
      status: 'pending_review',
      record,
      admittedAt: null,
      admissionReasons: [
        `Queued for review from search step "${record.searchStepId}" with discovery state "${record.discoveryState}".`,
        `Captured ${now.toISOString()}.`,
      ],
      rejectionReasons: [],
      autoCreatePitch: false,
    };
  }

  return {
    status: 'pending_review',
    record,
    admittedAt: null,
    admissionReasons: ['Queued for review.'],
    rejectionReasons: [],
    autoCreatePitch: false,
  };
}

/**
 * Explicit admission after human (or integrator) review.
 * Still refuses wrong-purpose, blocked, conflicting, and inferred states.
 * Never creates a pitch.
 */
export function admitDiscoveryRecord(
  item: DiscoveryReviewQueueItem,
  input: {
    reviewerNote?: string | null;
    now?: Date;
    /** Force recheck freshness at admission time. */
    requireFresh?: boolean;
  } = {},
): DiscoveryReviewQueueItem {
  const now = input.now ?? new Date();
  const reasons: string[] = [];

  if (item.status === 'rejected' || item.status === 'monitor_only' || item.status === 'quarantined') {
    return {
      ...item,
      rejectionReasons: [
        ...item.rejectionReasons,
        'Cannot admit a rejected, monitor-only, or quarantined item without new evidence.',
      ],
      autoCreatePitch: false,
    };
  }

  const state = item.record.discoveryState;
  if (
    state === 'inferred_unverified' ||
    state === 'unknown' ||
    state === 'blocked_or_removed' ||
    state === 'conflicting'
  ) {
    return {
      ...item,
      status: 'rejected',
      admittedAt: null,
      admissionReasons: [],
      rejectionReasons: [
        `Discovery state "${state}" cannot become actionable without stronger official evidence.`,
      ],
      autoCreatePitch: false,
    };
  }

  if (item.record.email) {
    const purpose = evaluateDiscoveryPurpose({ email: item.record.email });
    if (!purpose.allowed) {
      return {
        ...item,
        status: 'rejected',
        admittedAt: null,
        admissionReasons: [],
        rejectionReasons: [purpose.reason ?? 'Wrong-purpose inbox.'],
        autoCreatePitch: false,
      };
    }
  }

  if (!item.record.sourceIsOfficial || !item.record.evidenceUrl) {
    return {
      ...item,
      status: 'rejected',
      admittedAt: null,
      admissionReasons: [],
      rejectionReasons: [
        'Actionable contacts require an official source URL retained as evidence.',
      ],
      autoCreatePitch: false,
    };
  }

  const freshness = evaluateDiscoveryFreshness({
    evidenceCapturedAt: item.record.evidenceCapturedAt,
    lastRecheckedAt: item.record.lastRecheckedAt,
    discoveryState: state,
    importantPitch: input.requireFresh ?? false,
    conflictNote: item.record.conflictNote,
    now,
  });
  if (freshness.needsRecheck && (input.requireFresh || state === 'stale_needs_recheck')) {
    return {
      ...item,
      status: 'pending_review',
      admittedAt: null,
      admissionReasons: [],
      rejectionReasons: [freshness.reason],
      autoCreatePitch: false,
    };
  }

  if (!isDiscoveryPotentiallyUseful(state) && state !== 'stale_needs_recheck') {
    reasons.push(`Unexpected state "${state}" — leaving pending.`);
    return {
      ...item,
      status: 'pending_review',
      admittedAt: null,
      admissionReasons: reasons,
      rejectionReasons: [],
      autoCreatePitch: false,
    };
  }

  if (input.reviewerNote?.trim()) {
    reasons.push(input.reviewerNote.trim());
  }
  reasons.push('Admitted to actionable contact intelligence after review.');

  return {
    status: 'admitted_actionable',
    record: item.record,
    admittedAt: now.toISOString(),
    admissionReasons: reasons,
    rejectionReasons: [],
    autoCreatePitch: false,
  };
}

/** Whether recommendations / UX may treat the item as usable contact intelligence. */
export function isReviewItemActionable(item: DiscoveryReviewQueueItem): boolean {
  return item.status === 'admitted_actionable' && item.autoCreatePitch === false;
}

export function actionableDiscoveryStates(): DiscoveryContactState[] {
  return [
    'verified_named_contact',
    'verified_role_inbox',
    'verified_official_form',
    'verified_program',
    'official_general_route',
  ];
}
