// Post-Production — generates per-platform captions, sets final_video_url.
//
// In a real build this stage would:
//   1. download the raw HeyGen MP4
//   2. run Whisper / aeneas to generate per-word subtitle SRT
//   3. burn captions + CTA overlay via ffmpeg
//   4. transcode to TikTok-safe specs (H.264, AAC, ≤60fps)
//   5. upload to S3, store public URL
//
// For the portfolio demo we skip ffmpeg (would require a binary in the runtime
// + S3 bucket) and treat the raw HeyGen URL as the final video. The captions
// generation is real — that's pure LLM, runs in mock or real mode cleanly.

import { eq, sql } from 'drizzle-orm';
import {
  db,
  industries,
  contentItems,
  campaigns,
  assets,
  providers,
  postProduction,
} from '@social-agent/core';
import { createWorker } from '../runtime.js';

const llm = providers.createLlmProvider();

export const postProductionWorker = createWorker({
  name: 'post-production',
  inputState: 'video_ready',
  process: async (item) => {
    const [campaign, industry] = await Promise.all([
      db.query.campaigns.findFirst({ where: eq(campaigns.id, item.campaignId) }),
      item.industryId
        ? db.query.industries.findFirst({ where: eq(industries.id, item.industryId) })
        : Promise.resolve(null),
    ]);

    if (!item.script || !item.hook) throw new Error('missing script/hook');

    const captions = await llm.generateCaptions({
      script: item.script,
      hook: item.hook,
      industry: industry?.name ?? 'small business',
      type: item.type,
      language: item.language,
      brandCta: campaign?.brandDefaultCta ?? null,
    });

    if (!item.heygenVideoUrl) throw new Error('missing heygen_video_url');

    // Hand off to ffmpeg pipeline (or passthrough in demo mode).
    const result = await postProduction.processPostProduction({
      contentItemId: item.id,
      videoUrl: item.heygenVideoUrl,
      script: item.script,
      cta: item.cta ?? campaign?.brandDefaultCta ?? '',
      hookText: item.hook,
      brandColor: campaign?.brandPrimaryColor ?? '#0ea5e9',
      durationSeconds: item.durationSeconds ?? undefined,
    });

    await db
      .update(contentItems)
      .set({
        finalVideoUrl: result.finalVideoUrl,
        durationSeconds: Math.round(result.durationSeconds),
        captionInstagram: captions.instagram.caption,
        captionTiktok: captions.tiktok.caption,
        hashtagsInstagram: captions.instagram.hashtags,
        hashtagsTiktok: captions.tiktok.hashtags,
        metadata: sql`${contentItems.metadata} || ${JSON.stringify({ postProductionAt: new Date().toISOString(), postProductionMode: result.mode })}::jsonb`,
      })
      .where(eq(contentItems.id, item.id));

    await db.insert(assets).values([
      {
        contentItemId: item.id,
        kind: 'final_video',
        url: result.finalVideoUrl,
        storagePath: result.finalVideoPath,
        mimeType: 'video/mp4',
        durationSeconds: Math.round(result.durationSeconds),
        sizeBytes: result.sizeBytes || null,
        width: result.width,
        height: result.height,
        metadata: { mode: result.mode },
      },
      {
        contentItemId: item.id,
        kind: 'subtitle_srt',
        url: `file://${result.srtPath}`,
        storagePath: result.srtPath,
        mimeType: 'application/x-subrip',
      },
    ]);

    return { nextState: 'ready_to_publish', payload: { mode: result.mode, captionsMode: llm.mode } };
  },
});
