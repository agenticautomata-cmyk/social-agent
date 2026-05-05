import type { ImageInput, ImageOutput, ImageProvider } from './types.js';
import { env } from '../env.js';

// ============================================================================
// MOCK — returns placeholder portrait URLs from a deterministic catalog
// ============================================================================

// We use placeholder.com / picsum.photos style URLs so the dashboard renders
// real images without requiring API access. Seeded by prompt hash for stability.

function seedFromPrompt(prompt: string): number {
  let h = 0;
  for (let i = 0; i < prompt.length; i++) h = (h * 31 + prompt.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export class MockImage implements ImageProvider {
  readonly mode = 'mock' as const;

  async generatePortrait(input: ImageInput): Promise<ImageOutput> {
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
    const seed = seedFromPrompt(input.prompt);
    const w = input.width ?? 512;
    const h = input.height ?? 512;
    // picsum.photos returns deterministic images by seed, no auth required
    const url = `https://picsum.photos/seed/persona-${seed}/${w}/${h}`;
    return { url, prompt: input.prompt };
  }
}

// ============================================================================
// REAL — Google AI / Imagen
// ============================================================================

export class ImagenProvider implements ImageProvider {
  readonly mode = 'real' as const;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generatePortrait(input: ImageInput): Promise<ImageOutput> {
    // Google AI Studio / Gemini Imagen via REST. Endpoint shape may shift —
    // this is a thin wrapper that calls Imagen 3 generate. In production wire
    // to the @google/generative-ai SDK and its `generateImage` method.
    const endpoint =
      'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generateImage';

    const res = await fetch(`${endpoint}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: input.prompt,
        sampleCount: 1,
        aspectRatio: '1:1',
      }),
    });

    if (!res.ok) throw new Error(`Imagen API error: ${res.status} ${await res.text()}`);

    const data = (await res.json()) as { generatedImages?: { imageUri?: string }[] };
    const url = data.generatedImages?.[0]?.imageUri;
    if (!url) throw new Error('Imagen returned no image');

    return { url, prompt: input.prompt };
  }
}

// ============================================================================
// SELECTOR
// ============================================================================

export function createImageProvider(): ImageProvider {
  if (env.DEMO_MODE || !env.GOOGLE_AI_API_KEY) return new MockImage();
  return new ImagenProvider(env.GOOGLE_AI_API_KEY);
}
