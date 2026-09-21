import { parseOpeningDateLanguage, pickBestOpeningDate } from './dates.js';
import type { OpeningLifecycleStatus, OpeningDateInfo, ParsedOpeningEntry } from './types.js';

const ADDRESS_RE =
  /\b(\d{2,5}\s+(?:[NSEW]\.?\s*[NSEW]?\.?\s+)?(?:\d+(?:st|nd|rd|th)\s+)?(?:[A-Z][a-z0-9.'-]+\s+){0,5}(?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Parkway|Pkwy\.?|Highway|Hwy\.?|Broadway|Pennsylvania|Main|Grand|Oak|Walnut|Mock)\.?)\b/i;

const SUITE_RE = /\b(?:Suite|Ste\.?|Unit|#)\s*([A-Za-z0-9-]+)\b/i;

const CITY_RE =
  /\b(Overland Park|Olathe|Lenexa|Leawood|Prairie Village|Blue Springs|Independence|Lee'?s Summit|Shawnee|Kansas City|OP)\b/i;

const NEIGHBORHOOD_RE =
  /\b(Westport|Crossroads|Plaza|Country Club Plaza|Crown Center|Brookside|Power & Light|River Market|Waldo|Prairiefire|The Vine|Northland|Midtown|Downtown)\b/i;

const CATEGORY_HINTS: Array<{ re: RegExp; category: string }> = [
  { re: /\bice cream\b/i, category: 'dessert' },
  { re: /\bjazz bar\b|\bbar\b|\bizakaya\b|\bnightlife\b/i, category: 'bars/nightlife' },
  { re: /\bmahjong\b|\bevent center\b|\bentertainment\b/i, category: 'entertainment' },
  { re: /\bseafood\b|\bchicken\b|\brestaurant\b|\bdining\b/i, category: 'restaurants' },
  { re: /\bdonut\b|\bbakery\b/i, category: 'dessert' },
  { re: /\bretail\b|\bboutique\b|\bcollective\b|\bfleet feet\b|\bstore\b/i, category: 'retail' },
  { re: /\bfast food\b|\bfried chicken\b/i, category: 'restaurants' },
];

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function looksLikeBusinessName(name: string): boolean {
  const n = name.trim();
  if (n.length < 2 || n.length > 80) return false;
  if (/^(opening|coming|closed|closings|now open|thanks|subscribe|photo by)\b/i.test(n)) return false;
  if (!/[A-Za-z]/.test(n)) return false;
  return true;
}

function inferCategory(blob: string): string | null {
  for (const h of CATEGORY_HINTS) {
    if (h.re.test(blob)) return h.category;
  }
  return null;
}

function inferStatus(blob: string): OpeningLifecycleStatus {
  if (/\bcancel(?:led|ed)\b/i.test(blob)) return 'canceled';
  if (/\bdelay(?:ed|ing)\b/i.test(blob)) return 'delayed';
  if (/\bsoft(?:ly)?\s+open/i.test(blob) && /\bgrand opening\b/i.test(blob)) {
    return 'grand_opening_scheduled';
  }
  if (/\bsoft(?:ly)?\s+open/i.test(blob)) return 'soft_open';
  if (/\bgrand opening\b/i.test(blob)) return 'grand_opening_scheduled';
  if (/\bnow open\b|\bopened\b/i.test(blob) && !/\bopening soon\b|\bplans? (?:to |an )?open/i.test(blob)) {
    return 'open';
  }
  if (/\brelocati/i.test(blob)) return 'relocated';
  if (/\bexpanding\b|\bother (?:area )?locations? pending\b/i.test(blob)) return 'expanding';
  if (/\bopening soon\b|\bcoming soon\b/i.test(blob)) return 'opening_soon';
  if (/\bunder construction\b|\bbuild-?out\b/i.test(blob)) return 'under_construction';
  if (ADDRESS_RE.test(blob)) return 'site_identified';
  if (/\brumor/i.test(blob)) return 'rumored';
  return 'announced';
}

function extractAddressParts(blob: string): {
  streetAddress: string | null;
  suite: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  neighborhood: string | null;
} {
  const addrMatch = blob.match(ADDRESS_RE);
  let streetAddress = addrMatch ? normalizeWhitespace(addrMatch[1]!) : null;
  const suiteMatch = blob.match(SUITE_RE);
  const suite = suiteMatch ? suiteMatch[1]! : null;
  // Sometimes suite is glued onto address line
  if (streetAddress && /,\s*Suite/i.test(streetAddress)) {
    const parts = streetAddress.split(/,\s*Suite/i);
    streetAddress = normalizeWhitespace(parts[0]!);
  }
  const cityMatch = blob.match(CITY_RE);
  let city = cityMatch ? cityMatch[1]! : null;
  if (city === 'OP') city = 'Overland Park';
  const neighborhoodMatch = blob.match(NEIGHBORHOOD_RE);
  const neighborhood = neighborhoodMatch ? neighborhoodMatch[1]! : null;
  const stateMatch = blob.match(/\b(MO|KS|Missouri|Kansas)\b/);
  let state: string | null = null;
  if (stateMatch) {
    const s = stateMatch[1]!.toLowerCase();
    state = s.startsWith('k') ? 'KS' : s.startsWith('m') && s !== 'may' ? 'MO' : stateMatch[1]!;
    if (state === 'Missouri') state = 'MO';
    if (state === 'Kansas') state = 'KS';
  } else if (city && /Olathe|Overland Park|Lenexa|Leawood|Shawnee|Prairie Village/i.test(city)) {
    state = 'KS';
  } else if (city || neighborhood) {
    state = 'MO';
  }
  const zipMatch = blob.match(/\b(\d{5})(?:-\d{4})?\b/);
  return {
    streetAddress,
    suite,
    city,
    state,
    zip: zipMatch ? zipMatch[1]! : null,
    neighborhood,
  };
}

function extractDates(blob: string, yearHint?: number): {
  estimated: OpeningDateInfo;
  grand: OpeningDateInfo;
  soft: OpeningDateInfo;
} {
  const softBlob = blob.match(/soft(?:ly)?\s+open[^.!\n]{0,80}/i)?.[0] ?? '';
  const grandBlob = blob.match(/grand opening[^.!\n]{0,80}/i)?.[0] ?? '';

  const soft = softBlob
    ? parseOpeningDateLanguage(softBlob, yearHint)
    : { label: null, exactDate: null, precision: 'unknown' as const };
  const grand = grandBlob
    ? parseOpeningDateLanguage(grandBlob, yearHint)
    : { label: null, exactDate: null, precision: 'unknown' as const };
  // Parse the full entry blob so mid-/early-/late- phrases beat earlier Halloween mentions
  const estimated = pickBestOpeningDate(
    parseOpeningDateLanguage(blob, yearHint),
    grand,
    soft,
  );

  // Soft open without exact date — label only
  if (/\bsoft(?:ly)?\s+open/i.test(blob) && !soft.label) {
    return {
      estimated,
      grand,
      soft: { label: 'soft open', exactDate: null, precision: 'vague' },
    };
  }

  return { estimated, grand, soft };
}

function buildEntry(businessName: string, detail: string, yearHint?: number): ParsedOpeningEntry | null {
  const name = normalizeWhitespace(
    businessName
      .replace(/^[\d.)\-•*]+\s*/, '')
      .replace(/[—–-]\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  if (!looksLikeBusinessName(name)) return null;

  const blob = `${name}. ${detail}`;
  const addr = extractAddressParts(blob);
  const dates = extractDates(blob, yearHint);
  const status = inferStatus(blob);

  const relocation =
    blob.match(/\brelocati(?:on|ng|ed)\s+from\s+([^.!\n]{3,60})/i)?.[1]?.trim() ??
    (/\brelocati/i.test(blob) ? 'relocation' : null);
  const formerTenant =
    blob.match(/\bformer\s+([A-Z][^.\n,]{2,50}?)\s+(?:space|location|restaurant|bar)/i)?.[1]?.trim() ??
    blob.match(/\bformer\s+([A-Z][A-Za-z0-9&.'\-\s]{2,40})\b/i)?.[1]?.trim() ??
    null;
  const expansion = /\bother (?:area )?locations? pending\b|\bexpanding\b|\badditional locations?\b/i.test(blob)
    ? normalizeWhitespace(blob.match(/other (?:area )?locations? pending[^.!\n]{0,60}/i)?.[0] ?? 'expansion planned')
    : null;
  const isLocal = /\blocally owned\b|\bindependent\b/i.test(blob)
    ? true
    : /\bchain\b|\barea locations\b/i.test(blob)
      ? false
      : null;
  const isChain =
    isLocal === false ? true : /\bchain\b|\bfranchise\b|\barea locations\b/i.test(blob) ? true : null;

  const fieldConfidence: Record<string, number> = {
    businessName: 0.9,
    streetAddress: addr.streetAddress ? 0.85 : 0,
    city: addr.city ? 0.8 : 0,
    estimatedOpening: dates.estimated.label ? 0.8 : 0,
  };

  return {
    businessName: name,
    parentBrand: null,
    isLocalIndependent: isLocal,
    isChain,
    category: inferCategory(blob),
    description: normalizeWhitespace(detail).slice(0, 400) || null,
    streetAddress: addr.streetAddress,
    suite: addr.suite,
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    neighborhood: addr.neighborhood,
    status,
    estimatedOpening: dates.estimated,
    grandOpening: dates.grand,
    softOpening: dates.soft,
    relocationStatus: relocation,
    expansionStatus: expansion,
    formerLocation: relocation && relocation !== 'relocation' ? relocation : null,
    formerTenant,
    additionalLocationsPlanned: expansion,
    evidenceText: normalizeWhitespace(blob).slice(0, 500),
    confidence: Math.min(
      0.95,
      0.45 +
        (addr.streetAddress ? 0.2 : 0) +
        (dates.estimated.label ? 0.15 : 0) +
        (addr.city || addr.neighborhood ? 0.1 : 0),
    ),
    fieldConfidence,
  };
}

/**
 * Split numbered / bulleted / heading-style roundup blocks into entry chunks.
 */
export function splitRoundupBlocks(text: string): Array<{ name: string; detail: string }> {
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n');

  const lines = cleaned.split('\n');
  const blocks: Array<{ name: string; detail: string }> = [];

  // Numbered list: "1. Name" / "1) Name"
  const numberStarts: Array<{ idx: number; name: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^\s*(\d{1,2})[.)]\s+(.+)$/);
    if (m) {
      const head = normalizeWhitespace(m[2]!);
      const split = head.split(/\s+[—–]\s+/);
      numberStarts.push({ idx: i, name: (split[0] ?? head).trim() });
    }
  }

  if (numberStarts.length >= 1) {
    for (let n = 0; n < numberStarts.length; n++) {
      const start = numberStarts[n]!;
      const end = numberStarts[n + 1]?.idx ?? lines.length;
      const headLine = lines[start.idx]!.replace(/^\s*\d{1,2}[.)]\s+/, '');
      const split = normalizeWhitespace(headLine).split(/\s+[—–]\s+/);
      const name = (split[0] ?? headLine).trim();
      const detailParts = [split.slice(1).join(' — ')];
      for (let j = start.idx + 1; j < end; j++) {
        const raw = lines[j]!.trim();
        if (!raw) continue;
        detailParts.push(raw.replace(/^[-–•*]\s*/, ''));
      }
      if (looksLikeBusinessName(name)) {
        blocks.push({ name, detail: detailParts.filter(Boolean).join('. ') });
      }
    }
    if (blocks.length >= 1) return blocks;
  }

  // Bullet list
  const bulletIdxs: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*[-–•*]\s+[A-Z]/.test(lines[i]!)) bulletIdxs.push(i);
  }
  if (bulletIdxs.length >= 3) {
    for (let n = 0; n < bulletIdxs.length; n++) {
      const i = bulletIdxs[n]!;
      const line = normalizeWhitespace(lines[i]!.replace(/^\s*[-–•*]\s+/, ''));
      const parts = line.split(/\s+[—–:-]\s+/);
      blocks.push({ name: parts[0]!, detail: parts.slice(1).join(' — ') || line });
    }
    if (blocks.length >= 2) return blocks;
  }

  // Heading-style: Title Case name line followed by detail lines
  const trimmed = lines.map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < trimmed.length; i++) {
    const line = trimmed[i]!;
    if (
      /^[A-Z0-9]/.test(line) &&
      line.length < 80 &&
      !/\.$/.test(line) &&
      !/^(Opening|Coming|Closed|Thanks|Subscribe|Photo|The BIG|Your roundup|By Joyce)/i.test(line) &&
      (ADDRESS_RE.test(trimmed[i + 1] ?? '') ||
        /opening|open|soon|planned|relocati|former|suite/i.test(trimmed[i + 1] ?? ''))
    ) {
      const detailParts: string[] = [];
      let j = i + 1;
      while (j < trimmed.length && j < i + 8) {
        const next = trimmed[j]!;
        if (
          /^[A-Z0-9]/.test(next) &&
          next.length < 80 &&
          !/\.$/.test(next) &&
          (ADDRESS_RE.test(trimmed[j + 1] ?? '') || /opening|open|soon/i.test(trimmed[j + 1] ?? ''))
        ) {
          break;
        }
        detailParts.push(next);
        j++;
      }
      blocks.push({ name: line.replace(/\s+[—–-]\s+.*/, '').trim(), detail: detailParts.join(' ') });
      i = j - 1;
    }
  }

  return blocks;
}

/**
 * General editorial roundup parser for establishment openings.
 * Does not hard-code business names. Returns one entry per distinct establishment block.
 */
export function parseOpeningRoundup(input: {
  subject?: string;
  text: string;
  publicationYear?: number;
}): ParsedOpeningEntry[] {
  const subject = input.subject ?? '';
  const text = input.text;
  const yearHint =
    input.publicationYear ??
    (Number(subject.match(/\b(20\d{2})\b/)?.[1]) ||
      Number(text.match(/\b(20\d{2})\b/)?.[1]) ||
      new Date().getFullYear());

  const isOpeningsContext =
    /\b(opening|openings|who.?s opening|coming soon|grand opening|soft open|relocati|expansion|development)\b/i.test(
      `${subject}\n${text.slice(0, 500)}`,
    );

  if (!isOpeningsContext && !/\b\d{1,2}[.)]\s+[A-Z]/.test(text)) {
    return [];
  }

  const blocks = splitRoundupBlocks(text);
  const byKey = new Map<string, ParsedOpeningEntry>();

  for (const block of blocks) {
    // Skip closing-only sections
    if (/\b(closed|closings|closing)\b/i.test(block.name) && !/opening/i.test(block.detail)) {
      continue;
    }
    const entry = buildEntry(block.name, block.detail, yearHint);
    if (!entry) continue;
    // Require some location or date signal for roundup entries
    if (
      !entry.streetAddress &&
      !entry.city &&
      !entry.neighborhood &&
      !entry.estimatedOpening.label &&
      !entry.grandOpening.label
    ) {
      continue;
    }
    const key = entry.businessName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const existing = byKey.get(key);
    if (!existing || entry.confidence > existing.confidence) {
      byKey.set(key, entry);
    }
  }

  // Prose fallback: "Name is opening at Address" sentences when list parse is thin
  if (byKey.size < 2) {
    const proseRe =
      /\b([A-Z][A-Za-z0-9&.'’\-]*(?:\s+(?:&|Co\.?|The|[A-Z][A-Za-z0-9&.'’\-]*)){0,6})\s+(?:is |are |has |have |plans? (?:a |an |to )?)?(?:opening|opens|opened|softly opened|relocating|expanding)\b([^.!\n]{10,180})/g;
    let m: RegExpExecArray | null;
    while ((m = proseRe.exec(text)) !== null) {
      const entry = buildEntry(m[1]!, m[0]!, yearHint);
      if (!entry) continue;
      if (!entry.streetAddress && !entry.estimatedOpening.label) continue;
      const key = entry.businessName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!byKey.has(key)) byKey.set(key, entry);
    }
  }

  return [...byKey.values()];
}

export function isOpeningRoundupDocument(subject: string, text: string): boolean {
  const blob = `${subject}\n${text.slice(0, 1500)}`;
  if (/\b(who.?s opening|big list|openings?,?\s+closings?|coming soon|restaurant and retail openings)\b/i.test(blob)) {
    return true;
  }
  const numbered = (text.match(/(?:^|\n)\s*\d{1,2}[.)]\s+[A-Z]/g) ?? []).length;
  return numbered >= 3 && /\b(opening|open|address|st\.|ave)\b/i.test(text);
}
