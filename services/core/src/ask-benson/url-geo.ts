/** Shared KC metro geography helpers for URL intake qualification and Calendar eligibility. */

const KC_METRO_RE =
  /kansas city|\bkc\b|crossroads|country club plaza|overland park|olathe|independence|lee'?s summit|north kansas city|westport|power\s*&\s*light|union station|kauffman|arrowhead|loose park|first friday|berry hill|parkville|liberty mo|shawnee ks|lenexa|mission ks|prairie village|merriam|leawood|grandview mo|belton mo|raytown|gladstone mo|northland|zona rosa|18th\s+(?:and|&)\s*vine|\bvine street\b|west bottoms|river market|iron district|midtown|northeast kc|south kc|southland/i;

/**
 * KC metro city names used when disambiguating "City, MO|KS".
 * Keep aligned with newsletter-intelligence/location-resolve KC_METRO_CITIES.
 */
const KC_METRO_CITY_NAME_RE =
  /^(?:kansas city|overland park|olathe|lenexa|shawnee|leawood|prairie village|merriam|independence|lee'?s summit|blue springs|liberty|north kansas city|gladstone|belton|raymore|grandview|raytown|mission|roeland park|fairway|parkville|leavenworth|lawrence|topeka)$/i;

/**
 * Distinctive out-of-market place names.
 * Intentionally omits ambiguous multi-state bare city names (columbia, springfield,
 * fayetteville, franklin, madison, auburn, richmond, jackson, albany, …).
 */
const OUT_OF_MARKET_RE =
  /\b(?:tulsa|oklahoma city|\bokc\b|\bok\b(?![a-z])|st\.?\s*louis|chicago|dallas|houston|denver|omaha|des moines|wichita|springfield mo|branson|memphis|nashville|atlanta|miami(?:\s+beach)?|orlando|los angeles|\bla\b|san francisco|seattle|portland or|phoenix|las vegas|red rocks|indianapolis|cincinnati|detroit|cleveland|pittsburgh|baltimore|philadelphia|boston|minneapolis|milwaukee|columbus ohio|fort lauderdale|delray beach|west palm beach|fort myers|jacksonville|tampa|charlotte|raleigh|austin|san antonio|san diego|sacramento|salt lake|new orleans|louisville|buffalo|rochester ny|albany ny|providence|hartford|richmond va|norfolk|virginia beach|charleston sc|savannah|birmingham al|little rock|knoxville|chattanooga|asheville|boise|spokane|tucson|albuquerque|el paso|bronx|brooklyn|queens|manhattan|harlem|staten island|\bnyc\b|new york city|\bnew york\b|sonoma(?:\s+county)?)\b/i;

/**
 * Explicit US state after a comma that is not MO/KS (home market).
 * Requires the comma form ("Delray Beach, FL" / "Sonoma County, California")
 * to avoid matching prose like "in Kansas City".
 */
const NON_HOME_STATE_EVIDENCE_RE =
  /,\s*(?:A[LKZR]|C[AOT]|D[CE]|F[LM]|G[AU]|HI|I[ADLN]|K[YE]|LA|M[ADEHINPST]|N[CDEHJMVY]|O[HKR]|P[ARW]|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY]|DC|Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming|District\s+of\s+Columbia)\b/i;

/** "City, MO|KS" where the city is not a KC metro locality (e.g. Springfield, MO). */
const HOME_STATE_CITY_RE = /\b([A-Za-z][A-Za-z .'-]{1,40}),\s*(MO|KS)\b/i;

const LENEXA_RE = /\blenexa\b/i;

export function isKcMetroLocation(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return KC_METRO_RE.test(text);
}

function isKcMetroCityName(city: string): boolean {
  const trimmed = city.replace(/\s+/g, ' ').trim();
  if (!trimmed) return false;
  if (isKcMetroLocation(trimmed)) return true;
  return KC_METRO_CITY_NAME_RE.test(trimmed);
}

/**
 * True when text has confident structured evidence of a place outside the KC metro.
 * Does not guess on ambiguous bare city names or venue-only labels.
 *
 * Foreign `City, ST` / full non-home state after a comma is place-authoritative and is
 * not masked by KC team/brand tokens in the same string (e.g. "Sporting KC … Seattle, WA").
 * Distinctive OOM city tokens still lose to a clear KC-metro signal when both appear
 * without a foreign state (keeps "Chicago-style … in Kansas City" in-market).
 */
export function isOutOfMarketLocation(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  // Place authority: explicit non-home state wins over "KC" / "Kansas City" brand tokens.
  if (NON_HOME_STATE_EVIDENCE_RE.test(text)) return true;
  if (isKcMetroLocation(text)) return false;
  if (OUT_OF_MARKET_RE.test(text)) return true;
  const homeState = text.match(HOME_STATE_CITY_RE);
  if (homeState?.[1] && !isKcMetroCityName(homeState[1])) return true;
  return false;
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
