'use client';

import Image from 'next/image';
import { useBensonStudio } from '../lib/benson-studio-context';
import { BensonDancerSprite } from './benson-dancer-sprite';

const FALLBACK_BPM = 120;

type BensonDancerProps = {
  size?: number;
  className?: string;
  forceDance?: boolean;
  variant?: 'compact' | 'full';
};

function BensonDancerCss({
  size,
  className,
  dancing,
}: {
  size: number;
  className: string;
  dancing: boolean;
}) {
  const scale = size / 72;

  return (
    <span
      className={`benson-dancer-rig ${dancing ? 'benson-dancer-rig--active' : ''} ${className}`}
      style={{
        ['--benson-scale' as string]: scale,
        ['--benson-bpm' as string]: FALLBACK_BPM,
        width: size,
        height: Math.round(size * 1.45),
      }}
      aria-hidden
    >
      <span className="benson-dancer-stage">
        <span className="benson-dancer-shadow" />
        <span className="benson-dancer-body">
          <span className="benson-dancer-limb benson-dancer-arm benson-dancer-arm--left" />
          <span className="benson-dancer-limb benson-dancer-arm benson-dancer-arm--right" />
          <span className="benson-dancer-torso">
            <Image
              src="/icons/benson-logo.png"
              alt=""
              width={size}
              height={size}
              className="benson-dancer-face rounded-xl object-contain ring-1 ring-white/15"
              style={{ width: size, height: size }}
            />
          </span>
          <span className="benson-dancer-limb benson-dancer-leg benson-dancer-leg--left" />
          <span className="benson-dancer-limb benson-dancer-leg benson-dancer-leg--right" />
        </span>
      </span>
    </span>
  );
}

export function BensonDancer({
  size = 36,
  className = '',
  forceDance,
  variant,
}: BensonDancerProps) {
  const { isDancing } = useBensonStudio();
  const dancing = forceDance ?? isDancing;
  const mode = variant ?? (size >= 44 ? 'full' : 'compact');

  if (mode === 'compact') {
    return (
      <span
        className={`benson-dancer-compact ${dancing ? 'benson-dancer-compact--active' : ''} ${className}`}
        style={{ ['--benson-size' as string]: `${size}px`, ['--benson-bpm' as string]: FALLBACK_BPM }}
        aria-hidden
      >
        <Image
          src="/icons/benson-logo.png"
          alt=""
          width={size}
          height={size}
          className="benson-dancer-compact-logo rounded-xl object-contain ring-1 ring-white/10"
          style={{ width: size, height: size }}
        />
      </span>
    );
  }

  return (
    <BensonDancerSprite playing={dancing} size={size} className={className} />
  );
}

// Exported for tests / fallback hook if sprite asset missing at runtime
export { BensonDancerCss };
