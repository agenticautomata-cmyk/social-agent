import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { env } from '../env.js';
import { featureFlags } from '../feature-flags.js';
import { getOutreachSendConfig } from '../sponsor-outreach/send.js';

export type PreAlphaStatusResponse = {
  ok: boolean;
  generatedAt: string;
  version: string;
  demoMode: boolean;
  database: 'ok' | 'error';
  databaseError?: string;
  outreach: {
    mode: 'live' | 'simulate';
    liveEnabled: boolean;
    liveReady: boolean;
  };
  flags: {
    enableOpportunitiesApi: boolean;
    enableOpportunitiesUi: boolean;
    enableBensonBranding: boolean;
    enableKcScanner: boolean;
    disableVideoPipeline: boolean;
  };
  safety: {
    liveSendBlocked: boolean;
    preAlphaReady: boolean;
  };
};

export async function computePreAlphaStatus(): Promise<PreAlphaStatusResponse> {
  const outreach = getOutreachSendConfig();
  let database: 'ok' | 'error' = 'ok';
  let databaseError: string | undefined;

  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    database = 'error';
    databaseError = err instanceof Error ? err.message : 'Database unreachable';
  }

  const liveSendBlocked = !outreach.liveEnabled || !outreach.liveReady;
  const preAlphaReady =
    database === 'ok' &&
    featureFlags.enableOpportunitiesApi &&
    featureFlags.enableOpportunitiesUi &&
    liveSendBlocked;

  return {
    ok: database === 'ok',
    generatedAt: new Date().toISOString(),
    version: '0.3.0-pre-alpha',
    demoMode: env.DEMO_MODE,
    database,
    databaseError,
    outreach: {
      mode: outreach.mode,
      liveEnabled: outreach.liveEnabled,
      liveReady: outreach.liveReady,
    },
    flags: {
      enableOpportunitiesApi: featureFlags.enableOpportunitiesApi,
      enableOpportunitiesUi: featureFlags.enableOpportunitiesUi,
      enableBensonBranding: featureFlags.enableBensonBranding,
      enableKcScanner: featureFlags.enableKcScanner,
      disableVideoPipeline: featureFlags.disableVideoPipeline,
    },
    safety: {
      liveSendBlocked,
      preAlphaReady,
    },
  };
}
