import type { PublishInput, PublishProvider, PublishResult } from './types.js';
import { env } from '../env.js';

// ============================================================================
// MOCK
// ============================================================================

export class MockTikTok implements PublishProvider {
  readonly mode = 'mock' as const;
  readonly platform = 'tiktok' as const;

  async publish(_input: PublishInput): Promise<PublishResult> {
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 800));
    if (Math.random() < 0.03) throw new Error('mock TikTok failure: token expired');
    const id = Math.floor(Math.random() * 1e18).toString();
    return {
      remotePostId: id,
      remotePostUrl: `https://www.tiktok.com/@user/video/MOCK_${id.slice(-10)}`,
    };
  }
}

// ============================================================================
// REAL — TikTok Content Posting API
// ============================================================================
// Uses the PULL_FROM_URL Direct Post flow. Requires audited app for production
// posting. Without audit, use the inbox endpoint instead (commented below).

export class TikTokProvider implements PublishProvider {
  readonly mode = 'real' as const;
  readonly platform = 'tiktok' as const;

  constructor(private accessToken: string) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    const fullCaption = `${input.caption} ${input.hashtags.map((t) => `#${t}`).join(' ')}`.slice(0, 2000);

    // Direct Post init
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: fullCaption,
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: input.videoUrl,
        },
      }),
    });

    if (!initRes.ok) {
      throw new Error(`TikTok init failed: ${await initRes.text()}`);
    }
    const initData = (await initRes.json()) as { data?: { publish_id?: string } };
    const publishId = initData.data?.publish_id;
    if (!publishId) throw new Error('TikTok returned no publish_id');

    // Poll status
    const start = Date.now();
    while (Date.now() - start < 5 * 60 * 1000) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes = await fetch(
        'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify({ publish_id: publishId }),
        }
      );
      const statusData = (await statusRes.json()) as {
        data?: { status?: string; publicaly_available_post_id?: string[] };
      };
      const s = statusData.data?.status;
      if (s === 'PUBLISH_COMPLETE') {
        const postId = statusData.data?.publicaly_available_post_id?.[0] ?? publishId;
        return {
          remotePostId: postId,
          remotePostUrl: null, // TikTok URL requires user handle which isn't returned here
        };
      }
      if (s === 'FAILED') throw new Error('TikTok publish failed');
    }

    throw new Error('TikTok publish timed out');
  }
}

// ============================================================================
// SELECTOR
// ============================================================================

export function createTikTokProvider(): PublishProvider {
  if (env.DEMO_MODE || !env.TIKTOK_ACCESS_TOKEN) {
    return new MockTikTok();
  }
  return new TikTokProvider(env.TIKTOK_ACCESS_TOKEN);
}
