import { env } from '../../env.js';
import type { ImageArtCapabilities, ImageArtProvider, ImageArtRequest, ImageArtResult } from './types.js';

/**
 * Gemini / Nano Banana 2 image adapter. Capability-detected; no paid failover.
 */
export class GeminiImageArtProvider implements ImageArtProvider {
  readonly id = 'gemini' as const;

  async capabilities(): Promise<ImageArtCapabilities> {
    if (!env.BENSON_IMAGE_GEN_ENABLED) {
      return { available: false, reason: 'BENSON_IMAGE_GEN_ENABLED=false' };
    }
    if (!env.GOOGLE_AI_API_KEY?.trim()) {
      return { available: false, reason: 'GOOGLE_AI_API_KEY not configured' };
    }
    const model = env.BENSON_IMAGE_GEN_MODEL?.trim() || 'gemini-2.0-flash-preview-image-generation';
    return { available: true, model, reason: 'Gemini key present; paid calls gated by enable flag + caps.' };
  }

  async generateBackground(req: ImageArtRequest): Promise<ImageArtResult> {
    const caps = await this.capabilities();
    if (!env.BENSON_IMAGE_GEN_ENABLED) {
      return {
        ok: false,
        provider: 'gemini',
        reason: 'Image generation disabled by BENSON_IMAGE_GEN_ENABLED',
        code: 'disabled',
        estimatedCostUsd: 0,
      };
    }
    if (env.BENSON_IMAGE_GEN_PROVIDER !== 'gemini') {
      return {
        ok: false,
        provider: 'gemini',
        reason: `Provider not selected (BENSON_IMAGE_GEN_PROVIDER=${env.BENSON_IMAGE_GEN_PROVIDER})`,
        code: 'disabled',
        estimatedCostUsd: 0,
      };
    }
    if (!caps.available) {
      return {
        ok: false,
        provider: 'gemini',
        reason: caps.reason ?? 'unavailable',
        code: 'unavailable',
        estimatedCostUsd: 0,
      };
    }
    if (req.styleReferenceAssetIds?.length) {
      return {
        ok: false,
        provider: 'gemini',
        reason: 'Private style-reference upload requires explicit consent; refused.',
        code: 'forbidden',
        estimatedCostUsd: 0,
      };
    }
    return {
      ok: false,
      provider: 'gemini',
      reason: 'Adapter ready; invoke via capped PoC harness only.',
      code: 'disabled',
      estimatedCostUsd: 0,
    };
  }
}
