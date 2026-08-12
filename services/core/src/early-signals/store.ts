import { and, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  alertDeliveries,
  earlySignalAlertPreferences,
  earlySignalEvidence,
  earlySignals,
  sourceSnapshots,
  sourceWatchers,
  type EarlySignal,
  type NewEarlySignal,
  type SourceWatcher,
} from '../schema.js';
import type {
  EarlySignalView,
  ScoreExplanationLine,
  SignalState,
} from './types.js';
import { buildClusterKey, extractDomain } from './keywords.js';
import { applyTrustedCreatorSurfaceAuthority } from './trusted-creator-surface.js';

function mapExplanation(value: unknown): ScoreExplanationLine[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    if (entry && typeof entry === 'object' && 'detail' in entry) {
      const line = entry as Partial<ScoreExplanationLine>;
      return {
        factor: String(line.factor ?? 'factor'),
        points: Number(line.points ?? 0),
        detail: String(line.detail ?? ''),
      };
    }
    return {
      factor: 'note',
      points: 0,
      detail: String(entry ?? `explanation_${index}`),
    };
  });
}

function normalizeContentRecommendation(
  value: unknown,
  fallback: { title: string; sourceName: string | null; missing?: string[] },
): EarlySignalView['contentRecommendation'] {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const confirmedFacts = Array.isArray(raw.confirmedFacts)
    ? raw.confirmedFacts.map(String)
    : [];
  const needsVerification = Array.isArray(raw.needsVerification)
    ? raw.needsVerification.map(String)
    : Array.isArray(fallback.missing)
      ? fallback.missing
      : [];

  const explanation =
    raw.explanation && typeof raw.explanation === 'object'
      ? (raw.explanation as { summary?: string })
      : null;
  const attribution =
    typeof raw.attribution === 'string'
      ? raw.attribution
      : typeof raw.sourceAttribution === 'string'
        ? raw.sourceAttribution
        : fallback.sourceName;

  const recommendedAction =
    typeof raw.recommendedAction === 'string'
      ? raw.recommendedAction
      : typeof raw.recommendation === 'string'
        ? String(raw.recommendation).replace(/_/g, ' ')
        : explanation?.summary
          ? explanation.summary
          : 'Review and verify before posting';

  const kind =
    typeof raw.kind === 'string'
      ? (raw.kind as EarlySignalView['contentRecommendation']['kind'])
      : 'wait_and_verify';

  return {
    kind,
    suggestedHook:
      typeof raw.suggestedHook === 'string' ? raw.suggestedHook : `${fallback.title} — early lead`,
    confirmedFacts,
    needsVerification,
    suggestedTiming:
      typeof raw.suggestedTiming === 'string' ? raw.suggestedTiming : 'Monitor and verify before filming',
    sourceAttribution: attribution ?? 'Secondary / trusted creator source',
    callToAction:
      typeof raw.callToAction === 'string'
        ? raw.callToAction
        : 'Save and request more research before treating this as official',
    discloseNotVisited: typeof raw.discloseNotVisited === 'boolean' ? raw.discloseNotVisited : true,
    recommendedAction,
  };
}

export async function getLatestSnapshotHash(watcherId: string): Promise<string | null> {
  const [row] = await db
    .select({ contentHash: sourceSnapshots.contentHash })
    .from(sourceSnapshots)
    .where(eq(sourceSnapshots.watcherId, watcherId))
    .orderBy(desc(sourceSnapshots.fetchedAt))
    .limit(1);
  return row?.contentHash ?? null;
}

