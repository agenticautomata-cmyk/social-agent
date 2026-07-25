import { desc } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import type { CreatorDraftAsset } from '../schema.js';
import type { OpportunityMatch } from './types.js';

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 3);
}

function overlapScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const hits = a.filter((t) => setB.has(t)).length;
  return hits / Math.max(a.length, b.length);
}

export async function matchDraftToOpportunities(
  draft: CreatorDraftAsset,
): Promise<OpportunityMatch> {
  const haystack = [
    draft.draftTitle,
    draft.userNote,
    draft.rawCaptionOrText,
    draft.transcriptText,
    draft.overallSummary,
    draft.visualSummary,
    draft.detectedContentTheme,
    Array.isArray(draft.detectedBrandsJson)
      ? (draft.detectedBrandsJson as string[]).join(' ')
      : '',
    Array.isArray(draft.detectedLocationsJson)
      ? (draft.detectedLocationsJson as string[]).join(' ')
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const draftTokens = tokenize(haystack);
  if (draftTokens.length === 0) {
    return {
      opportunity_id: null,
      title: null,
      confidence: 'low',
      reason: 'Not enough text to match an opportunity.',
      needs_confirmation: false,
    };
  }

  const opportunities = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      hook: contentItems.hook,
      locationName: contentItems.locationName,
      metadata: contentItems.metadata,
    })
    .from(contentItems)
    .orderBy(desc(contentItems.discoveredAt))
    .limit(80);

  let best: { id: string; title: string; score: number } | null = null;

  for (const opp of opportunities) {
    const meta = opp.metadata as Record<string, unknown> | null;
    const tags = Array.isArray(meta?.tags) ? (meta.tags as string[]).join(' ') : '';
    const oppText = [opp.topic, opp.hook, opp.locationName, tags].filter(Boolean).join(' ');
    const score = overlapScore(draftTokens, tokenize(oppText));
    if (!best || score > best.score) {
      best = { id: opp.id, title: opp.topic ?? 'Opportunity', score };
    }
  }

  if (!best || best.score < 0.12) {
    return {
      opportunity_id: null,
      title: null,
      confidence: 'low',
      reason: 'No strong opportunity match found.',
      needs_confirmation: false,
    };
  }

  const confidence: OpportunityMatch['confidence'] =
    best.score >= 0.35 ? 'high' : best.score >= 0.2 ? 'medium' : 'low';

  return {
    opportunity_id: best.id,
    title: best.title,
    confidence,
    reason:
      confidence === 'high'
        ? `This looks like it may be from "${best.title}". Confirm?`
        : `Could this be related to "${best.title}"?`,
    needs_confirmation: confidence !== 'high',
  };
}
