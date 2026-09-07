import { env } from '../../env.js';
import type { ImageArtCapabilities, ImageArtProvider, ImageArtRequest, ImageArtResult } from './types.js';

/**
 * OpenAI Images API adapter. Capability-detected; never silently fails over.
 * Does not upload private Kellie assets. Backgrounds only.
 */
export class OpenAIImageArtProvider implements ImageArtProvider {
  readonly id = 'openai' as const;

  async capabilities(): Promise<ImageArtCapabilities> {
    if (!env.BENSON_IMAGE_GEN_ENABLED) {
      return { available: false, reason: 'BENSON_IMAGE_GEN_ENABLED=false' };
    }
    if (env.BENSON_IMAGE_GEN_PROVIDER !== 'openai' && env.BENSON_IMAGE_GEN_PROVIDER !== 'off') {
      // Explicit provider selection required for paid calls; still report capability.
    }
    if (!env.OPENAI_API_KEY?.trim()) {
      return { available: false, reason: 'OPENAI_API_KEY not configured' };
    }
    const model = env.BENSON_IMAGE_GEN_MODEL?.trim() || 'gpt-image-1';
    return { available: true, model, reason: 'OpenAI key present; paid calls gated by enable flag + caps.' };
  }

  async generateBackground(req: ImageArtRequest): Promise<ImageArtResult> {
    const caps = await this.capabilities();
    if (!env.BENSON_IMAGE_GEN_ENABLED) {
      return {
        ok: false,
        provider: 'openai',
        reason: 'Image generation disabled by BENSON_IMAGE_GEN_ENABLED',
        code: 'disabled',
        estimatedCostUsd: 0,
      };
    }
    if (env.BENSON_IMAGE_GEN_PROVIDER !== 'openai') {
      return {
        ok: false,
        provider: 'openai',
        reason: `Provider not selected (BENSON_IMAGE_GEN_PROVIDER=${env.BENSON_IMAGE_GEN_PROVIDER})`,
        code: 'disabled',
        estimatedCostUsd: 0,
      };
    }
    if (!caps.available) {
      return {
        ok: false,
        provider: 'openai',
        reason: caps.reason ?? 'unavailable',
        code: 'unavailable',
        estimatedCostUsd: 0,
      };
    }
    if (req.styleReferenceAssetIds?.length) {
      return {
        ok: false,
        provider: 'openai',
        reason: 'Private style-reference upload requires explicit consent; refused.',
        code: 'forbidden',
        estimatedCostUsd: 0,
      };
    }

    // Actual billed call is only executed by the capped PoC harness.
    return {
      ok: false,
      provider: 'openai',
      reason: 'Adapter ready; invoke via capped PoC harness only.',
      code: 'disabled',
      estimatedCostUsd: 0,
    };
  }
}
