import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorPlatformConnections } from '../schema.js';
import { env } from '../env.js';
import { featureFlags } from '../feature-flags.js';
import { resolveOperatorCreatorId } from './resolve-creator.js';
import type { TikTokCapabilities } from './types.js';

export async function getTikTokCapabilities(creatorId?: string): Promise<TikTokCapabilities> {
  const cid = await resolveOperatorCreatorId(creatorId);
  const [conn] = await db
    .select()
    .from(creatorPlatformConnections)
    .where(
      and(
        eq(creatorPlatformConnections.creatorAccountId, cid),
        eq(creatorPlatformConnections.platform, 'tiktok'),
      ),
    )
    .limit(1);

  const analyticsConnected = conn?.status === 'connected';
  const scopes = conn?.scopes ?? [];
  const hasVideoList = scopes.some((s) => s.includes('video.list'));
  const hasPublish =
    scopes.some((s) => s.includes('video.publish') || s.includes('video.upload')) ||
    Boolean(env.TIKTOK_ACCESS_TOKEN);

  const enableTikTokPublish = featureFlags.enableTiktokPublish;
  const permissionsMissing: string[] = [];
  if (!analyticsConnected) permissionsMissing.push('Connect TikTok for analytics');
  if (!hasVideoList) permissionsMissing.push('video.list');
  if (enableTikTokPublish && !hasPublish) permissionsMissing.push('video.publish / video.upload');

  return {
    analyticsConnected,
    publishOAuthConnected: hasPublish,
    inboxUploadReady: enableTikTokPublish && hasPublish,
    directPostReady: false,
    draftUploadReady: false,
    reauthorizeNeeded: conn?.status === 'expired' || conn?.status === 'error',
    permissionsMissing,
    featureFlags: {
      enableTikTokPublish,
    },
  };
}
