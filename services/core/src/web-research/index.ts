// Web research — internet search via OpenAI Responses API (web_search tool).
// Used for upload enrichment (flyer → official links/dates) and broken-source
// replacement suggestions. Degrades gracefully when search is unavailable.

import OpenAI from 'openai';
import { env } from '../env.js';
import {
  canRunConciergeWebSearch,
  estimateWebSearchCost,
  recordLlmUsage,
  shouldSkipBackgroundLlm,
} from '../llm-spend/index.js';

export type WebResearchCitation = {
  url: string;
  title: string | null;
};

export type WebResearchResult = {
  ok: boolean;
  summary: string | null;
  citations: WebResearchCitation[];
  error?: string;
  skipped?: boolean;
};

export type SearchWebOptions = {
  /** background = discovery/source-health; concierge = capped daily; user = Ask Benson intake */
  context?: 'user' | 'background' | 'concierge';
  caller?: string;
  module?: string;
  partnershipId?: string;
  contentItemId?: string;
  researchRunId?: string;
  trigger?: string;
  process?: 'api' | 'worker';
  sourceId?: string;
  listingUrl?: string;
  scanRunId?: string;
  refreshWaveId?: string;
};

const SEARCH_MODEL = env.BENSON_WEB_SEARCH_MODEL;

type ResponsesOutputItem = {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
    annotations?: Array<{
      type?: string;
      url?: string;
      title?: string;
    }>;
  }>;
};

export async function searchWeb(
  query: string,
  instructions?: string,
  options?: SearchWebOptions,
): Promise<WebResearchResult> {
  if (!env.OPENAI_API_KEY) {
    return { ok: false, summary: null, citations: [], error: 'OPENAI_API_KEY missing' };
  }

  const context = options?.context ?? 'user';

  if (context === 'background') {
    const gate = await shouldSkipBackgroundLlm('web_search');
    if (gate.skip) {
      return {
        ok: false,
        summary: null,
        citations: [],
        error: gate.reason ?? 'web_search_skipped',
        skipped: true,
      };
    }
  }

  if (context === 'concierge' && !(await canRunConciergeWebSearch())) {
    return {
      ok: false,
      summary: null,
      citations: [],
      error: 'concierge_web_search_daily_cap',
      skipped: true,
    };
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  try {
    const response = await client.responses.create({
      model: SEARCH_MODEL,
      tools: [{ type: 'web_search_preview' }],
      instructions:
        instructions ??
        'Search the web and answer concisely (under 200 words). Always cite source URLs. Focus on Kansas City metro context when relevant.',
      input: query,
    });

    const citations: WebResearchCitation[] = [];
    let summary: string | null =
      typeof (response as { output_text?: string }).output_text === 'string'
        ? (response as { output_text?: string }).output_text!.trim() || null
        : null;

    const output = (response as { output?: ResponsesOutputItem[] }).output ?? [];
    for (const item of output) {
      if (item.type !== 'message' || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (!summary && typeof part.text === 'string' && part.text.trim()) {
          summary = part.text.trim();
        }
        for (const annotation of part.annotations ?? []) {
          if (annotation.type === 'url_citation' && annotation.url) {
            if (!citations.some((c) => c.url === annotation.url)) {
              citations.push({ url: annotation.url, title: annotation.title ?? null });
            }
          }
        }
      }
    }

    const estimatedCost = estimateWebSearchCost();
    await recordLlmUsage({
      source: 'web_search',
      model: SEARCH_MODEL,
      estimatedCost,
      metadata: {
        context,
        query: query.slice(0, 200),
        ...(options?.caller ? { caller: options.caller } : {}),
        ...(options?.module ? { module: options.module } : {}),
        ...(options?.partnershipId ? { partnershipId: options.partnershipId } : {}),
        ...(options?.contentItemId ? { contentItemId: options.contentItemId } : {}),
        ...(options?.researchRunId ? { researchRunId: options.researchRunId } : {}),
        ...(options?.trigger ? { trigger: options.trigger } : {}),
        ...(options?.process ? { process: options.process } : {}),
        ...(options?.sourceId ? { sourceId: options.sourceId } : {}),
        ...(options?.listingUrl ? { listingUrl: options.listingUrl } : {}),
        ...(options?.scanRunId ? { scanRunId: options.scanRunId } : {}),
        ...(options?.refreshWaveId ? { refreshWaveId: options.refreshWaveId } : {}),
      },
    });

    return { ok: true, summary, citations };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[web-research] search failed:', message);
    return { ok: false, summary: null, citations: [], error: message };
  }
}

/** Research an event/opportunity: official page, dates, tickets. */
export async function researchOpportunity(
  input: {
    title: string;
    location?: string | null;
    businessName?: string | null;
  },
  options?: SearchWebOptions,
): Promise<WebResearchResult> {
  const parts = [
    input.title,
    input.businessName ?? null,
    input.location ?? 'Kansas City',
    String(new Date().getFullYear()),
  ].filter(Boolean);
  return searchWeb(
    `Find official information, dates, location, and ticket/event links for: ${parts.join(' — ')}`,
    'Find the official event page or organizer site. Report exact dates, venue/address, ticket links. Cite URLs. Under 150 words. If you cannot find it, say so.',
    options,
  );
}

/** Suggest a replacement feed/page for a broken source. */
export async function researchReplacementSource(
  input: {
    sourceName: string;
    sourceType: string;
    brokenUrl: string | null;
  },
  options?: SearchWebOptions,
): Promise<WebResearchResult> {
  return searchWeb(
    `The data feed "${input.sourceName}" (type: ${input.sourceType}) at ${input.brokenUrl ?? 'unknown URL'} is broken or returns no items. Find a working replacement URL: an RSS feed, events calendar page, or equivalent listing for the same Kansas City content.`,
    'Suggest 1-3 concrete working URLs (RSS feeds preferred, otherwise calendar/listing pages) that cover the same content. Cite each URL. Under 120 words.',
    { context: 'background', ...options },
  );
}
