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
