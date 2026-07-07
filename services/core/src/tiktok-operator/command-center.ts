import { env } from '../env.js';
import {
  computePerformanceSignals,
  loadAccountBaselines,
  toOperatorVideoRef,
} from './metrics.js';
import { refreshAutoRecommendations, listRecommendations } from './recommendations.js';
import { listPostPackages, listReadyPackages } from './packages.js';
import { refreshCommentInsights, listCommentInsights } from './comments.js';
import { listSponsorProofAssets } from './sponsor-proof.js';
import { listFormatTemplates } from './formats.js';
import { getOrGenerateBriefing } from './briefing.js';
import { getTikTokCapabilities } from './capabilities.js';
import { resolveOperatorCreatorId } from './resolve-creator.js';
import type { TikTokCommandCenter } from './types.js';

export async function computeTikTokCommandCenter(creatorId?: string): Promise<TikTokCommandCenter> {
  const cid = await resolveOperatorCreatorId(creatorId);
  const baselines = await loadAccountBaselines();
  const hasData = baselines.videos.length > 0;

  if (hasData) {
    await Promise.all([
      refreshAutoRecommendations(baselines, cid),
      refreshCommentInsights(cid),
    ]);
  }

  const signals = hasData ? await computePerformanceSignals(baselines) : null;

  const [
    capabilities,
    recommendations,
    postPackages,
    commentInsights,
    sponsorProofAssets,
    formatTemplates,
    readyToExecute,
    briefing,
  ] = await Promise.all([
    getTikTokCapabilities(cid),
    listRecommendations(cid),
    listPostPackages(cid),
    listCommentInsights(cid),
    listSponsorProofAssets(cid),
    listFormatTemplates(cid),
    listReadyPackages(cid),
    getOrGenerateBriefing(signals, cid),
  ]);

  const topRecentVideos = [...baselines.videos]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 6)
    .map(toOperatorVideoRef);

  const videoMap = new Map(topRecentVideos.map((v) => [v.id, v]));
  for (const v of baselines.videos) {
    videoMap.set(v.id, toOperatorVideoRef(v));
  }

  const enrichRec = (r: (typeof recommendations)[0]) => ({
    ...r,
    sourceVideo: r.creatorVideoId ? videoMap.get(r.creatorVideoId) ?? null : null,
  });

  const enrichInsight = (i: (typeof commentInsights)[0]) => ({
    ...i,
    sourceVideo: i.creatorVideoId ? videoMap.get(i.creatorVideoId) ?? null : null,
  });

  return {
    generatedAt: new Date().toISOString(),
    creatorId: cid,
    demoMode: env.DEMO_MODE,
    hasData,
    capabilities,
    signals,
    briefing,
    topRecentVideos,
    recommendations: recommendations.map(enrichRec),
    postPackages,
    commentInsights: commentInsights.map(enrichInsight),
    sponsorProofAssets,
    formatTemplates,
    readyToExecute,
    needsFollowUp: recommendations
      .filter((r) =>
        ['schedule_follow_up', 'reply_with_video', 'investigate_comment_trend', 'make_sequel'].includes(
          r.recommendationType,
        ),
      )
      .map(enrichRec)
      .slice(0, 8),
    sponsorProofCandidates: recommendations
      .filter((r) =>
        ['build_sponsor_proof', 'add_to_media_kit', 'create_outreach_angle'].includes(
          r.recommendationType,
        ),
      )
      .map(enrichRec)
      .slice(0, 8),
  };
}
