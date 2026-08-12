import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorker } from 'tesseract.js';

export type LocalOcrResult = {
  ok: boolean;
  text: string;
  confidence: number;
  engine: 'tesseract.js-local';
  error?: string;
};

let workerPromise: ReturnType<typeof createWorker> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, { logger: () => undefined });
  }
  return workerPromise;
}

export async function runLocalImageOcr(input: {
  buffer: Buffer;
  mimeType: string;
}): Promise<LocalOcrResult> {
  const dir = await mkdtemp(join(tmpdir(), 'newsletter-local-ocr-'));
  const ext = input.mimeType.includes('png') ? 'png' : 'jpg';
  const imagePath = join(dir, `input.${ext}`);
  try {
    await writeFile(imagePath, input.buffer);
    const worker = await getWorker();
    const result = await worker.recognize(imagePath);
    const text = result.data.text.replace(/\s+/g, ' ').trim();
    const confidence = result.data.confidence / 100;
    return {
      ok: text.length >= 8,
      text,
      confidence,
      engine: 'tesseract.js-local',
    };
  } catch (err) {
    return {
      ok: false,
      text: '',
      confidence: 0,
      engine: 'tesseract.js-local',
      error: err instanceof Error ? err.message : 'local_ocr_failed',
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function shutdownLocalOcrWorker(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