export async function insertSnapshot(input: {
  watcherId: string;
  contentHash: string;
  extractedContent: string | null;
  responseStatus: number | null;
  changeSummary: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(sourceSnapshots).values({
    watcherId: input.watcherId,
    contentHash: input.contentHash,
    extractedContent: input.extractedContent,
    responseStatus: input.responseStatus,
    changeSummary: input.changeSummary,
    metadata: input.metadata ?? {},
  });
}

export async function listEnabledWatchers(): Promise<SourceWatcher[]> {
  return db.select().from(sourceWatchers).where(eq(sourceWatchers.enabled, true));
}

export async function updateWatcherHealth(
  watcherId: string,
  input: {
    ok: boolean;
    changed?: boolean;
    error?: string;
  },
): Promise<void> {
  const now = new Date();
  if (input.ok) {
    await db
      .update(sourceWatchers)
      .set({
        lastSuccessfulCheck: now,
        updatedAt: now,
        consecutiveFailureCount: 0,
        healthStatus: 'healthy',
        ...(input.changed ? { lastChangedAt: now } : {}),
        lastFailureAt: null,
        lastFailureMessage: null,
      })
      .where(eq(sourceWatchers.id, watcherId));
    return;
  }

  await db
    .update(sourceWatchers)
    .set({
      lastFailureAt: now,
      updatedAt: now,
      lastFailureMessage: input.error?.slice(0, 500) ?? 'unknown_error',
      consecutiveFailureCount: sql`${sourceWatchers.consecutiveFailureCount} + 1`,
      healthStatus: 'failed',
    })
    .where(eq(sourceWatchers.id, watcherId));
}

export async function findSignalByContentHash(hash: string): Promise<EarlySignal | null> {
  const [row] = await db
    .select()
    .from(earlySignals)
    .where(eq(earlySignals.contentHash, hash))
    .limit(1);
  return row ?? null;
}

export async function findActiveSignalByCluster(clusterKey: string): Promise<EarlySignal | null> {
  const [row] = await db
    .select()
    .from(earlySignals)
    .where(
      and(
        eq(earlySignals.clusterKey, clusterKey),
        inArray(earlySignals.signalState, ['active', 'needs_verification', 'snoozed']),
      ),
    )
    .orderBy(desc(earlySignals.firstDetectedAt))
    .limit(1);
  return row ?? null;
}

export async function insertSignal(row: NewEarlySignal): Promise<EarlySignal> {
  const [created] = await db.insert(earlySignals).values(row).returning();
  if (!created) throw new Error('Failed to insert early signal');
  return created;
}

export async function insertEvidence(input: {
  signalId: string;
  evidenceType: string;
  sourceUrl?: string | null;
  sourceName?: string | null;
  extractedClaim: string;
  reliabilityScore?: number;
}): Promise<void> {
  await db.insert(earlySignalEvidence).values({
    signalId: input.signalId,
    evidenceType: input.evidenceType,
    sourceUrl: input.sourceUrl ?? null,
    sourceName: input.sourceName ?? null,
    extractedClaim: input.extractedClaim,
    reliabilityScore: String(input.reliabilityScore ?? 0.5),
  });
}

export async function updateSignal(
  signalId: string,
  patch: Partial<NewEarlySignal> & { updatedAt?: Date },
): Promise<EarlySignal | null> {
  const [row] = await db
    .update(earlySignals)
    .set({ ...patch, updatedAt: patch.updatedAt ?? new Date() })
    .where(eq(earlySignals.id, signalId))
    .returning();
  return row ?? null;
}

export async function loadSignalView(signalId: string): Promise<EarlySignalView | null> {
  const [signal] = await db.select().from(earlySignals).where(eq(earlySignals.id, signalId)).limit(1);
  if (!signal) return null;

  const evidence = await db
    .select()
    .from(earlySignalEvidence)
    .where(eq(earlySignalEvidence.signalId, signalId))
    .orderBy(desc(earlySignalEvidence.detectedAt));

  const normalizedData = (signal.normalizedData ?? {}) as Record<string, unknown>;
  const recommendation = normalizeContentRecommendation(signal.contentRecommendation, {
    title: signal.title,
    sourceName: signal.sourceName,
  });
  const missingVerification = recommendation.needsVerification;

  const baseView: EarlySignalView = {
    id: signal.id,
    signalType: signal.signalType,
    title: signal.title,
    summary: signal.summary,
    sourceUrl: signal.sourceUrl,
    sourceName: signal.sourceName,
    sourceCategory: signal.sourceCategory,
    businessName: signal.businessName,
    address: signal.address,
    city: signal.city,
    regionState: signal.regionState,
    firstDetectedAt: signal.firstDetectedAt.toISOString(),
    lastCheckedAt: signal.lastCheckedAt.toISOString(),
    eventDate: signal.eventDate?.toISOString() ?? null,
    confidenceLevel: signal.confidenceLevel as EarlySignalView['confidenceLevel'],
    confidenceScore: Number(signal.confidenceScore),
    confidenceExplanation: mapExplanation(signal.confidenceExplanation),
    urgencyLevel: signal.urgencyLevel as EarlySignalView['urgencyLevel'],
    urgencyScore: Number(signal.urgencyScore),
    urgencyExplanation: mapExplanation(signal.urgencyExplanation),
    verificationStatus: signal.verificationStatus as EarlySignalView['verificationStatus'],
    state: signal.signalState as SignalState,
    linkedOpportunityId: signal.linkedOpportunityId,
    clusterKey: signal.clusterKey,
    contentRecommendation: recommendation,
    evidence: evidence.map((e) => ({
      id: e.id,
      evidenceType: e.evidenceType,
      sourceUrl: e.sourceUrl,
      sourceName: e.sourceName,
      extractedClaim: e.extractedClaim,
      reliabilityScore: Number(e.reliabilityScore),
      detectedAt: e.detectedAt.toISOString(),
    })),
    missingVerification,
    alertSentAt: signal.alertSentAt?.toISOString() ?? null,
    metadata: {
      ...(signal.metadata as Record<string, unknown>),
      normalizedData,
      curatorLeadId: normalizedData.curatorLeadId ?? null,
      discoveredViaPostUrl: normalizedData.discoveredViaPostUrl ?? null,
      discoveredViaSlideNumber: normalizedData.discoveredViaSlideNumber ?? null,
      officialLinks: normalizedData.officialLinks ?? null,
      verificationLabel: normalizedData.verificationStatus ?? signal.verificationStatus,
      sourceKind: signal.sourceCategory === 'curator_watchlist' ? 'trusted_creator_secondary' : 'source',
      sourceHonesty: normalizedData.sourceHonesty ?? null,
    },
  };

  // Recompute-on-read: producer planning_lead/confirmed stamps cannot bypass freshness.
  return applyTrustedCreatorSurfaceAuthority(baseView).view;
}

const HIDDEN_SIGNAL_STATES = ['dismissed', 'skipped', 'merged', 'promoted'] as const;

export async function listSignals(filters?: {
  state?: string[];
  urgency?: string[];
  confidence?: string[];
  limit?: number;
}): Promise<EarlySignalView[]> {
  const limit = filters?.limit ?? 100;
  const conditions = [isNull(earlySignals.dismissedAt)];
  if (filters?.state?.length) {
    conditions.push(inArray(earlySignals.signalState, filters.state));
  } else {
    // Active queues must not resurface skipped/dismissed/merged rows.
    conditions.push(
      sql`${earlySignals.signalState} NOT IN (${sql.join(
        HIDDEN_SIGNAL_STATES.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    );
  }
  if (filters?.urgency?.length) conditions.push(inArray(earlySignals.urgencyLevel, filters.urgency));
  if (filters?.confidence?.length) {
    conditions.push(inArray(earlySignals.confidenceLevel, filters.confidence));
  }

  const rows = await db
    .select()
    .from(earlySignals)
    .where(and(...conditions))
    .orderBy(desc(earlySignals.firstDetectedAt))
    .limit(limit);

  const views: EarlySignalView[] = [];
  for (const row of rows) {
    const view = await loadSignalView(row.id);
    if (!view) continue;
    // Expired one-off trusted-creator/dated signals stay in DB for audit/history
    // but must not appear on active planning queues.
    if (view.metadata?.surfaceEligible === false) continue;
    views.push(view);
  }
  return views;
}

export async function listFailedWatchers(): Promise<SourceWatcher[]> {
  return db
    .select()
    .from(sourceWatchers)
    .where(or(eq(sourceWatchers.healthStatus, 'failed'), gte(sourceWatchers.consecutiveFailureCount, 3)));
}

export async function getAlertPreferences() {
  const [row] = await db.select().from(earlySignalAlertPreferences).limit(1);
  return row ?? null;
}

export async function saveAlertPreferences(
  patch: Partial<typeof earlySignalAlertPreferences.$inferInsert>,
): Promise<void> {
  await db
    .insert(earlySignalAlertPreferences)
    .values({ id: 'global', ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: earlySignalAlertPreferences.id,
      set: { ...patch, updatedAt: new Date() },
    });
}

export async function recordAlertDelivery(input: {
  signalId?: string | null;
  opportunityId?: string | null;
  channel: string;
  recipient?: string | null;
  success: boolean;
  providerResponse?: string | null;
  payloadHash?: string | null;
  retryCount?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(alertDeliveries).values({
    signalId: input.signalId ?? null,
    opportunityId: input.opportunityId ?? null,
    channel: input.channel,
    recipient: input.recipient ?? null,
    success: input.success,
    providerResponse: input.providerResponse?.slice(0, 1000) ?? null,
    payloadHash: input.payloadHash ?? null,
    retryCount: input.retryCount ?? 0,
    metadata: input.metadata ?? {},
  });
}

export async function wasAlertSentForHash(payloadHash: string): Promise<boolean> {
  const [row] = await db
    .select({ id: alertDeliveries.id })
    .from(alertDeliveries)
    .where(and(eq(alertDeliveries.payloadHash, payloadHash), eq(alertDeliveries.success, true)))
    .limit(1);
  return Boolean(row);
}

export function clusterKeyForResult(input: {
  entityName?: string | null;
  address?: string | null;
  sourceUrl?: string | null;
}): string | null {
  return buildClusterKey({
    businessName: input.entityName,
    address: input.address,
    domain: extractDomain(input.sourceUrl),
  });
}

export async function listRecentDeliveries(signalId: string, limit = 10) {
  return db
    .select()
    .from(alertDeliveries)
    .where(eq(alertDeliveries.signalId, signalId))
    .orderBy(desc(alertDeliveries.deliveredAt))
    .limit(limit);
}
