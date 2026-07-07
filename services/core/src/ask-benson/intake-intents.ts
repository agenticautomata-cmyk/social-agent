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
