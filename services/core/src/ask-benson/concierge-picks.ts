import { createHash } from 'node:crypto';
import type { InventorySearchMatch } from './inventory-search.js';
import type { ConciergeWebResearch } from './concierge-research.js';

export type ConciergePickOrigin = 'inventory' | 'web';

export type ConciergePickPlannerState = 'none' | 'saved' | 'planned_today';

export type ConciergePick = {
  pickId: string;
  title: string;
  summary: string | null;
  location: string | null;
  eventDate: string | null;
  eventDateLabel: string | null;
  sourceUrl: string | null;
  origin: ConciergePickOrigin;
  contentItemId: string | null;
  reviewUrl: string | null;
  plannerState: ConciergePickPlannerState;
};

function pickIdFor(input: { title: string; sourceUrl: string | null; contentItemId?: string | null }): string {
  if (input.contentItemId) return input.contentItemId;
  const key = `${input.title}|${input.sourceUrl ?? 'no-url'}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  return url.trim().replace(/\?utm_[^)]+$/i, '').replace(/&utm_[^)]+$/i, '');
}

function parseMarkdownLinkPicks(summary: string): Array<{ title: string; sourceUrl: string }> {
  const picks: Array<{ title: string; sourceUrl: string }> = [];
  const seen = new Set<string>();
  const linkRe = /\[([^\]]+)\]\((https?:[^)\s]+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(summary)) !== null) {
    const rawTitle = match[1];
    const rawUrl = match[2];
    if (!rawTitle || !rawUrl) continue;
    const title = rawTitle.replace(/&#8211;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();
    const sourceUrl = normalizeUrl(rawUrl);
    if (!title || title.length < 3 || !sourceUrl || seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    picks.push({ title, sourceUrl });
  }
  return picks;
}

function parseBoldHeadingPicks(summary: string): Array<{ title: string; summary: string | null }> {
  const picks: Array<{ title: string; summary: string | null }> = [];
  const lines = summary.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.trim() ?? '';
    const bold = line.match(/^\*\*(.+?)\*\*$/);
    if (!bold?.[1]) continue;
    const title = bold[1].replace(/\s+/g, ' ').trim();
    if (title.length < 3) continue;
    const detailParts: string[] = [];
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j += 1) {
      const next = lines[j]?.trim() ?? '';
      if (!next || next.startsWith('[') || /^\*\*.+\*\*$/.test(next)) break;
      detailParts.push(next.replace(/^\*\*|\*\*$/g, ''));
    }
    picks.push({ title, summary: detailParts.length > 0 ? detailParts.join(' · ') : null });
  }
  return picks;
}

function inventoryToPick(match: InventorySearchMatch): ConciergePick {
  return {
    pickId: match.id,
    title: match.title,
    summary: match.summary ?? match.whyItMatters,
    location: match.location ?? match.venue,
    eventDate: match.eventDate,
    eventDateLabel: match.eventDateLabel,
    sourceUrl: match.sourceUrl,
    origin: 'inventory',
    contentItemId: match.id,
    reviewUrl: match.reviewUrl,
    plannerState: 'none',
  };
}

export function buildConciergePicks(input: {
  inventoryMatches?: InventorySearchMatch[];
  webResearch?: ConciergeWebResearch | null;
  webFirst?: boolean;
}): ConciergePick[] {
  const inventoryPicks: ConciergePick[] = [];
  const webPicks: ConciergePick[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();

  for (const match of input.inventoryMatches ?? []) {
    const pick = inventoryToPick(match);
    inventoryPicks.push(pick);
    if (pick.sourceUrl) seenUrls.add(normalizeUrl(pick.sourceUrl) ?? pick.sourceUrl);
    seenTitles.add(pick.title.toLowerCase());
  }

  const summary = input.webResearch?.summary ?? '';
  const markdownPicks = summary ? parseMarkdownLinkPicks(summary) : [];
  const boldPicks = summary ? parseBoldHeadingPicks(summary) : [];

  for (const linkPick of markdownPicks) {
    if (seenUrls.has(linkPick.sourceUrl)) continue;
    const titleKey = linkPick.title.toLowerCase();
    if (seenTitles.has(titleKey)) continue;

    const bold = boldPicks.find((b) => titleKey.includes(b.title.toLowerCase().slice(0, 12)));
    seenUrls.add(linkPick.sourceUrl);
    seenTitles.add(titleKey);
    webPicks.push({
      pickId: pickIdFor(linkPick),
      title: linkPick.title,
      summary: bold?.summary ?? null,
      location: null,
      eventDate: null,
      eventDateLabel: null,
      sourceUrl: linkPick.sourceUrl,
      origin: 'web',
      contentItemId: null,
      reviewUrl: null,
      plannerState: 'none',
    });
  }

  for (const citation of input.webResearch?.citations ?? []) {
    const sourceUrl = normalizeUrl(citation.url);
    if (!sourceUrl || seenUrls.has(sourceUrl)) continue;
    const title = citation.title?.trim();
    if (!title || title.length < 3) continue;
    const titleKey = title.toLowerCase();
    if (seenTitles.has(titleKey)) continue;

    seenUrls.add(sourceUrl);
    seenTitles.add(titleKey);
    webPicks.push({
      pickId: pickIdFor({ title, sourceUrl }),
      title,
      summary: null,
      location: null,
      eventDate: null,
      eventDateLabel: null,
      sourceUrl,
      origin: 'web',
      contentItemId: null,
      reviewUrl: null,
      plannerState: 'none',
    });
  }

  const ordered = input.webFirst
    ? [...webPicks, ...inventoryPicks]
    : [...inventoryPicks, ...webPicks];

  return ordered.slice(0, 6);
}

export function applyPickPlannerState(
  picks: ConciergePick[],
  pickId: string,
  action: 'save' | 'plan_today',
): ConciergePick[] {
  return picks.map((pick) =>
    pick.pickId === pickId
      ? {
          ...pick,
          plannerState: action === 'plan_today' ? 'planned_today' : 'saved',
        }
      : pick,
  );
}

export function matchConciergePick(
  picks: ConciergePick[],
  hint?: string | null,
): ConciergePick | null {
  if (picks.length === 0) return null;
  if (!hint?.trim()) return picks[0] ?? null;

  const normalized = hint.trim().toLowerCase();
  const ordinal = normalized.match(/\b(first|1st|second|2nd|third|3rd|last)\b/);
  if (ordinal) {
    const word = ordinal[1];
    const index =
      word === 'first' || word === '1st'
        ? 0
        : word === 'second' || word === '2nd'
          ? 1
          : word === 'third' || word === '3rd'
            ? 2
            : picks.length - 1;
    return picks[index] ?? picks[0] ?? null;
  }

  const byTitle = picks.find(
    (pick) =>
      pick.title.toLowerCase().includes(normalized) ||
      normalized.includes(pick.title.toLowerCase().slice(0, 12)),
  );
  if (byTitle) return byTitle;

  return picks[0] ?? null;
}
