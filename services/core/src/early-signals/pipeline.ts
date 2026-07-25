import type { NormalizedAdapterResult } from './types.js';
import {
  buildContentRecommendation,
  isFirstPartyCategory,
  scoreConfidence,
  scoreUrgency,
} from './scoring.js';
import {
  clusterKeyForResult,
  findActiveSignalByCluster,
  findSignalByContentHash,
  getAlertPreferences,
  insertEvidence,
  insertSignal,
  insertSnapshot,
  getLatestSnapshotHash,
  listEnabledWatchers,
  loadSignalView,
  updateSignal,
  updateWatcherHealth,
} from './store.js';
import { runWatcherAdapter, normalizedFromManualTip } from './adapters.js';
import { mergeKeywordPatterns } from './keywords.js';
import { deliverSignalAlerts, isAlertEligible } from './alerts.js';
import { findDuplicateOpportunity } from '../green-screen/duplicates.js';

export type PipelineRunResult = {
  watchersChecked: number;
  watchersFailed: number;
  signalsCreated: number;
  signalsUpdated: number;
  alertsSent: number;
  errors: string[];
};

async function upsertFromAdapterResult(
  result: NormalizedAdapterResult,
  watcherId: string | null,
): Promise<{ created: boolean; signalId: string; shouldAlert: boolean }> {
  const existing = await findSignalByContentHash(result.contentHash);
  const clusterKey = clusterKeyForResult(result);
  const clusterMatch = clusterKey ? await findActiveSignalByCluster(clusterKey) : null;

  const dup = await findDuplicateOpportunity({
    contentItemId: '00000000-0000-0000-0000-000000000000',
    title: result.entityName ?? result.changeSummary,
    sourceUrl: result.sourceUrl,
  }).catch(() => null);

  const prefs = await getAlertPreferences();
  const keywords = mergeKeywordPatterns(prefs?.keywordPatterns as never);
  void keywords;

  const firstParty = isFirstPartyCategory(result.sourceCategory);
  const confidence = scoreConfidence({
    results: [result],
    evidenceCount: clusterMatch ? 2 : 1,
    firstParty,
  });
  const urgency = scoreUrgency({
    signalType: result.signalType,
    eventDate: null,
    confidenceLevel: confidence.level,
    matchedKeywords: result.matchedKeywords,
  });

  const recommendation = buildContentRecommendation({
    signalType: result.signalType,
    confidenceLevel: confidence.level,
    urgencyLevel: urgency.level,
    title: result.entityName ?? result.changeSummary.slice(0, 120),
    confirmedFacts: firstParty ? [result.changeSummary] : [],
    needsVerification: firstParty ? [] : ['Awaiting official confirmation or second source'],
    sourceName: result.sourceName,
  });

  if (existing) {
    await updateSignal(existing.id, {
      lastCheckedAt: new Date(),
      summary: result.changeSummary,
      confidenceLevel: confidence.level,
      confidenceScore: String(confidence.score),
      confidenceExplanation: confidence.explanation,
      urgencyLevel: urgency.level,
      urgencyScore: String(urgency.score),
      urgencyExplanation: urgency.explanation,
      contentRecommendation: recommendation,
      metadata: { ...(existing.metadata as object), duplicateOpportunityId: dup?.id ?? null },
    });
    return { created: false, signalId: existing.id, shouldAlert: false };
  }

  const targetCluster = clusterMatch;
  if (targetCluster) {
    await insertEvidence({
      signalId: targetCluster.id,
      evidenceType: result.sourceCategory,
      sourceUrl: result.sourceUrl,
      sourceName: result.sourceName,
      extractedClaim: result.changeSummary,
      reliabilityScore: firstParty ? 0.85 : 0.55,
    });
    const mergedConfidence = scoreConfidence({
      results: [result],
      evidenceCount: 2,
      firstParty,
    });
    await updateSignal(targetCluster.id, {
      lastCheckedAt: new Date(),
      confidenceLevel: mergedConfidence.level,
      confidenceScore: String(mergedConfidence.score),
      confidenceExplanation: mergedConfidence.explanation,
      verificationStatus: mergedConfidence.level === 'confirmed' ? 'confirmed' : 'partial',
      signalState: 'needs_verification',
    });
    const eligible = isAlertEligible(
      { ...targetCluster, confidenceLevel: mergedConfidence.level, urgencyLevel: targetCluster.urgencyLevel },
      prefs,
    );
    return { created: false, signalId: targetCluster.id, shouldAlert: eligible.eligible };
  }

  const [created] = await Promise.all([
    insertSignal({
      signalType: result.signalType,
      title: result.entityName ?? result.changeSummary.slice(0, 180),
      summary: result.changeSummary,
      sourceUrl: result.sourceUrl,
      sourceName: result.sourceName,
      sourceCategory: result.sourceCategory,
      businessName: result.entityName,
      address: result.address,
      city: result.city,
      regionState: result.state,
      eventDate: null,
      rawText: result.supportingText,
      normalizedData: result.metadata ?? {},
      contentHash: result.contentHash,
      confidenceLevel: confidence.level,
      confidenceScore: String(confidence.score),
      confidenceExplanation: confidence.explanation,
      urgencyLevel: urgency.level,
      urgencyScore: String(urgency.score),
      urgencyExplanation: urgency.explanation,
      verificationStatus: firstParty ? 'partial' : 'unverified',
      signalState: confidence.level === 'low' ? 'needs_verification' : 'active',
      watcherId,
      clusterKey,
      contentRecommendation: recommendation,
      metadata: {
        contentHash: result.contentHash,
        duplicateOpportunityId: dup?.id ?? null,
        matchedKeywords: result.matchedKeywords,
      },
    }),
  ]);

  await insertEvidence({
    signalId: created.id,
    evidenceType: result.sourceCategory,
    sourceUrl: result.sourceUrl,
    sourceName: result.sourceName,
    extractedClaim: result.changeSummary,
    reliabilityScore: firstParty ? 0.85 : 0.55,
  });

  if (watcherId) {
    const { upsertScoutItemFromSignal } = await import('../benson-scout/scout-items.js');
    await upsertScoutItemFromSignal({
      watcherId,
      itemUrl: result.sourceUrl,
      captionText: result.supportingText ?? result.changeSummary,
      itemType: result.signalType,
      contentHash: result.contentHash,
      linkedEarlySignalId: created.id,
    }).catch(() => null);
  }

  const eligible = isAlertEligible(created, prefs);
  return { created: true, signalId: created.id, shouldAlert: eligible.eligible };
}

