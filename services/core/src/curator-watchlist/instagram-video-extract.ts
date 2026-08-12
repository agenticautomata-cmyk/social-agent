import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import {
  extractAudioFromVideo,
  deleteExtractedAudio,
  ffmpegBin,
  hasFfmpeg,
  probeMediaDurationSeconds,
} from '../intake/ffmpeg-utils.js';
import { transcribeAudioFile } from '../intake/transcribe.js';
import { ocrCarouselSlide } from './slide-ocr.js';
import type { InstagramImageFetcher } from './slide-ocr.js';
import type {
  CapturedCarouselItem,
  CarouselItemOcr,
  FrameOcrEvidence,
  TranscriptSegmentEvidence,
} from './instagram-intake-types.js';
import { downloadInstagramVideoWithSession } from './instagram-media-capture.js';

const DEFAULT_MAX_VIDEO_SEC = Number(process.env.INSTAGRAM_VIDEO_MAX_DURATION_SEC ?? 120);
const DEFAULT_MAX_FRAMES = Number(process.env.INSTAGRAM_VIDEO_MAX_SAMPLE_FRAMES ?? 8);

function cacheRoot(): string {
  return (
    process.env.INSTAGRAM_INTAKE_CACHE_DIR?.trim() ||
    resolve(process.cwd(), '../../.cache/instagram-intake')
  );
}

function frameHash(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

async function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(ffmpegBin(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (b) => (stderr += b.toString()));
    p.on('error', rej);
    p.on('close', (code) => {
      if (code === 0) res();
      else rej(new Error(`ffmpeg exit ${code}: ${stderr.slice(-400)}`));
    });
  });
}

async function sampleVideoFrames(
  videoPath: string,
  outDir: string,
  maxFrames: number,
  durationSeconds: number | null,
): Promise<Array<{ path: string; timestampSeconds: number; hash: string }>> {
  await mkdir(outDir, { recursive: true });
  const duration = durationSeconds ?? (await probeMediaDurationSeconds(videoPath)) ?? 30;
  const cappedDuration = Math.min(duration, DEFAULT_MAX_VIDEO_SEC);
  const interval = cappedDuration / Math.max(maxFrames, 1);
  const seen = new Set<string>();
  const frames: Array<{ path: string; timestampSeconds: number; hash: string }> = [];

  for (let i = 0; i < maxFrames; i++) {
    const ts = Math.min(cappedDuration - 0.1, i * interval);
    const outPath = join(outDir, `frame-${i + 1}.jpg`);
    try {
      await runFfmpeg([
        '-y',
        '-ss',
        String(Math.max(0, ts)),
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-q:v',
        '3',
        '-vf',
        'scale=720:-1',
        outPath,
      ]);
      const buf = await readFile(outPath);
      const hash = frameHash(buf);
      if (seen.has(hash)) {
        await unlink(outPath).catch(() => undefined);
        continue;
      }
      seen.add(hash);
      frames.push({ path: outPath, timestampSeconds: ts, hash });
    } catch {
      // skip bad frame
    }
  }
  return frames;
}

export type VideoItemProcessingResult = {
  itemIndex: number;
  videoPath: string | null;
  audioPath: string | null;
  transcriptText: string;
  transcriptCharCount: number;
  transcriptSegments: TranscriptSegmentEvidence[];
  frameOcr: FrameOcrEvidence[];
  ocrResults: CarouselItemOcr[];
  errors: string[];
};

