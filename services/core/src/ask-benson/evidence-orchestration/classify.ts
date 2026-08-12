import { createHash } from 'node:crypto';
import { extractUrls } from '../collect-from-link.js';
import { extractEmailsFromText } from '../../sponsor-outreach/contact-enrichment.js';
import { extractBrandFromProgramUrl } from '../../program-library/canonical.js';
import type { EvidenceItem, EvidenceKind } from './types.js';

const PHONE_RE =
  /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;

const OFFICIAL_FORM_PATH_RE =
  /\/(influencer|creator|ambassador|media[-_]?request|press[-_]?request|stay[-_]?request|collab|collaboration|partnership|apply)\b/i;

const REWARDS_RE =
  /\b(rewards?\s+program|loyalty\s+program|points?\s+program|member\s+rewards?|closet\s+cash|store\s+credit)\b/i;

const PROGRAM_HISTORY_RE =
  /\b(influencer\s+campaign|creator\s+campaign|parent\s+company|ran\s+(an?\s+)?influencer|previous(ly)?\s+(worked|partnered|sponsored)|campaign\s+history)\b/i;

const PITCH_CONTEXT_RE =
  /\b(pitch|sponsor(?:ship)?|outreach|collab(?:oration)?|local\s+store|overland\s+park|media\s+kit)\b/i;

const CONTACT_SIGNAL_RE =
  /\b(contact|email|reach\s+out|dm|phone|manager|owner|form)\b/i;

/** Brand-like phrases: quoted, possessives, or Title Case near evidence keywords. */
const QUOTED_NAME_RE = /["“]([^"”]{2,80})["”]/g;
const POSSESSIVE_BRAND_RE =
  /\b([A-Z][A-Za-z0-9&'’.-]*(?:'[Ss])?(?:\s+[A-Z][A-Za-z0-9&'’.-]+){0,3})\b/g;

export function hashNormalizedKey(parts: string[]): string {
  return createHash('sha256').update(parts.join('|').toLowerCase()).digest('hex').slice(0, 32);
}

export function messageExcerptHash(message: string): string {
  return createHash('sha256').update(message.trim()).digest('hex').slice(0, 24);
}

export function isOfficialIntakeFormUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return OFFICIAL_FORM_PATH_RE.test(u.pathname) || /influencer|creator-program/i.test(u.href);
  } catch {
    return false;
  }
}

function pushEvidence(
  out: EvidenceItem[],
  kind: EvidenceKind,
  value: string,
  label: string,
  confidence: number,
): void {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return;
  const normalizedKey = `${kind}:${normalized}`;
  if (out.some((e) => e.normalizedKey === normalizedKey)) return;
  out.push({ kind, value: value.trim(), normalizedKey, label, confidence });
}

export function extractBusinessNameCandidates(message: string): string[] {
  const names = new Set<string>();
  const text = message.trim();

  for (const match of text.matchAll(QUOTED_NAME_RE)) {
    const n = match[1]?.trim();
    if (n && n.length >= 2) names.add(n);
  }

  // Common retail / hotel patterns with apostrophe
  const possessiveHits = text.match(
    /\b([A-Z][A-Za-z]+(?:'s|’s)\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)\b/g,
  );
  for (const hit of possessiveHits ?? []) names.add(hit.trim());

  // "for X" / "at X" / "about X"
  const forAt = text.matchAll(
    /\b(?:for|at|about|with|re:)\s+([A-Z][A-Za-z0-9&'’.-]+(?:\s+[A-Z][A-Za-z0-9&'’.-]+){0,4})/g,
  );
  for (const m of forAt) {
    const n = m[1]?.trim();
    if (n && n.length >= 3 && !/^(The|This|That|Here|Please)$/i.test(n)) names.add(n);
  }

  // Host-derived brand from URLs (registrable domain — never help/support/www/app)
  for (const url of extractUrls(text)) {
    const brand = extractBrandFromProgramUrl(url);
    if (brand) names.add(brand);
  }

  // Title-case runs when contact/pitch signals present
  if (CONTACT_SIGNAL_RE.test(text) || PITCH_CONTEXT_RE.test(text) || REWARDS_RE.test(text)) {
    for (const m of text.matchAll(POSSESSIVE_BRAND_RE)) {
      const n = m[1]?.trim();
      if (!n || n.length < 4) continue;
      if (/^(I|We|Please|Thanks|Hello|Hi|Here|This|That|Local|Direct|Current)$/i.test(n)) continue;
      if (n.split(/\s+/).length >= 2) names.add(n);
    }
  }

  return [...names].slice(0, 8);
}

export function classifyEvidence(message: string): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  const text = message.trim();
  if (!text) return out;

  for (const email of extractEmailsFromText(text)) {
    pushEvidence(out, 'contact_email', email, 'Verified local contact email', 0.95);
  }

  const phones = text.match(PHONE_RE) ?? [];
  for (const phone of phones) {
    pushEvidence(out, 'contact_phone', phone, 'Contact phone', 0.85);
  }

  for (const url of extractUrls(text)) {
    if (isOfficialIntakeFormUrl(url)) {
      pushEvidence(out, 'official_intake_form_url', url, 'Official influencer/intake form URL', 0.95);
    }
  }

  if (REWARDS_RE.test(text)) {
    const snippet = text.match(/[^.!?\n]*(?:rewards?|loyalty|closet\s+cash|points?)[^.!?\n]*/i)?.[0]?.trim();
    pushEvidence(
      out,
      'rewards_program',
      snippet || 'Local rewards program details supplied',
      'Local rewards program',
      0.8,
    );
  }

  if (PROGRAM_HISTORY_RE.test(text)) {
    const snippet = text.match(/[^.!?\n]*(?:influencer|creator|campaign|parent)[^.!?\n]*/i)?.[0]?.trim();
    pushEvidence(
      out,
      'program_history',
      snippet || 'Parent/influencer campaign history supplied',
      'Parent influencer-campaign history',
      0.8,
    );
  }

  if (PITCH_CONTEXT_RE.test(text) && (out.length > 0 || CONTACT_SIGNAL_RE.test(text))) {
    pushEvidence(out, 'pitch_context', 'Pitch context supplied by operator', 'Pitch context', 0.7);
  }

  // Free-form verified facts when we already have contact/form evidence
  if (out.some((e) => e.kind === 'contact_email' || e.kind === 'official_intake_form_url')) {
    const factLines = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 12 && l.length < 280 && !/^https?:\/\//i.test(l));
    for (const line of factLines.slice(0, 4)) {
      if (extractEmailsFromText(line).length) continue;
      pushEvidence(out, 'verified_fact', line, 'Operator-supplied fact', 0.65);
    }
  }

  return out;
}

export function shouldAttemptEvidenceOrchestration(message: string): boolean {
  const evidence = classifyEvidence(message);
  if (evidence.length === 0) return false;
  // Need at least one durable signal (contact / form / program) — not pitch_context alone
  return evidence.some((e) =>
    ['contact_email', 'contact_phone', 'official_intake_form_url', 'rewards_program', 'program_history'].includes(
      e.kind,
    ),
  );
}

export function evidenceIsActionableForDraft(evidence: EvidenceItem[]): boolean {
  return evidence.some((e) => e.kind === 'contact_email' || e.kind === 'official_intake_form_url');
}
