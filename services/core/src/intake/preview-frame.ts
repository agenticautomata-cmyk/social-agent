import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasFfmpeg, ffmpegBin } from './ffmpeg-utils.js';

const here = dirname(fileURLToPath(import.meta.url));
const defaultPreviewRoot = resolve(here, '../../../../uploads/intake-previews');
const defaultImageRoot = resolve(here, '../../../../uploads/intake');

function previewRoot(): string {
  return process.env.INTAKE_PREVIEW_DIR ?? defaultPreviewRoot;
}

function imageUploadRoot(): string {
  return process.env.INTAKE_UPLOAD_DIR ?? defaultImageRoot;
}

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

export function isAllowedIntakePreviewPath(path: string | null | undefined): boolean {
  if (!path?.trim()) return false;
  const normalized = resolve(path);
  const roots = [resolve(previewRoot()), resolve(imageUploadRoot())];
  return roots.some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

export function intakePreviewPath(intakeId: string): string {
  return join(previewRoot(), `${intakeId}.jpg`);
}

export async function saveIntakePreviewFromVideo(
  videoPath: string,
  intakeId: string,
): Promise<string | null> {
  if (!(await hasFfmpeg())) return null;

  const root = previewRoot();
  await mkdir(root, { recursive: true });
  const outPath = intakePreviewPath(intakeId);

  try {
    await runFfmpeg([
      '-y',
      '-ss',
      '1',
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
    return outPath;
  } catch {
    try {
      await runFfmpeg([
        '-y',
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
      return outPath;
    } catch {
      return null;
    }
  }
}

export async function saveIntakePreviewFromFrameFile(
  framePath: string,
  intakeId: string,
): Promise<string | null> {
  const root = previewRoot();
  await mkdir(root, { recursive: true });
  const outPath = intakePreviewPath(intakeId);
  try {
    await copyFile(framePath, outPath);
    return outPath;
  } catch {
    return null;
  }
}

export async function readIntakePreview(path: string): Promise<{
  buffer: Buffer;
  mimeType: string;
} | null> {
  if (!isAllowedIntakePreviewPath(path)) return null;
  try {
    const buffer = await readFile(path);
    const lower = path.toLowerCase();
    const mimeType = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.webp')
        ? 'image/webp'
        : lower.endsWith('.gif')
          ? 'image/gif'
          : 'image/jpeg';
    return { buffer, mimeType };
  } catch {
    return null;
  }
}
