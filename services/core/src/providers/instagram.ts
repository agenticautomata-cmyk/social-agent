import type { PublishInput, PublishProvider, PublishResult } from './types.js';
import { env } from '../env.js';

// ============================================================================
// MOCK
// ============================================================================

export class MockInstagram implements PublishProvider {
  readonly mode = 'mock' as const;
  readonly platform = 'instagram' as const;

  async publish(_input: PublishInput): Promise<PublishResult> {
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 600));
    if (Math.random() < 0.03) throw new Error('mock IG failure: rate limited');
    const id = Math.floor(Math.random() * 1e17).toString();
    return {
      remotePostId: id,
      remotePostUrl: `https://instagram.com/reel/MOCK_${id.slice(-8)}`,
    };
  }
}

// ============================================================================
// REAL — Instagram Graph API (Reels publishing)
// ============================================================================

export class InstagramProvider implements PublishProvider {
  readonly mode = 'real' as const;
  readonly platform = 'instagram' as const;
  constructor(
    private accessToken: string,
    private igUserId: string
  ) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    const fullCaption = `${input.caption}\n\n${input.hashtags.map((t) => `#${t}`).join(' ')}`;

    // Step 1 — create media container
    const containerRes = await fetch(
      `https://graph.facebook.com/v21.0/${this.igUserId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          media_type: 'REELS',
          video_url: input.videoUrl,
          caption: fullCaption,
          share_to_feed: 'true',
          access_token: this.accessToken,
        }),
      }
    );

    if (!containerRes.ok) {
      throw new Error(`IG container creation failed: ${await containerRes.text()}`);
    }
    const containerData = (await containerRes.json()) as { id?: string };
    const containerId = containerData.id;
    if (!containerId) throw new Error('IG returned no container id');

    // Step 2 — poll until container ready (typically 5-30s for video)
    const start = Date.now();
    while (Date.now() - start < 5 * 60 * 1000) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes = await fetch(
        `https://graph.facebook.com/v21.0/${containerId}?fields=status_code&access_token=${this.accessToken}`
      );
      const statusData = (await statusRes.json()) as { status_code?: string };
      if (statusData.status_code === 'FINISHED') break;
      if (statusData.status_code === 'ERROR') {
        throw new Error('IG container processing failed');
      }
    }

    // Step 3 — publish
    const publishRes = await fetch(
      `https://graph.facebook.com/v21.0/${this.igUserId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          creation_id: containerId,
          access_token: this.accessToken,
        }),
      }
    );

    if (!publishRes.ok) {
      throw new Error(`IG publish failed: ${await publishRes.text()}`);
    }
    const publishData = (await publishRes.json()) as { id?: string };
    const mediaId = publishData.id;
    if (!mediaId) throw new Error('IG returned no media id');

    return {
      remotePostId: mediaId,
      remotePostUrl: `https://www.instagram.com/p/${mediaId}/`,
    };
  }
}

// ============================================================================
// SELECTOR
// ============================================================================

export function createInstagramProvider(): PublishProvider {
  if (env.DEMO_MODE || !env.IG_PAGE_ACCESS_TOKEN || !env.IG_BUSINESS_ACCOUNT_ID) {
    return new MockInstagram();
  }
  return new InstagramProvider(env.IG_PAGE_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);
}
