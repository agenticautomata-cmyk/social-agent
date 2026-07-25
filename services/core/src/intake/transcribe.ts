import { createReadStream } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import OpenAI, { toFile } from 'openai';
import { env } from '../env.js';

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type TranscriptionResult = {
  text: string;
  segments: TranscriptSegment[];
  language: string | null;
};

function stubTranscription(filename: string): TranscriptionResult {
  return {
    text: `[Demo mode] Benson would transcribe audio from ${filename}. Connect OPENAI_API_KEY and set DEMO_MODE=false for real transcription.`,
    segments: [
      {
        start: 0,
        end: 5,
        text: 'Demo transcription — share a real clip in production mode.',
      },
    ],
    language: 'en',
  };
}

export async function transcribeAudioFile(
  audioPath: string,
  originalFilename?: string | null,
): Promise<TranscriptionResult> {
  if (env.DEMO_MODE || !env.OPENAI_API_KEY?.trim()) {
    return stubTranscription(originalFilename ?? audioPath);
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: env.INTAKE_WHISPER_MODEL,
    response_format: 'verbose_json',
  });

  const verbose = response as OpenAI.Audio.Transcriptions.Transcription & {
    segments?: Array<{ start?: number; end?: number; text?: string }>;
    language?: string;
  };

  const segments: TranscriptSegment[] = (verbose.segments ?? []).map((seg) => ({
    start: seg.start ?? 0,
    end: seg.end ?? 0,
    text: (seg.text ?? '').trim(),
  }));

  return {
    text: (verbose.text ?? '').trim(),
    segments,
    language: verbose.language ?? null,
  };
}

export async function transcribeAudioBlob(
  data: Buffer,
  options?: { filename?: string; mimeType?: string },
): Promise<TranscriptionResult> {
  const filename = options?.filename ?? 'voice-note.webm';
  const mimeType = options?.mimeType ?? 'audio/webm';

  if (env.DEMO_MODE || !env.OPENAI_API_KEY?.trim()) {
    return stubTranscription(filename);
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const file = await toFile(data, filename, { type: mimeType });
  const response = await client.audio.transcriptions.create({
    file,
    model: env.INTAKE_WHISPER_MODEL,
    response_format: 'verbose_json',
  });

  const verbose = response as OpenAI.Audio.Transcriptions.Transcription & {
    segments?: Array<{ start?: number; end?: number; text?: string }>;
    language?: string;
  };

  const segments: TranscriptSegment[] = (verbose.segments ?? []).map((seg) => ({
    start: seg.start ?? 0,
    end: seg.end ?? 0,
    text: (seg.text ?? '').trim(),
  }));

  return {
    text: (verbose.text ?? '').trim(),
    segments,
    language: verbose.language ?? null,
  };
}

/** Write buffer to a temp file when the OpenAI SDK needs a stream path. */
export async function transcribeAudioBuffer(
  data: Buffer,
  originalFilename?: string | null,
): Promise<TranscriptionResult> {
  const ext = originalFilename?.includes('.') ? originalFilename.split('.').pop() : 'webm';
  const tempPath = join(tmpdir(), `benson-voice-${randomUUID()}.${ext ?? 'webm'}`);
  await writeFile(tempPath, data);
  try {
    return await transcribeAudioFile(tempPath, originalFilename);
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}
