import type { ImageArtCapabilities, ImageArtProvider, ImageArtRequest, ImageArtResult } from './types.js';

/** Always available. Deterministic template-only path. */
export class OffImageArtProvider implements ImageArtProvider {
  readonly id = 'off' as const;

  async capabilities(): Promise<ImageArtCapabilities> {
    return { available: true, model: 'template-only', reason: 'Deterministic HTML/SVG template; no paid generation.' };
  }

  async generateBackground(req: ImageArtRequest): Promise<ImageArtResult> {
    void req;
    return {
      ok: false,
      provider: 'off',
      reason: 'Image generation is off — using deterministic template background.',
      code: 'disabled',
      estimatedCostUsd: 0,
    };
  }
}
