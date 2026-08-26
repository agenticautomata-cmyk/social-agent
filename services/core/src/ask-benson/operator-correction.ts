/**
 * Operator correction authority for the immediately referenced Ask Benson entity.
 * Taxonomy corrections mutate durable state; they are not conversational agreement.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonChatMessages, contentItems } from '../schema.js';
import { extractHttpUrls } from './url-type.js';
import { normalizeOpportunityTitle } from './url-intake-dedupe.js';
import { isTicketVendorUrl } from './event-occurrence.js';

export type OperatorCorrectionKind =
  | 'taxonomy_event'
  | 'taxonomy_not_restaurant'
  | 'taxonomy_sale'
  | 'date_wrong'
  | 'location';

export type DetectedOperatorCorrection = {
  kind: OperatorCorrectionKind;
  referent: string | null;
  locationScope: string | null;
};

export type ResolvedCorrectionTarget = {
  contentItemId: string;
  sourceUrl: string;
  title: string;
};

const THIS_THAT =
  /^(?:that|this|it|the one(?: we just (?:looked at|added))?)\s+/i;

export function detectOperatorCorrection(message: string | null | undefined): DetectedOperatorCorrection | null {
  const text = (message ?? '').trim();
  if (!text || extractHttpUrls(text, 1).length > 0) return null;

  const location = text.match(
    /\b(?:this|that|it)\s+is\s+in\s+(kansas city|lenexa|overland park|olathe)\b/i,
  );
  if (location?.[1]) {
    return { kind: 'location', referent: null, locationScope: location[1].replace(/\s+/g, ' ') };
  }

  if (/\b(?:that|this|it)\s+date\s+is\s+wrong\b/i.test(text) || /\bwrong date\b/i.test(text)) {
    return { kind: 'date_wrong', referent: extractNamedReferent(text), locationScope: null };
  }

  if (
    /\bthat'?s\s+a\s+sale(?:\s*,?\s*not\s+(?:an?\s+)?event)?\b/i.test(text) ||
    /\b(?:this|that|it)\s+is\s+(?:a\s+)?sale(?:\s*,?\s*not\s+(?:an?\s+)?event)?\b/i.test(text)
  ) {
    return { kind: 'taxonomy_sale', referent: extractNamedReferent(text), locationScope: null };
  }

  if (
    /\b(?:this|that|it)\s+is\s+not\s+(?:a\s+)?restaurant\b/i.test(text) ||
    /\bnot\s+a\s+restaurant\b/i.test(text)
  ) {
    return { kind: 'taxonomy_not_restaurant', referent: extractNamedReferent(text), locationScope: null };
  }

  if (/\b(?:that|this|it)\s+is\s+(?:an?\s+)?events?\b/i.test(text)) {
    return { kind: 'taxonomy_event', referent: null, locationScope: null };
  }

  const namedEvent = text.match(
    /^(?:actually,?\s+)?(.+?)\s+is\s+(?:an?\s+)?events?\b/i,
  );
  if (namedEvent?.[1] && !/^(?:that|this|it)$/i.test(namedEvent[1].trim())) {
    const referent = namedEvent[1].replace(/^(?:the|a|an)\s+/i, '').trim();
    if (referent.length >= 3 && referent.length <= 80) {
      return { kind: 'taxonomy_event', referent, locationScope: null };
    }
  }

  return null;
}

function extractNamedReferent(text: string): string | null {
  const named = text.match(/^(.+?)\s+is\s+(?:an?\s+)?(?:event|not\s+a\s+restaurant|sale)\b/i);
  if (!named?.[1] || THIS_THAT.test(named[1])) return null;
  const referent = named[1].replace(/^(?:the|a|an|actually,?\s+)/i, '').trim();
  return referent.length >= 3 ? referent : null;
}

function tokensOverlap(a: string, b: string): boolean {
  const ta = normalizeOpportunityTitle(a).split(' ').filter((t) => t.length >= 3);
  const tb = new Set(normalizeOpportunityTitle(b).split(' ').filter((t) => t.length >= 3));
  if (ta.length === 0 || tb.size === 0) return false;
  const hits = ta.filter((t) => tb.has(t)).length;
  return hits >= Math.min(2, ta.length) || (ta.length === 1 && tb.has(ta[0]!));
}

type RecentIntakeCandidate = {
  contentItemId: string;
  sourceUrl: string;
  title: string;
};

function candidatesFromOutput(output: Record<string, unknown>): RecentIntakeCandidate[] {
  const out: RecentIntakeCandidate[] = [];
  const collection = (output.collection ?? null) as Record<string, unknown> | null;
  const summary = (collection?.urlIntakeSummary ?? null) as Record<string, unknown> | null;
  const items = Array.isArray(collection?.items) ? collection.items : [];
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const id = typeof item.contentItemId === 'string' ? item.contentItemId : null;
    const url = typeof item.sourceUrl === 'string' ? item.sourceUrl : null;
    const title = typeof item.title === 'string' ? item.title : '';
    if (id && url) out.push({ contentItemId: id, sourceUrl: url, title });
  }
  const entityId = typeof summary?.entityOpportunityId === 'string' ? summary.entityOpportunityId : null;
  const entityTitle = typeof summary?.entityOpportunityTitle === 'string' ? summary.entityOpportunityTitle : '';
  if (entityId && !out.some((c) => c.contentItemId === entityId)) {
    const firstUrl =
      (Array.isArray(collection?.sourceUrls) ? collection.sourceUrls[0] : null) ??
      (typeof items[0] === 'object' && items[0] && 'sourceUrl' in items[0]
        ? String((items[0] as { sourceUrl?: string }).sourceUrl ?? '')
        : '');
    if (firstUrl) {
      out.unshift({ contentItemId: entityId, sourceUrl: firstUrl, title: entityTitle });
    }
  }
  return out;
}

export async function resolveCorrectionTarget(input: {
  creatorId: string;
  conversationId: string | null | undefined;
  correction: DetectedOperatorCorrection;
}): Promise<ResolvedCorrectionTarget | null> {
  if (!input.conversationId) return null;

  const rows = await db
    .select({
      role: bensonChatMessages.role,
      message: bensonChatMessages.message,
      outputJson: bensonChatMessages.outputJson,
      inputSnapshot: bensonChatMessages.inputSnapshot,
    })
    .from(bensonChatMessages)
    .where(
      and(
        eq(bensonChatMessages.creatorId, input.creatorId),
        eq(bensonChatMessages.conversationId, input.conversationId),
      ),
    )
    .orderBy(desc(bensonChatMessages.createdAt))
    .limit(16);

  const seen = new Map<string, RecentIntakeCandidate>();
  for (const row of rows) {
    if (row.role === 'assistant') {
      for (const candidate of candidatesFromOutput((row.outputJson ?? {}) as Record<string, unknown>)) {
        if (!seen.has(candidate.contentItemId)) seen.set(candidate.contentItemId, candidate);
      }
    }
    if (row.role === 'user') {
      const snap = (row.inputSnapshot ?? {}) as Record<string, unknown>;
      const pasted = Array.isArray(snap.pastedUrls)
        ? snap.pastedUrls.map(String)
        : extractHttpUrls(row.message, 2);
      for (const url of pasted) {
        if (![...seen.values()].some((c) => c.sourceUrl === url)) {
          seen.set(`url:${url}`, {
            contentItemId: '',
            sourceUrl: url,
            title: '',
          });
        }
      }
    }
  }

  const candidates = [...seen.values()].filter((c) => c.sourceUrl);
  if (candidates.length === 0) return null;

  if (input.correction.referent) {
    const matches = candidates.filter(
      (c) => c.title && tokensOverlap(input.correction.referent!, c.title),
    );
    if (matches.length === 1) {
      return hydrateTarget(matches[0]!);
    }
    if (matches.length === 0) {
      const byUrl = candidates.filter((c) =>
        tokensOverlap(input.correction.referent!, c.sourceUrl.replace(/^https?:\/\//, '')),
      );
      if (byUrl.length === 1) return hydrateTarget(byUrl[0]!);
      return null;
    }
    return null;
  }

  const withIds = candidates.filter((c) => c.contentItemId);
  if (withIds.length === 1) return hydrateTarget(withIds[0]!);
  if (candidates.length === 1) return hydrateTarget(candidates[0]!);
  return null;
}

async function hydrateTarget(candidate: RecentIntakeCandidate): Promise<ResolvedCorrectionTarget | null> {
  if (candidate.contentItemId) {
    const [row] = await db
      .select({
        id: contentItems.id,
        topic: contentItems.topic,
        sourceUrl: contentItems.sourceUrl,
      })
      .from(contentItems)
      .where(eq(contentItems.id, candidate.contentItemId))
      .limit(1);
    if (row?.sourceUrl) {
      const sourceUrl =
        candidate.sourceUrl && !isTicketVendorUrl(candidate.sourceUrl)
          ? candidate.sourceUrl
          : !isTicketVendorUrl(row.sourceUrl)
            ? row.sourceUrl
            : candidate.sourceUrl || row.sourceUrl;
      return {
        contentItemId: row.id,
        sourceUrl,
        title: row.topic,
      };
    }
  }
  if (!candidate.sourceUrl) return null;
  const [byUrl] = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      sourceUrl: contentItems.sourceUrl,
    })
    .from(contentItems)
    .where(eq(contentItems.sourceUrl, candidate.sourceUrl))
    .limit(1);
  if (byUrl?.sourceUrl) {
    return { contentItemId: byUrl.id, sourceUrl: byUrl.sourceUrl, title: byUrl.topic };
  }
  return {
    contentItemId: candidate.contentItemId,
    sourceUrl: candidate.sourceUrl,
    title: candidate.title || candidate.sourceUrl,
  };
}

export function correctionUserMessage(
  correction: DetectedOperatorCorrection,
  original?: string | null,
): string {
  const base = original?.trim() || '';
  if (correction.kind === 'taxonomy_event' || correction.kind === 'taxonomy_not_restaurant') {
    return [base, 'This official page is a dated event occurrence, not a restaurant or generic food discovery.']
      .filter(Boolean)
      .join(' ');
  }
  if (correction.kind === 'taxonomy_sale') {
    return [base, 'Treat this as a sale or promotion, not a dated event.'].filter(Boolean).join(' ');
  }
  if (correction.kind === 'date_wrong') {
    return [base, 'Re-read the official source dates. Do not invent a date.'].filter(Boolean).join(' ');
  }
  if (correction.kind === 'location' && correction.locationScope) {
    return [base, `Only track the ${correction.locationScope} location`].filter(Boolean).join(' ');
  }
  return base;
}