export async function runEarlySignalPipeline(options?: {
  watcherIds?: string[];
}): Promise<PipelineRunResult> {
  const result: PipelineRunResult = {
    watchersChecked: 0,
    watchersFailed: 0,
    signalsCreated: 0,
    signalsUpdated: 0,
    alertsSent: 0,
    errors: [],
  };

  let watchers = await listEnabledWatchers();
  if (options?.watcherIds?.length) {
    const allowed = new Set(options.watcherIds);
    watchers = watchers.filter((w) => allowed.has(w.id));
  }
  for (const watcher of watchers) {
    result.watchersChecked += 1;
    const previousHash = await getLatestSnapshotHash(watcher.id);
    const prefs = await getAlertPreferences();
    const adapterResult = await runWatcherAdapter(
      watcher,
      mergeKeywordPatterns(prefs?.keywordPatterns as never),
      previousHash,
    );

    await insertSnapshot({
      watcherId: watcher.id,
      contentHash: adapterResult.contentHash,
      extractedContent: adapterResult.extractedContent,
      responseStatus: adapterResult.responseStatus,
      changeSummary: adapterResult.changeSummary,
      metadata: { ok: adapterResult.ok, resultCount: adapterResult.results.length },
    });

    if (!adapterResult.ok) {
      result.watchersFailed += 1;
      result.errors.push(`${watcher.sourceName}: ${adapterResult.error ?? 'fetch_failed'}`);
      await updateWatcherHealth(watcher.id, { ok: false, error: adapterResult.error });
      continue;
    }

    await updateWatcherHealth(watcher.id, { ok: true, changed: adapterResult.changed });

    if (!adapterResult.changed && previousHash != null) continue;

    for (const normalized of adapterResult.results) {
      try {
        const upsert = await upsertFromAdapterResult(normalized, watcher.id);
        if (upsert.created) result.signalsCreated += 1;
        else result.signalsUpdated += 1;

        if (upsert.shouldAlert) {
          const view = await loadSignalView(upsert.signalId);
          if (view) {
            const delivery = await deliverSignalAlerts(view);
            if (delivery.push.sent || delivery.telegram.sent) result.alertsSent += 1;
          }
        }
      } catch (err) {
        result.errors.push(
          `${watcher.sourceName}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return result;
}

export async function ingestManualTip(input: {
  title: string;
  summary: string;
  sourceUrl?: string | null;
  businessName?: string | null;
  signalType?: string;
}): Promise<{ signalId: string; created: boolean }> {
  const prefs = await getAlertPreferences();
  const normalized = normalizedFromManualTip({
    ...input,
    keywords: mergeKeywordPatterns(prefs?.keywordPatterns as never),
  });
  const upsert = await upsertFromAdapterResult(normalized, null);
  return { signalId: upsert.signalId, created: upsert.created };
}

export async function sendTestSignalAlert(signalId: string): Promise<Awaited<ReturnType<typeof deliverSignalAlerts>>> {
  const view = await loadSignalView(signalId);
  if (!view) throw new Error('Signal not found');
  return deliverSignalAlerts(view, { force: true, test: true });
}
