/** Bump when prefilter rules change (invalidates prefilter reject cache). */
export const NEWSLETTER_PREFILTER_VERSION = 'prefilter-v3';

/** Bump when extraction prompt/schema changes. */
export const NEWSLETTER_EXTRACTOR_VERSION = 'extract-compact-v1';

export const NEWSLETTER_OCR_VERSION = 'ocr-v2';

export const NEWSLETTER_RESEARCH_VERSION = 'research-v1';

export function newsletterModelVersion(model: string): string {
  return model.replace(/[^a-zA-Z0-9._-]/g, '_');
}
