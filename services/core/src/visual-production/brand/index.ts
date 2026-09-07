import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export type BrandTheme = {
  id: string;
  seriesId: string;
  seriesName: string;
  tagline: string;
  version: number;
  colors: Record<string, string>;
  type: { display: string; sans: string; mono: string };
  layout: {
    safeMarginPx: number;
    safeMarginStoryPx: number;
    maxEventsPerInfoSlide: number;
    maxCharsPerInfoSlide: number;
    carousel: { width: number; height: number };
    story: { width: number; height: number };
  };
  copy: {
    wordmark: string;
    product: string;
    city: string;
    attendanceDisclaimer: string;
  };
};

let cached: BrandTheme | null = null;

export function loadWeekendDropTheme(): BrandTheme {
  if (cached) return cached;
  const raw = readFileSync(join(here, 'themes', 'kckellie-weekend-drop.v1.json'), 'utf8');
  cached = JSON.parse(raw) as BrandTheme;
  return cached;
}

export function brandCssVariables(theme: BrandTheme = loadWeekendDropTheme()): string {
  const c = theme.colors;
  return `
    --kd-navy: ${c.navy};
    --kd-navy-deep: ${c.navyDeep};
    --kd-navy-mid: ${c.navyMid};
    --kd-yellow: ${c.yellow};
    --kd-yellow-soft: ${c.yellowSoft};
    --kd-teal: ${c.teal};
    --kd-teal-deep: ${c.tealDeep};
    --kd-cream: ${c.cream};
    --kd-ink: ${c.ink};
    --kd-muted: ${c.muted};
    --kd-white: ${c.white};
    --kd-rule: ${c.rule};
    --kd-display: ${theme.type.display};
    --kd-sans: ${theme.type.sans};
    --kd-mono: ${theme.type.mono};
  `.trim();
}
