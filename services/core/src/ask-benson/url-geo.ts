/** Shared KC metro geography helpers for URL intake qualification. */

const KC_METRO_RE =
  /kansas city|\bkc\b|crossroads|country club plaza|overland park|olathe|independence|lee'?s summit|north kansas city|westport|power\s*&\s*light|union station|kauffman|arrowhead|loose park|first friday|berry hill|parkville|liberty mo|shawnee ks|lenexa|mission ks|prairie village|merriam|leawood|grandview mo|belton mo|raytown|gladstone mo|northland|zona rosa|18th\s+(?:and|&)\s*vine|\bvine street\b|west bottoms|river market|iron district|midtown|northeast kc|south kc|southland/i;

const OUT_OF_MARKET_RE =
  /\b(tulsa|oklahoma city|\bok\b(?![a-z])|st\.?\s*louis|chicago|dallas|houston|denver|omaha|des moines|wichita|springfield mo|branson|memphis|nashville|atlanta|miami|los angeles|san francisco|seattle|portland or|phoenix|las vegas)\b/i;

const LENEXA_RE = /\blenexa\b/i;

export function isKcMetroLocation(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return KC_METRO_RE.test(text);
}

export function isOutOfMarketLocation(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  if (isKcMetroLocation(text)) return false;
  return OUT_OF_MARKET_RE.test(text);
}

export function matchesLocationScope(
  locationText: string | null | undefined,
  scope: string | null | undefined,
): boolean {
  if (!scope?.trim()) return true;
  const loc = (locationText ?? '').toLowerCase();
  const s = scope.toLowerCase();
  if (s.includes('lenexa')) return LENEXA_RE.test(loc) || /\bks\b/.test(loc);
  if (s.includes('kansas city') || s === 'kc') return isKcMetroLocation(loc);
  return loc.includes(s);
}

export function extractLocationScopeFromMessage(message: string): string | null {
  const m = message.toLowerCase();
  const lenexa = m.match(/\b(lenexa)\b(?:\s+location|\s+store|\s+branch)?/);
  if (lenexa) return 'Lenexa';
  const onlyTrack = m.match(/only track(?: things)?(?: at| in)?\s+(?:the\s+)?([a-z][a-z\s]{2,30}?)(?:\s+location|\s+store|\s+branch)?(?:\s|$|[,.])/);
  if (onlyTrack?.[1]) return onlyTrack[1].trim().replace(/\s+/g, ' ');
  const track = m.match(/track(?: the)?\s+([a-z][a-z\s]{2,25}?)\s+location/);
  if (track?.[1]) return track[1].trim();
  return null;
}
