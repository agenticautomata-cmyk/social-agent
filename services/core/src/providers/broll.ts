// B-roll sourcing — Pexels Videos API.
// Selects 1-3 short vertical clips matching keyword(s) and returns playable URLs
// the post-production stage can splice between hook/script/CTA segments.
//
// Free Pexels API: 200 req/h, no commercial restrictions. Set PEXELS_API_KEY in .env.

import { env } from '../env.js';

export interface BrollInput {
  keywords: string[];          // e.g. ["dental practice","patient smile","clean office"]
  perKeyword?: number;         // default 1
  minDurationSec?: number;     // default 3
  maxDurationSec?: number;     // default 8
  preferVertical?: boolean;    // default true
}

export interface BrollClip {
  url: string;            // direct mp4 URL
  thumbnailUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  attribution: string;    // photographer name + Pexels link
  keyword: string;
}

export interface BrollProvider {
  readonly mode: 'real' | 'mock';
  search(input: BrollInput): Promise<BrollClip[]>;
}

// ============================================================================
// MOCK — picsum-style deterministic placeholders pointing to public sample MP4s
// ============================================================================

const MOCK_VIDEOS = [
  { url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', dur: 15 },
  { url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', dur: 15 },
  { url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', dur: 60 },
  { url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', dur: 15 },
  { url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', dur: 15 },
];

export class MockBroll implements BrollProvider {
  readonly mode = 'mock' as const;

  async search(input: BrollInput): Promise<BrollClip[]> {
    await new Promise((r) => setTimeout(r, 100));
    const out: BrollClip[] = [];
    for (let i = 0; i < input.keywords.length; i++) {
      const kw = input.keywords[i]!;
      const sample = MOCK_VIDEOS[i % MOCK_VIDEOS.length]!;
      out.push({
        url: sample.url,
        thumbnailUrl: `https://picsum.photos/seed/broll-${encodeURIComponent(kw)}/720/1280`,
        durationSeconds: Math.min(sample.dur, input.maxDurationSec ?? 8),
        width: 1920,
        height: 1080,
        attribution: 'mock — Pexels demo',
        keyword: kw,
      });
    }
    return out;
  }
}

// ============================================================================
// REAL — Pexels Videos API
// ============================================================================

interface PexelsVideoFile {
  link: string;
  width: number;
  height: number;
  fps?: number;
  file_type?: string;
}

interface PexelsVideo {
  id: number;
  duration: number;
  width: number;
  height: number;
  user: { name: string };
  video_files: PexelsVideoFile[];
  image: string;
  url: string;
}

interface PexelsSearchResponse {
  videos: PexelsVideo[];
  total_results?: number;
}

export class PexelsBroll implements BrollProvider {
  readonly mode = 'real' as const;
  constructor(private apiKey: string) {}

  async search(input: BrollInput): Promise<BrollClip[]> {
    const out: BrollClip[] = [];
    const perKeyword = input.perKeyword ?? 1;
    const minD = input.minDurationSec ?? 3;
    const maxD = input.maxDurationSec ?? 8;

    for (const kw of input.keywords) {
      const url = new URL('https://api.pexels.com/videos/search');
      url.searchParams.set('query', kw);
      url.searchParams.set('per_page', '15');
      url.searchParams.set('orientation', input.preferVertical ?? true ? 'portrait' : 'landscape');

      const res = await fetch(url, {
        headers: { Authorization: this.apiKey },
      });
      if (!res.ok) {
        console.warn(`[pexels] search "${kw}" failed: ${res.status}`);
        continue;
      }
      const data = (await res.json()) as PexelsSearchResponse;

      // Filter by duration, pick the best (highest-resolution mp4 file under our limits)
      const candidates = data.videos
        .filter((v) => v.duration >= minD && v.duration <= maxD)
        .slice(0, perKeyword);

      for (const v of candidates) {
        const best = v.video_files
          .filter((f) => (f.file_type ?? 'video/mp4').includes('mp4') && f.width <= 1920)
          .sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (!best) continue;

        out.push({
          url: best.link,
          thumbnailUrl: v.image,
          durationSeconds: v.duration,
          width: best.width,
          height: best.height,
          attribution: `${v.user.name} via Pexels (${v.url})`,
          keyword: kw,
        });
      }
    }
    return out;
  }
}

// ============================================================================
// SELECTOR
// ============================================================================

export function createBrollProvider(): BrollProvider {
  const key = process.env.PEXELS_API_KEY;
  if (env.DEMO_MODE || !key) return new MockBroll();
  return new PexelsBroll(key);
}
