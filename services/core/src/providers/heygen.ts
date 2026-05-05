import type {
  AvatarProvider,
  AvatarRenderInput,
  AvatarRenderJob,
  AvatarRenderStatus,
} from './types.js';
import { env } from '../env.js';

// ============================================================================
// MOCK
// ============================================================================
// Mock simulates HeyGen by issuing a video_id and resolving to "completed"
// after ~6 seconds with a publicly accessible sample MP4.

const MOCK_DEMO_VIDEOS = [
  // Big Buck Bunny short clips — public domain, hot-linkable for demo
  'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
];

interface MockJob {
  startedAt: number;
  url: string;
}

export class MockAvatar implements AvatarProvider {
  readonly mode = 'mock' as const;
  private jobs = new Map<string, MockJob>();

  async startRender(_input: AvatarRenderInput): Promise<AvatarRenderJob> {
    await new Promise((r) => setTimeout(r, 100));
    const videoId = `mock_vid_${Math.random().toString(36).slice(2, 12)}`;
    const url = MOCK_DEMO_VIDEOS[Math.floor(Math.random() * MOCK_DEMO_VIDEOS.length)]!;
    this.jobs.set(videoId, { startedAt: Date.now(), url });
    return { videoId };
  }

  async pollRender(videoId: string): Promise<AvatarRenderStatus> {
    await new Promise((r) => setTimeout(r, 50));
    const job = this.jobs.get(videoId);
    if (!job) return { status: 'failed', error: 'unknown video_id' };

    const elapsed = Date.now() - job.startedAt;
    if (elapsed < 6000) {
      return { status: 'processing', progress: Math.min(95, Math.floor((elapsed / 6000) * 100)) };
    }
    return {
      status: 'completed',
      videoUrl: job.url,
      durationSeconds: 30,
    };
  }
}

// ============================================================================
// REAL — HeyGen v2 API
// ============================================================================

export class HeyGenProvider implements AvatarProvider {
  readonly mode = 'real' as const;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async startRender(input: AvatarRenderInput): Promise<AvatarRenderJob> {
    const res = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_inputs: [
          {
            character: {
              type: 'avatar',
              avatar_id: input.avatarId,
              avatar_style: 'normal',
            },
            voice: {
              type: 'text',
              input_text: input.script,
              voice_id: input.voiceId,
              speed: 1.0,
            },
            background: input.background ?? { type: 'color', value: '#ffffff' },
          },
        ],
        dimension: {
          width: input.width ?? 720,
          height: input.height ?? 1280,
        },
        aspect_ratio: '9:16',
      }),
    });

    if (!res.ok) throw new Error(`HeyGen generate failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { data?: { video_id?: string } };
    const videoId = data.data?.video_id;
    if (!videoId) throw new Error('HeyGen returned no video_id');
    return { videoId };
  }

  async pollRender(videoId: string): Promise<AvatarRenderStatus> {
    const res = await fetch(
      `https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
      {
        headers: { 'X-Api-Key': this.apiKey },
      }
    );

    if (!res.ok) {
      return { status: 'failed', error: `poll failed: ${res.status}` };
    }

    const data = (await res.json()) as {
      data?: {
        status?: string;
        video_url?: string;
        duration?: number;
        error?: { message?: string };
      };
    };

    const s = data.data?.status;
    if (s === 'completed' && data.data?.video_url) {
      return {
        status: 'completed',
        videoUrl: data.data.video_url,
        durationSeconds: data.data.duration ?? 30,
      };
    }
    if (s === 'failed') {
      return { status: 'failed', error: data.data?.error?.message ?? 'unknown' };
    }
    return { status: 'processing' };
  }
}

// ============================================================================
// SELECTOR
// ============================================================================

export function createAvatarProvider(): AvatarProvider {
  if (env.DEMO_MODE || !env.HEYGEN_API_KEY) return new MockAvatar();
  return new HeyGenProvider(env.HEYGEN_API_KEY);
}
