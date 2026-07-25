import { env } from '../env.js';
import {
  DEFAULT_PROFILE_NAME,
  DEFAULT_VOICE_ENGINE,
  VOICE_GENERATION_TIMEOUT_MS,
  VOICE_POLL_INTERVAL_MS,
  sanitizeVoiceError,
} from './constants.js';
import type { VoiceboxGenerationResponse, VoiceboxGenerationStatus } from './types.js';

export class VoiceboxClient {
  constructor(private readonly baseUrl = env.VOICEBOX_BASE_URL) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VOICE_GENERATION_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Voicebox ${path} failed (${res.status}): ${body.slice(0, 200)}`);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async health(): Promise<{ ok?: boolean; status?: string }> {
    try {
      return await this.request('/health');
    } catch {
      return { ok: false, status: 'unavailable' };
    }
  }

  async listProfiles(): Promise<Array<{ id: string; name: string }>> {
    return this.request('/profiles');
  }

  async ensureProfile(profileName = DEFAULT_PROFILE_NAME): Promise<string> {
    const profiles = await this.listProfiles();
    const existing = profiles.find((p) => p.name === profileName);
    if (existing?.id) return existing.id;

    const created = await this.request<{ id: string }>('/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: profileName,
        voice_type: 'preset',
        preset_engine: DEFAULT_VOICE_ENGINE,
        preset_voice_id: env.BENSON_VOICE_PRESET_ID,
        language: 'en',
        description: 'Fictional Benson studio voice for Ask Benson',
      }),
    });
    return created.id;
  }

  async speak(
    text: string,
    profileName = DEFAULT_PROFILE_NAME,
    engine = DEFAULT_VOICE_ENGINE,
  ): Promise<VoiceboxGenerationResponse> {
    return this.request('/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        profile: profileName,
        engine,
        personality: false,
      }),
    });
  }

  private parseSseStatusPayload(raw: string): VoiceboxGenerationStatus | null {
    const dataLines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s*/, ''));
    const last = dataLines[dataLines.length - 1];
    if (!last) return null;
    try {
      return JSON.parse(last) as VoiceboxGenerationStatus;
    } catch {
      return null;
    }
  }

  async generationStatus(generationId: string): Promise<VoiceboxGenerationStatus> {
    const res = await fetch(`${this.baseUrl}/generate/${generationId}/status`, {
      headers: { Accept: 'text/event-stream' },
    });
    if (!res.ok) {
      throw new Error(`Voicebox status failed (${res.status})`);
    }
    const text = await res.text();
    const parsed = this.parseSseStatusPayload(text);
    if (!parsed) {
      throw new Error('Voicebox status response unreadable');
    }
    return parsed;
  }

  async waitForCompletion(generationId: string): Promise<VoiceboxGenerationStatus> {
    const started = Date.now();
    while (Date.now() - started < VOICE_GENERATION_TIMEOUT_MS) {
      const status = await this.generationStatus(generationId);
      if (status.status === 'completed') return status;
      if (status.status === 'failed') {
        throw new Error(sanitizeVoiceError(status.error ?? 'generation failed'));
      }
      await new Promise((r) => setTimeout(r, VOICE_POLL_INTERVAL_MS));
    }
    throw new Error('Generation timed out');
  }

  async fetchAudio(generationId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VOICE_GENERATION_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/audio/${generationId}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Voicebox audio fetch failed (${res.status})`);
      }
      const contentType = res.headers.get('content-type') ?? 'audio/wav';
      const arrayBuffer = await res.arrayBuffer();
      return { buffer: Buffer.from(arrayBuffer), contentType };
    } finally {
      clearTimeout(timeout);
    }
  }

  async prewarm(): Promise<void> {
    await this.speak('Benson Studio Voice is ready.');
  }
}

export const voiceboxClient = new VoiceboxClient();
