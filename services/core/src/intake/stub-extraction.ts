import type { IntakeType } from '../schema.js';

export type StubExtractionInput = {
  intakeType: IntakeType;
  url?: string | null;
  text?: string | null;
  notes?: string | null;
  categorySuggestion?: string | null;
  hasImage?: boolean;
};

export type StubExtractionResult = {
  ai_summary: string;
  extracted_title: string;
  extracted_category: string | null;
  extracted_location: string | null;
  extracted_business: string | null;
  extracted_date: Date | null;
  extracted_tags: string[];
  confidence_score: number;
  extraction_stub: true;
};

/** Phase A stub — no OpenAI calls. Produces draft fields for Kellie review. */
export function stubExtractIntake(input: StubExtractionInput): StubExtractionResult {
  const summaryParts: string[] = [];
  let title = '';
  let confidence = 0.4;

  if (input.url?.trim()) {
    try {
      const parsed = new URL(input.url.trim());
      const pathSnippet =
        parsed.pathname.length > 1 ? parsed.pathname.replace(/\/$/, '').slice(0, 80) : '';
      title = `${parsed.hostname}${pathSnippet}`;
      summaryParts.push(`Shared link from ${parsed.hostname}.`);
      confidence = 0.35;
    } catch {
      title = input.url.trim().slice(0, 120);
      summaryParts.push('Shared URL (could not parse hostname).');
      confidence = 0.3;
    }
  }

  if (input.text?.trim()) {
    const trimmed = input.text.trim();
    const firstLine = trimmed.split('\n').find((line) => line.trim())?.trim() ?? trimmed;
    title = title || firstLine.slice(0, 120);
    summaryParts.push(trimmed.slice(0, 800));
    confidence = Math.max(confidence, 0.55);
  }

  if (input.hasImage) {
    summaryParts.push('Image attached — OpenAI Vision extraction is not enabled yet (Phase B).');
    title = title || 'Shared image opportunity';
    confidence = Math.min(confidence || 0.25, 0.25);
  }

  if (input.notes?.trim()) {
    summaryParts.push(`Notes: ${input.notes.trim()}`);
  }

  const category = input.categorySuggestion?.trim() || null;
  const tags = category ? [category] : [];

  return {
    ai_summary:
      summaryParts.join(' ') ||
      'Manual share submitted to Benson — review extracted fields before approving.',
    extracted_title: title || 'Untitled opportunity',
    extracted_category: category,
    extracted_location: null,
    extracted_business: null,
    extracted_date: null,
    extracted_tags: tags,
    confidence_score: Number(confidence.toFixed(3)),
    extraction_stub: true,
  };
}

export function resolveIntakeType(hasUrl: boolean, hasText: boolean, hasImage: boolean): IntakeType {
  const count = [hasUrl, hasText, hasImage].filter(Boolean).length;
  if (count > 1) return 'mixed';
  if (hasImage) return 'image';
  if (hasUrl) return 'url';
  if (hasText) return 'text';
  return 'text';
}
