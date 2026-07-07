export type BensonSpriteManifest = {
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
  src: string;
};

export const BENSON_SPRITE_MANIFEST: BensonSpriteManifest = {
  frameWidth: 128,
  frameHeight: 128,
  frameCount: 24,
  fps: 12,
  src: '/animations/benson-dance.webp',
};
