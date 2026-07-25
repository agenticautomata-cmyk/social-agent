import { mkdir, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { hasFfmpeg, probeMediaDurationSeconds, ffmpegBin } from '../intake/ffmpeg-utils.js';

const DEFAULT_INTERVAL_SEC = Number(process.env.DRAFT_FRAME_INTERVAL_SEC ?? 15);

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    import('node:child_process').then(({ spawn }) => {
      const p = spawn(ffmpegBin(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      p.stderr.on('data', (b) => (stderr += b.toString()));
      p.on('error', rej);
      p.on('close', (code) => {
        if (code === 0) res();
        else rej(new Error(`ffmpeg exit ${code}: ${stderr.slice(-400)}`));
      });
    });
  });
}

export function computeSampleTimestamps(durationSeconds: number): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return [0, 3];
  }
  const stamps = new Set<number>([0, 3, Math.max(0, durationSeconds * 0.5), Math.max(0, durationSeconds - 2)]);
  for (let t = 0; t < durationSeconds; t += DEFAULT_INTERVAL_SEC) {
    stamps.add(Math.round(t * 10) / 10);
  }
  return [...stamps].filter((t) => t >= 0 && t < durationSeconds).sort((a, b) => a - b).slice(0, 12);
}

export type SampledFrame = {
  timestamp_seconds: number;
  file_path: string;
  base64: string;
  mime_type: string;
};

export async function sampleVideoFrames(videoPath: string): Promise<{
  frames: SampledFrame[];
  durationSeconds: number | null;
}> {
  if (!(await hasFfmpeg())) {
    return { frames: [], durationSeconds: null };
  }

  const durationSeconds = await probeMediaDurationSeconds(videoPath);
  const timestamps = computeSampleTimestamps(durationSeconds ?? 30);
  const outDir = join(dirname(videoPath), `frames-${Date.now()}`);
  await mkdir(outDir, { recursive: true });

  const frames: SampledFrame[] = [];
  for (const ts of timestamps) {
    const outPath = join(outDir, `frame-${Math.round(ts * 1000)}.jpg`);
    try {
      await runFfmpeg([
        '-y',
        '-ss',
        String(ts),
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
      const buffer = await readFile(outPath);
      frames.push({
        timestamp_seconds: ts,
        file_path: outPath,
        base64: buffer.toString('base64'),
        mime_type: 'image/jpeg',
      });
    } catch {
      /* skip bad frame */
    }
  }

  return { frames, durationSeconds };
}

export async function deleteSampledFrames(frames: SampledFrame[]): Promise<void> {
  const dirs = new Set<string>();
  for (const frame of frames) {
    dirs.add(dirname(frame.file_path));
    try {
      await unlink(frame.file_path);
    } catch {
      /* ignore */
    }
  }
  for (const dir of dirs) {
    try {
      const { rmdir } = await import('node:fs/promises');
      await rmdir(dir);
    } catch {
      /* ignore */
    }
  }
}
