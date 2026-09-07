export type ImageArtKind = 'background' | 'texture' | 'editorial_illustration';

export type ImageArtProviderId = 'off' | 'openai' | 'gemini';

export type ImageArtCapabilities = {
  available: boolean;
  reason?: string;
  model?: string;
};

export type ImageArtRequest = {
  kind: ImageArtKind;
  aspectRatio: '4:5' | '9:16' | '16:9';
  brandThemeId: string;
  styleReferenceAssetIds?: string[];
  promptVersion: string;
  negativeConstraints: string[];
  maxAttempts: number;
  attemptKey: string;
  projectId?: string;
  versionId?: string;
};

export type ImageArtResult =
  | {
      ok: true;
      provider: ImageArtProviderId;
      model: string | null;
      outputPath: string | null;
      estimatedCostUsd: number;
      documentary: false;
      attemptId?: string;
    }
  | {
      ok: false;
      provider: ImageArtProviderId;
      reason: string;
      code: 'disabled' | 'unavailable' | 'capped' | 'failed' | 'forbidden';
      estimatedCostUsd: number;
    };

export interface ImageArtProvider {
  id: ImageArtProviderId;
  capabilities(): Promise<ImageArtCapabilities>;
  generateBackground(req: ImageArtRequest): Promise<ImageArtResult>;
}

export const DEFAULT_NEGATIVE_CONSTRAINTS = [
  'no faces',
  'no readable event names, times, prices, or addresses as source of truth',
  'no fake documentary venues',
  'no Kellie likeness',
  'no logos that invent sponsorship',
];