export async function processInstagramVideoItem(input: {
  page: import('playwright').Page;
  item: CapturedCarouselItem;
  shortcode: string;
  captionContext?: string | null;
  fetchImage?: InstagramImageFetcher;
}): Promise<VideoItemProcessingResult> {
  const errors: string[] = [];
  const ocrResults: CarouselItemOcr[] = [];
  const frameOcr: FrameOcrEvidence[] = [];
  let transcriptText = '';
  let transcriptSegments: TranscriptSegmentEvidence[] = [];
  let videoPath: string | null = null;
  let audioPath: string | null = null;

  if (!input.item.videoUrl) {
    errors.push('video_url_missing');
    return {
      itemIndex: input.item.index,
      videoPath: null,
      audioPath: null,
      transcriptText: '',
      transcriptCharCount: 0,
      transcriptSegments: [],
      frameOcr: [],
      ocrResults: [],
      errors,
    };
  }

  const cachedVideo = join(cacheRoot(), input.shortcode, 'video', `item-${input.item.index + 1}.mp4`);
  const download = await downloadInstagramVideoWithSession(
    input.page,
    input.item.videoUrl,
    input.shortcode,
    input.item.index,
  );
  videoPath = download.path ?? cachedVideo;
  if (download.error) errors.push(download.error);

  if (!(await hasFfmpeg())) {
    errors.push('ffmpeg_not_available');
  } else if (videoPath) {
    const duration = await probeMediaDurationSeconds(videoPath);
    if (duration != null && duration > DEFAULT_MAX_VIDEO_SEC) {
      errors.push(`video_duration_exceeds_${DEFAULT_MAX_VIDEO_SEC}s`);
    } else {
      try {
        const audio = await extractAudioFromVideo(videoPath);
        audioPath = audio.audioPath;
        const transcript = await transcribeAudioFile(audioPath, `${input.shortcode}-item-${input.item.index}.mp3`);
        transcriptText = transcript.text;
        transcriptSegments = transcript.segments.map((s) => ({
          startSeconds: s.start,
          endSeconds: s.end,
          text: s.text,
        }));
        if (!transcriptText.trim()) errors.push('transcription_empty');
        await deleteExtractedAudio(audioPath);
        audioPath = null;
      } catch (err) {
        errors.push(err instanceof Error ? err.message.slice(0, 120) : 'transcription_failed');
      }

      try {
        const frames = await sampleVideoFrames(
          videoPath,
          join(cacheRoot(), input.shortcode, 'frames', `item-${input.item.index + 1}`),
          DEFAULT_MAX_FRAMES,
          duration,
        );
        for (const frame of frames) {
          const dataUrl = `data:image/jpeg;base64,${(await readFile(frame.path)).toString('base64')}`;
          const ocr = await ocrCarouselSlide({
            slideNumber: input.item.index + 1,
            imageUrl: dataUrl,
            captionContext: input.captionContext,
          });
          ocrResults.push({
            itemIndex: input.item.index,
            kind: 'video',
            charCount: ocr.text.length,
            text: ocr.text,
            ok: ocr.ok,
            error: ocr.error ?? null,
            engine: ocr.engine,
            source: 'sampled_frame',
            timestampSeconds: frame.timestampSeconds,
          });
          if (ocr.ok && ocr.text.trim()) {
            frameOcr.push({
              itemIndex: input.item.index,
              timestampSeconds: frame.timestampSeconds,
              charCount: ocr.text.length,
              text: ocr.text.trim(),
              frameHash: frame.hash,
            });
          }
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message.slice(0, 120) : 'frame_sampling_failed');
      }
    }
  }

  if (input.item.screenshotPath) {
    try {
      const dataUrl = `data:image/jpeg;base64,${(await readFile(input.item.screenshotPath)).toString('base64')}`;
      const posterOcr = await ocrCarouselSlide({
        slideNumber: input.item.index + 1,
        imageUrl: dataUrl,
        captionContext: input.captionContext,
        fetchImage: input.fetchImage,
      });
      ocrResults.push({
        itemIndex: input.item.index,
        kind: 'video',
        charCount: posterOcr.text.length,
        text: posterOcr.text,
        ok: posterOcr.ok,
        error: posterOcr.error ?? null,
        engine: posterOcr.engine,
        source: 'screenshot',
        timestampSeconds: 0,
      });
    } catch {
      errors.push('poster_ocr_failed');
    }
  }

  return {
    itemIndex: input.item.index,
    videoPath,
    audioPath,
    transcriptText,
    transcriptCharCount: transcriptText.length,
    transcriptSegments,
    frameOcr,
    ocrResults,
    errors,
  };
}

export async function ocrInstagramImageItem(input: {
  item: CapturedCarouselItem;
  captionContext?: string | null;
  fetchImage?: InstagramImageFetcher;
}): Promise<CarouselItemOcr> {
  if (input.item.screenshotPath) {
    const dataUrl = `data:image/jpeg;base64,${(await readFile(input.item.screenshotPath)).toString('base64')}`;
    const ocr = await ocrCarouselSlide({
      slideNumber: input.item.index + 1,
      imageUrl: dataUrl,
      captionContext: input.captionContext,
    });
    return {
      itemIndex: input.item.index,
      kind: 'image',
      charCount: ocr.text.length,
      text: ocr.text,
      ok: ocr.ok,
      error: ocr.error ?? null,
      engine: ocr.engine,
      source: 'screenshot',
      timestampSeconds: null,
    };
  }

  if (!input.item.imageUrl) {
    return {
      itemIndex: input.item.index,
      kind: 'image',
      charCount: 0,
      text: '',
      ok: false,
      error: 'image_url_missing',
      engine: 'none',
      source: 'cdn_image',
      timestampSeconds: null,
    };
  }

  const ocr = await ocrCarouselSlide({
    slideNumber: input.item.index + 1,
    imageUrl: input.item.imageUrl,
    captionContext: input.captionContext,
    fetchImage: input.fetchImage,
  });
  return {
    itemIndex: input.item.index,
    kind: 'image',
    charCount: ocr.text.length,
    text: ocr.text,
    ok: ocr.ok,
    error: ocr.error ?? null,
    engine: ocr.engine,
    source: 'cdn_image',
    timestampSeconds: null,
  };
}
