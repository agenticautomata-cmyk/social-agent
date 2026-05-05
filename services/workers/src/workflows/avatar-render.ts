// Avatar Render — two workers actually:
//   1. avatar-render-start: claims `assets_ready` items, calls HeyGen startRender,
//      stores video_id, transitions to `video_generating`.
//   2. avatar-render-poll: cron-style; polls all `video_generating` items,
//      transitions to `video_ready` (or back to fail) on completion.

import { eq, sql } from 'drizzle-orm';
import {
  db,
  campaigns,
  personas,
  contentItems,
  assets,
  providers,
} from '@social-agent/core';
import { createWorker, createCronWorker } from '../runtime.js';

const heygen = providers.createAvatarProvider();

const PERSONA_TYPES = new Set([
  'testimonial',
  'case_study',
  'success_story',
  'transformation',
]);

export const avatarStartWorker = createWorker({
  name: 'avatar-render-start',
  inputState: 'assets_ready',
  process: async (item) => {
    if (!item.script) throw new Error('missing script');

    let avatarId: string | null;
    let voiceId: string | null;

    if (PERSONA_TYPES.has(item.type)) {
      if (!item.personaId) throw new Error('persona-typed item missing persona_id');
      const persona = await db.query.personas.findFirst({
        where: eq(personas.id, item.personaId),
      });
      if (!persona) throw new Error('persona not found');
      avatarId = persona.heygenAvatarId;
      voiceId = persona.heygenVoiceId;
    } else {
      const campaign = await db.query.campaigns.findFirst({
        where: eq(campaigns.id, item.campaignId),
      });
      if (!campaign) throw new Error('campaign not found');
      avatarId = campaign.founderHeygenAvatarId;
      voiceId = campaign.founderHeygenVoiceId;
    }

    if (!avatarId || !voiceId) throw new Error('missing avatar or voice id');

    const job = await heygen.startRender({
      avatarId,
      voiceId,
      script: item.script,
      width: 720,
      height: 1280,
    });

    await db
      .update(contentItems)
      .set({
        heygenVideoId: job.videoId,
        metadata: sql`${contentItems.metadata} || ${JSON.stringify({ heygenStartedAt: new Date().toISOString(), heygenMode: heygen.mode })}::jsonb`,
      })
      .where(eq(contentItems.id, item.id));

    return { nextState: 'video_generating', payload: { videoId: job.videoId } };
  },
});

// Polling cron: scans all `video_generating` items, asks HeyGen for status.
export const avatarPollWorker = createCronWorker({
  name: 'avatar-render-poll',
  intervalMs: 5_000,
  run: async () => {
    const generating = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.state, 'video_generating'))
      .limit(20);

    for (const item of generating) {
      if (!item.heygenVideoId) continue;
      try {
        const status = await heygen.pollRender(item.heygenVideoId);
        if (status.status === 'completed') {
          await db
            .update(contentItems)
            .set({
              state: 'video_ready',
              heygenVideoUrl: status.videoUrl,
              durationSeconds: status.durationSeconds,
            })
            .where(eq(contentItems.id, item.id));

          await db.insert(assets).values({
            contentItemId: item.id,
            kind: 'heygen_video_raw',
            url: status.videoUrl,
            mimeType: 'video/mp4',
            durationSeconds: status.durationSeconds,
            width: 720,
            height: 1280,
          });

          console.log(`[avatar-poll] ${item.id} → video_ready`);
        } else if (status.status === 'failed') {
          await db
            .update(contentItems)
            .set({
              state: 'failed',
              lastError: `heygen failed: ${status.error}`,
            })
            .where(eq(contentItems.id, item.id));
          console.warn(`[avatar-poll] ${item.id} failed: ${status.error}`);
        }
        // status.status === 'processing' — leave for next tick
      } catch (err) {
        console.error(`[avatar-poll] ${item.id} poll error:`, err);
      }
    }
  },
});
