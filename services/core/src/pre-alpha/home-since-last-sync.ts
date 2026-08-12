/**
 * Home "Since your last sync" — durable operator check-in delta.
 * Checkpoint stored in existing benson_data_revisions (domain home_operator_sync).
 * Not a competing skip/revision system — snapshot compare only.
 */

import { eq, and, gt, or, ilike, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonDataRevisions, outreachInboundMessages } from '../schema.js';
import type { InventoryItem } from '../inventory/normalize.js';
import type { SponsorRecommendation } from '../sponsor-intelligence/recommendations.js';
import { shouldPromoteSponsorCandidate } from '../sponsor-intelligence/priority.js';
import type { StudioPulse } from './studio-pulse.js';

export const HOME_OPERATOR_SYNC_DOMAIN = 'home_operator_sync';

export type HomeOperatorSyncSnapshot = {
  capturedAt: string;
  followerCount: number | null;
  followersToGo: number | null;
  openDeals: number;
  sponsorCandidates: number;
  pitchReadyCount: number;
  pitchReadyLabel: string | null;
  researchingProspects: number;
  topSponsorNames: string[];
};

export type HomeSinceLastSyncPoint = { id: string; text: string };

export type HomeSinceLastSync = {
  headline: string;
  points: HomeSinceLastSyncPoint[];
  quiet: boolean;
  previousCheckpointAt: string | null;
};

const QUIET_COPY =
  'Nothing major changed since your last sync. Benson is still tracking the active pipeline.';

function asSnapshot(raw: unknown): HomeOperatorSyncSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.capturedAt !== 'string') return null;
  return {
    capturedAt: s.capturedAt,
    followerCount: typeof s.followerCount === 'number' ? s.followerCount : null,
    followersToGo: typeof s.followersToGo === 'number' ? s.followersToGo : null,
    openDeals: typeof s.openDeals === 'number' ? s.openDeals : 0,
    sponsorCandidates: typeof s.sponsorCandidates === 'number' ? s.sponsorCandidates : 0,
    pitchReadyCount: typeof s.pitchReadyCount === 'number' ? s.pitchReadyCount : 0,
    pitchReadyLabel: typeof s.pitchReadyLabel === 'string' ? s.pitchReadyLabel : null,
    researchingProspects: typeof s.researchingProspects === 'number' ? s.researchingProspects : 0,
    topSponsorNames: Array.isArray(s.topSponsorNames)
      ? s.topSponsorNames.filter((n): n is string => typeof n === 'string')
      : [],
  };
}

export function buildCurrentHomeSyncSnapshot(input: {
  now?: Date;
  studioPulse: StudioPulse;
  pipelineOpenDeals: number;
  sponsorCandidates: number;
  topSponsorCandidates: SponsorRecommendation[];
}): HomeOperatorSyncSnapshot {
  const names = input.topSponsorCandidates
    .filter((s) => shouldPromoteSponsorCandidate(s))
    .map((s) => s.businessName)
    .filter(Boolean)
    .slice(0, 12);
  return {
    capturedAt: (input.now ?? new Date()).toISOString(),
    followerCount: input.studioPulse.followerCount,
    followersToGo: input.studioPulse.followersToGo,
    openDeals: input.pipelineOpenDeals,
    sponsorCandidates: input.sponsorCandidates,
    pitchReadyCount: input.studioPulse.pitchReadyCount,
    pitchReadyLabel: input.studioPulse.topSponsorPitchLabel,
    researchingProspects: input.studioPulse.researchingProspects,
    topSponsorNames: names,
  };
}

