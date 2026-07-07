'use client';

import { BENSON_SPRITE_MANIFEST } from '../lib/benson-sprite-manifest';

type BensonDancerSpriteProps = {
  playing: boolean;
  size: number;
  className?: string;
};

export function BensonDancerSprite({ playing, size, className = '' }: BensonDancerSpriteProps) {
  const { frameHeight, frameCount, fps, src } = BENSON_SPRITE_MANIFEST;
  const durationSec = frameCount / fps;
  const aspect = frameHeight / BENSON_SPRITE_MANIFEST.frameWidth;
  const displayHeight = Math.round(size * aspect);

  return (
    <span
      className={`benson-dancer-sprite inline-block shrink-0 ${playing ? 'benson-dancer-sprite--active' : ''} ${className}`}
      style={{
        ['--sprite-frames' as string]: frameCount,
        ['--sprite-duration' as string]: `${durationSec}s`,
        width: size,
        height: displayHeight,
        backgroundImage: `url(${src})`,
        backgroundSize: `${frameCount * 100}% 100%`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: '0 0',
      }}
      aria-hidden
    />
  );
}
