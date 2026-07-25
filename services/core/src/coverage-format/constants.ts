export const COVERAGE_FORMATS = [
  'field_visit',
  'green_screen',
  'green_screen_then_visit',
  'roundup',
  'track_only',
] as const;

export type CoverageFormat = (typeof COVERAGE_FORMATS)[number];

export const COVERAGE_FORMAT_LABELS: Record<CoverageFormat, string> = {
  field_visit: 'Visit in Person',
  green_screen: 'Green Screen from Home',
  green_screen_then_visit: 'Green Screen Now, Visit Later',
  roundup: 'Include in Roundup',
  track_only: 'Track Only',
};

export const GREEN_SCREEN_FORMATS: CoverageFormat[] = ['green_screen', 'green_screen_then_visit'];

export function isGreenScreenFormat(format: CoverageFormat | null | undefined): boolean {
  return format != null && GREEN_SCREEN_FORMATS.includes(format);
}

export function coverageFormatLabel(format: CoverageFormat | null | undefined): string | null {
  if (!format) return null;
  return COVERAGE_FORMAT_LABELS[format] ?? format;
}

export function parseCoverageFormat(value: unknown): CoverageFormat | null {
  if (typeof value !== 'string') return null;
  return COVERAGE_FORMATS.includes(value as CoverageFormat) ? (value as CoverageFormat) : null;
}
