import { env } from '../env.js';
import {
  ANALYTICS_CONNECTOR_PROVIDERS,
  type AnalyticsConnectorProvider,
} from '../analytics-connectors/constants.js';
import { listAnalyticsConnectors } from '../analytics-connectors/registry.js';
import { isConnectorEnabled } from '../analytics-connectors/settings.js';
import { resolveTikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';
import { syncTikTokAnalytics } from './tiktok.js';
import { syncMetaAnalytics } from './meta.js';
import { syncProviderFromLocalData } from './demo.js';
import type {
  AnalyticsSyncRunResult,
  AnalyticsSyncStatus,
  ProviderSyncResult,
  SyncTrigger,
} from './types.js';

let syncInProgress = false;
let lastRunAt: string | null = null;
let lastTrigger: SyncTrigger | null = null;

export async function runCreatorAnalyticsSync(options?: {
  providers?: AnalyticsConnectorProvider[];
  trigger?: SyncTrigger;
}): Promise<AnalyticsSyncRunResult> {
  if (syncInProgress) {
    throw new Error('Analytics sync already in progress');
  }

  const trigger = options?.trigger ?? 'manual';
  const targets = options?.providers ?? [...ANALYTICS_CONNECTOR_PROVIDERS];
  const startedAt = new Date();
  syncInProgress = true;
  lastTrigger = trigger;

  const results: ProviderSyncResult[] = [];

  try {
    if (targets.includes('tiktok') && (await isConnectorEnabled('tiktok'))) {
      results.push(await syncTikTokAnalytics());
    } else if (targets.includes('tiktok')) {
      results.push({ provider: 'tiktok', ok: true, skipped: true, reason: 'disabled_in_settings' });
    }
    if (targets.includes('facebook') || targets.includes('instagram')) {
      const metaResults = await syncMetaAnalytics();
      if (targets.includes('facebook')) {
        const fb = metaResults.find((r) => r.provider === 'facebook');
        results.push(
          fb ?? { provider: 'facebook', ok: true, skipped: true, reason: 'disabled_in_settings' },
        );
      }
      if (targets.includes('instagram')) {
        const ig = metaResults.find((r) => r.provider === 'instagram');
        results.push(
          ig ?? { provider: 'instagram', ok: true, skipped: true, reason: 'disabled_in_settings' },
        );
      }
    }
    if (targets.includes('youtube')) {
      if (!(await isConnectorEnabled('youtube'))) {
        results.push({ provider: 'youtube', ok: true, skipped: true, reason: 'disabled_in_settings' });
      } else if (env.DEMO_MODE) {
        results.push(await syncProviderFromLocalData('youtube'));
      } else {
        results.push({
          provider: 'youtube',
          ok: true,
          skipped: true,
          reason: 'youtube_oauth_not_configured',
        });
      }
    }

    const tiktokResult = results.find((r) => r.provider === 'tiktok');
    if (tiktokResult?.ok && !tiktokResult.skipped) {
      try {
        const tiktokCtx = await resolveTikTokAnalyticsContext(env.DEMO_MODE);
        const { checkFollowers10000Milestone } = await import('../push-notifications/milestones.js');
        const milestone = await checkFollowers10000Milestone(tiktokCtx.followersCount);
        if (milestone.triggered) {
          console.log(
            `[creator-analytics-sync] 10K followers milestone — push=${milestone.pushSent ? 'yes' : 'no'} telegram=${milestone.telegramSent ? 'yes' : 'no'}`,
          );
        }
      } catch (err) {
        console.warn(
          '[creator-analytics-sync] milestone check failed:',
          err instanceof Error ? err.message : err,
        );
      }
    }

    return {
      trigger,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      results,
    };
  } finally {
    syncInProgress = false;
    lastRunAt = new Date().toISOString();
  }
}

export async function getAnalyticsSyncStatus(): Promise<AnalyticsSyncStatus> {
  const connectors = await listAnalyticsConnectors();
  return {
    inProgress: syncInProgress,
    lastRunAt,
    lastTrigger,
    connectors: connectors.map((c) => ({
      provider: c.provider,
      syncStatus: c.syncStatus,
      lastSyncAt: c.lastSyncAt,
      lastSuccessfulSyncAt: c.lastSuccessfulSyncAt,
      lastSyncError: c.lastSyncError,
    })),
  };
}

export type { AnalyticsSyncRunResult, AnalyticsSyncStatus, ProviderSyncResult, SyncTrigger };
