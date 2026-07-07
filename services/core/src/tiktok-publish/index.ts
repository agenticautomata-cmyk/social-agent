import { featureFlags } from '../feature-flags.js';

export type TikTokPublishResult =
  | { ok: true; mode: 'inbox' | 'direct'; postId?: string }
  | { ok: false; reason: string };

/**
 * Native TikTok publish is intentionally deferred (see Benson Efficiency Roadmap).
 * Post Assist (captions, reminders, mark posted) ships first; inbox API + publish
 * OAuth + HITL gate come after ENABLE_TIKTOK_PUBLISH=true.
 */
export async function scheduleTikTokPublish(_input: {
  contentItemId: string;
  videoUrl: string;
  caption: string;
  scheduledAt?: Date;
}): Promise<TikTokPublishResult> {
  if (!featureFlags.enableTiktokPublish) {
    return {
      ok: false,
      reason:
        'TikTok native publish is disabled. Use Post Assist to draft captions and mark posts manually.',
    };
  }

  return {
    ok: false,
    reason: 'TikTok publish flag is on but inbox/direct post wiring is not implemented yet.',
  };
}

export function isTikTokPublishEnabled(): boolean {
  return featureFlags.enableTiktokPublish;
}