export function computeSinceLastSyncDeltas(input: {
  previous: HomeOperatorSyncSnapshot | null;
  current: HomeOperatorSyncSnapshot;
  inventory: InventoryItem[];
  shopMyAcceptedSince?: boolean;
}): HomeSinceLastSync {
  const previous = input.previous;
  if (!previous) {
    return {
      headline: 'Since your last sync',
      points: [{ id: 'quiet', text: QUIET_COPY }],
      quiet: true,
      previousCheckpointAt: null,
    };
  }

  const since = new Date(previous.capturedAt).getTime();
  const points: HomeSinceLastSyncPoint[] = [];

  if (input.shopMyAcceptedSince) {
    points.push({
      id: 'shopmy-accepted',
      text: 'ShopMy accepted Kellie — no action needed',
    });
  }

  const newScreened = input.inventory.filter((item) => {
    const t = Date.parse(item.discoveredAt || item.createdAt || '');
    return Number.isFinite(t) && t > since;
  }).length;
  if (newScreened > 0) {
    points.push({
      id: 'screened',
      text: `${newScreened} new opportunit${newScreened === 1 ? 'y was' : 'ies were'} screened`,
    });
  }

  const expiredSince = input.inventory.filter((item) => {
    if (item.lifecycleStatus !== 'expired') return false;
    const t = Date.parse(item.updatedAt || item.discoveredAt || '');
    return Number.isFinite(t) && t > since;
  }).length;
  if (expiredSince > 0) {
    points.push({
      id: 'expired',
      text: `${expiredSince} stale opportunit${expiredSince === 1 ? 'y' : 'ies'} expired automatically`,
    });
  }

  const prevNames = new Set(previous.topSponsorNames.map((n) => n.toLowerCase()));
  const newSponsors = input.current.topSponsorNames.filter((n) => !prevNames.has(n.toLowerCase()));
  const sponsorDelta = input.current.sponsorCandidates - previous.sponsorCandidates;
  if (newSponsors.length > 0) {
    points.push({
      id: 'sponsors-forward',
      text: `${newSponsors.length} sponsor path${newSponsors.length === 1 ? '' : 's'} moved forward`,
    });
  } else if (sponsorDelta > 0) {
    points.push({
      id: 'sponsors-forward',
      text: `${sponsorDelta} sponsor path${sponsorDelta === 1 ? '' : 's'} moved forward`,
    });
  }

  const pitchBecameReady =
    input.current.pitchReadyLabel &&
    input.current.pitchReadyLabel !== previous.pitchReadyLabel &&
    input.current.pitchReadyCount > 0;
  const pitchCountUp = input.current.pitchReadyCount > previous.pitchReadyCount;
  if (pitchBecameReady) {
    points.push({
      id: 'pitch-ready',
      text: `One strong opportunity became pitch-ready: ${input.current.pitchReadyLabel}`,
    });
  } else if (pitchCountUp) {
    const n = input.current.pitchReadyCount - previous.pitchReadyCount;
    points.push({
      id: 'pitch-ready',
      text: `${n} opportunit${n === 1 ? 'y' : 'ies'} became pitch-ready`,
    });
  }

  if (
    input.current.followerCount != null &&
    previous.followerCount != null &&
    input.current.followerCount !== previous.followerCount
  ) {
    const delta = input.current.followerCount - previous.followerCount;
    const dir = delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString();
    points.push({
      id: 'followers-delta',
      text: `Followers ${dir} → ${input.current.followerCount.toLocaleString()}`,
    });
    if (input.current.followersToGo != null && input.current.followersToGo > 0) {
      points.push({
        id: 'followers-remain',
        text: `${input.current.followersToGo.toLocaleString()} followers remain to 10K`,
      });
    }
  }

  if (input.current.openDeals !== previous.openDeals) {
    const delta = input.current.openDeals - previous.openDeals;
    if (delta > 0) {
      points.push({
        id: 'deals-up',
        text: `${delta} new active deal${delta === 1 ? '' : 's'} entered the pipeline`,
      });
    } else if (delta < 0) {
      points.push({
        id: 'deals-down',
        text: `${Math.abs(delta)} deal${Math.abs(delta) === 1 ? '' : 's'} left the active pipeline`,
      });
    }
  }

  if (input.current.researchingProspects > previous.researchingProspects) {
    const n = input.current.researchingProspects - previous.researchingProspects;
    points.push({
      id: 'research',
      text: `Research advanced on ${n} more prospect${n === 1 ? '' : 's'}`,
    });
  }

  const trimmed = points.slice(0, 5);
  if (trimmed.length === 0) {
    return {
      headline: 'Since your last sync',
      points: [{ id: 'quiet', text: QUIET_COPY }],
      quiet: true,
      previousCheckpointAt: previous.capturedAt,
    };
  }

  return {
    headline: 'Since your last sync',
    points: trimmed,
    quiet: false,
    previousCheckpointAt: previous.capturedAt,
  };
}

export async function loadHomeOperatorSyncCheckpoint(): Promise<HomeOperatorSyncSnapshot | null> {
  const [row] = await db
    .select({ metadata: bensonDataRevisions.metadata })
    .from(bensonDataRevisions)
    .where(eq(bensonDataRevisions.domain, HOME_OPERATOR_SYNC_DOMAIN))
    .limit(1);
  if (!row) return null;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return asSnapshot(meta.snapshot);
}

export async function saveHomeOperatorSyncCheckpoint(
  snapshot: HomeOperatorSyncSnapshot,
): Promise<void> {
  const now = new Date(snapshot.capturedAt);
  await db
    .insert(bensonDataRevisions)
    .values({
      domain: HOME_OPERATOR_SYNC_DOMAIN,
      revision: 1,
      updatedAt: now,
      lastEventType: 'home_operator_sync',
      lastSource: 'pre-alpha/home',
      lastSuccess: true,
      lastRecordIds: [],
      metadata: { snapshot },
    })
    .onConflictDoUpdate({
      target: bensonDataRevisions.domain,
      set: {
        revision: sql`${bensonDataRevisions.revision} + 1`,
        updatedAt: now,
        lastEventType: 'home_operator_sync',
        lastSource: 'pre-alpha/home',
        lastSuccess: true,
        metadata: { snapshot },
      },
    });
}

/** Detect ShopMy acceptance emails received after checkpoint. */
export async function detectShopMyAcceptedSince(sinceIso: string | null): Promise<boolean> {
  if (!sinceIso) return false;
  const since = new Date(sinceIso);
  if (Number.isNaN(since.getTime())) return false;
  const [row] = await db
    .select({ id: outreachInboundMessages.id })
    .from(outreachInboundMessages)
    .where(
      and(
        gt(outreachInboundMessages.receivedAt, since),
        or(
          ilike(outreachInboundMessages.subject, "%you're in%"),
          ilike(outreachInboundMessages.subject, '%youre in%'),
          ilike(outreachInboundMessages.subject, '%accepted%'),
          and(
            or(
              ilike(outreachInboundMessages.fromEmail, '%shopmy%'),
              ilike(outreachInboundMessages.fromName, '%shopmy%'),
            ),
            or(
              ilike(outreachInboundMessages.subject, '%in!%'),
              ilike(outreachInboundMessages.snippet, '%accepted%'),
              ilike(outreachInboundMessages.snippet, '%welcome to shopmy%'),
            ),
          ),
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}
