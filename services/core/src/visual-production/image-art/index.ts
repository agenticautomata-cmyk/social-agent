import { env } from '../../env.js';
import { OffImageArtProvider } from './off.js';
import { OpenAIImageArtProvider } from './openai.js';
import { GeminiImageArtProvider } from './gemini.js';
import type { ImageArtCapabilities, ImageArtProvider, ImageArtProviderId } from './types.js';

const off = new OffImageArtProvider();
const openai = new OpenAIImageArtProvider();
const gemini = new GeminiImageArtProvider();

export function getImageArtProvider(id?: ImageArtProviderId | null): ImageArtProvider {
  const selected = id ?? (env.BENSON_IMAGE_GEN_PROVIDER as ImageArtProviderId) ?? 'off';
  if (!env.BENSON_IMAGE_GEN_ENABLED) return off;
  if (selected === 'openai') return openai;
  if (selected === 'gemini') return gemini;
  return off;
}

export async function reportImageArtCapabilities(): Promise<
  Record<ImageArtProviderId, ImageArtCapabilities & { id: ImageArtProviderId }>
> {
  const [offCaps, openaiCaps, geminiCaps] = await Promise.all([
    off.capabilities(),
    openai.capabilities(),
    gemini.capabilities(),
  ]);
  return {
    off: { id: 'off', ...offCaps },
    openai: { id: 'openai', ...openaiCaps },
    gemini: { id: 'gemini', ...geminiCaps },
  };
}

export { OffImageArtProvider, OpenAIImageArtProvider, GeminiImageArtProvider };
export * from './types.js';
