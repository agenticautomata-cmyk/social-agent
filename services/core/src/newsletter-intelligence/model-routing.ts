import { env } from '../env.js';

export type ModelSelection = {
  model: string;
  escalated: boolean;
  reason: string;
};

export function selectNewsletterExtractionModel(input: {
  reducedChars: number;
  itemCountHint?: number;
  ambiguous?: boolean;
}): ModelSelection {
  const cheap =
    process.env.NEWSLETTER_EXTRACT_MODEL?.trim() ||
    env.BENSON_ASK_MODEL?.trim() ||
    'gpt-4o-mini';

  if (input.ambiguous) {
    const escalated =
      process.env.NEWSLETTER_EXTRACT_ESCALATION_MODEL?.trim() || 'gpt-4o-mini';
    return {
      model: escalated,
      escalated: escalated !== cheap,
      reason: 'ambiguous_content',
    };
  }

  if (input.reducedChars > 9000) {
    return { model: cheap, escalated: false, reason: 'large_reduced_body_still_on_cheap_model' };
  }

  return { model: cheap, escalated: false, reason: 'default_compact_extract' };
}

export function newsletterExtractMaxOutputTokens(): number {
  const raw = Number(process.env.NEWSLETTER_EXTRACT_MAX_OUTPUT_TOKENS ?? 900);
  return Number.isFinite(raw) && raw > 100 ? Math.floor(raw) : 900;
}
