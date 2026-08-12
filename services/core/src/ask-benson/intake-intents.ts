import { extractUrls } from './collect-from-link.js';

const LOOKUP_PREFIX =
  /^(?:please\s+)?(?:(?:can you|could you|will you)\s+)?(?:look\s*up|lookup|find(?: info on| information on| details on)?|search for|research)\s+(.+)/i;

export function detectLookupQuery(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed || extractUrls(trimmed).length > 0) return null;

  const match = trimmed.match(LOOKUP_PREFIX);
  if (!match?.[1]) return null;

  const query = match[1].replace(/[?.!]+$/, '').trim();
  if (query.length < 3) return null;
  if (/^(my|the|a|an)\s+(metrics|analytics|views|posting time|best time)\b/i.test(query)) {
    return null;
  }
  return query;
}

/** User is sharing a business directory / listing page (not an event calendar). */
export function isDirectoryListingIntake(message: string | null | undefined): boolean {
  const text = (message ?? '').trim().toLowerCase();
  if (!text) return false;
  return (
    /\b(black[-\s]?owned|bipoc|minority[-\s]?owned)\b.{0,40}\b(directory|list|guide|roundup|spotlight|businesses?)\b/i.test(
      text,
    ) ||
    /\b(directory|business directory|shop directory|business list|local business list|vendor list|restaurant list)\b/i.test(
      text,
    ) ||
    /\b(list of|roundup of|guide to)\b.{0,30}\b(businesses?|shops?|restaurants?|vendors?)\b/i.test(text)
  );
}

export function isDirectoryListingContent(
  text: string | null | undefined,
  title?: string | null,
): boolean {
  const combined = `${title ?? ''} ${text ?? ''}`.toLowerCase();
  if (!combined.trim()) return false;
  return (
    /\b(black[-\s]?owned|bipoc|minority[-\s]?owned)\b.{0,40}\b(directory|list|guide|businesses?)\b/i.test(
      combined,
    ) ||
    /\b(business directory|shop directory|vendor directory|restaurant directory|local directory)\b/i.test(
      combined,
    ) ||
    (/\bdirectory\b/i.test(combined) &&
      /\b(business|shop|restaurant|vendor|store|boutique|cafe|salon|barber)\b/i.test(combined))
  );
}

/** User explicitly commands Benson to save/add/track an opportunity (not passive discovery). */
export function isExplicitUserAddOpportunityRequest(message: string | null | undefined): boolean {
  const text = (message ?? '').trim();
  if (!text) return false;
  return (
    /\b(add|save|track|put|create|include|import)\b.{0,48}\b(opportunit(?:y|ies)|inventory|these events?|this event|to opportunit)/i.test(
      text,
    ) ||
    /\b(add these events?|save this (?:event|opportunity)|track this event)\b/i.test(text) ||
    /\b(add|save)\b.{0,20}\bto opportunit/i.test(text)
  );
}

export function isEnrichOpportunitiesRequest(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;
  return (
    /\b(add|fill in|complete|expand|enrich|update)\b.{0,40}\b(full info|full details|more info|more detail|details|opportunities)\b/i.test(
      text,
    ) ||
    /\benrich\b.{0,24}\b(opportunities|inventory|items)\b/i.test(text) ||
    /\b(flesh out|fill out)\b.{0,24}\b(opportunities|these)\b/i.test(text)
  );
}
