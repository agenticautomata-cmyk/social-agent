import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

let ffmpegChecked = false;
let ffmpegAvailable = false;

function bundledFfmpegPath(): string | null {
  try {
    const path = require('ffmpeg-static') as string | null;
    return path && typeof path === 'string' ? path : null;
  } catch {
    return null;
  }
}

function bundledFfprobePath(): string | null {
  try {
    const mod = require('ffprobe-static') as { path?: string } | string;
    if (typeof mod === 'string') return mod;
    return mod?.path ?? null;
  } catch {
    return null;
  }
}

/** Resolved ffmpeg binary — env override, bundled static, then PATH. */
export function ffmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || bundledFfmpegPath() || 'ffmpeg';
}

/** Resolved ffprobe binary — env override, bundled static, then PATH. */
export function ffprobeBin(): string {
  return process.env.FFPROBE_PATH?.trim() || bundledFfprobePath() || 'ffprobe';
}

export async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegChecked) return ffmpegAvailable;
  ffmpegChecked = true;
  ffmpegAvailable = await new Promise<boolean>((res) => {
    const p = spawn(ffmpegBin(), ['-version']);
    p.on('error', () => res(false));
    p.on('close', (code) => res(code === 0));
  });
  return ffmpegAvailable;
}

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (b) => (stdout += b.toString()));
    p.stderr.on('data', (b) => (stderr += b.toString()));
    p.on('error', rej);
    p.on('close', (code) => {
      if (code === 0) res({ stdout, stderr });
      else rej(new Error(`${cmd} exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

export async function probeMediaDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await run(ffprobeBin(), [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const value = Number.parseFloat(stdout.trim());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export async function extractAudioFromVideo(
  videoPath: string,
): Promise<{ audioPath: string; durationSeconds: number | null }> {
  if (!(await hasFfmpeg())) {
    throw new Error('ffmpeg_not_available');
  }

  const outDir = dirname(videoPath);
  await mkdir(outDir, { recursive: true });
  const audioPath = join(outDir, `${Date.now()}-audio.mp3`);

  await run(ffmpegBin(), [
    '-y',
    '-i',
    videoPath,
    '-vn',
    '-acodec',
    'libmp3lame',
    '-q:a',
    '4',
    '-ar',
    '16000',
    '-ac',
    '1',
    audioPath,
  ]);

  const durationSeconds = await probeMediaDurationSeconds(videoPath);
  return { audioPath, durationSeconds };
}

export async function deleteExtractedAudio(audioPath: string | null | undefined): Promise<void> {
  if (!audioPath?.trim()) return;
  try {
    await unlink(audioPath);
  } catch {
    /* ignore */
  }
}
