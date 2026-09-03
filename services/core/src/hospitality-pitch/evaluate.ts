/**
 * Pitch evaluation rubric.
 *
 * A model calling its own draft good is not verification. This module scores a
 * generated pitch against the brief it was supposed to be written from, mechanically,
 * so a claim that does not trace to a supplied fact is caught rather than believed.
 *
 * The factuality check is the important one: it looks for numbers in the output that
 * do not appear in the inputs, which is how an invented view count or a made-up
 * demographic gets through.
 *
 * Pure module.
 */

import { BANNED_PITCH_PHRASES, type PitchBrief } from './compose.js';

export type RubricDimension =
  | 'specificity'
  | 'factuality'
  | 'tone'
  | 'value_proposition'
  | 'compensation_clarity'
  | 'actionability';

export type RubricScore = {
  dimension: RubricDimension;
  /** 0-5. */
  score: number;
  findings: string[];
};

export type PitchEvaluation = {
  /** 0-30 across six dimensions. */
  total: number;
  /** True when nothing disqualifying was found and every dimension is at least 3. */
  passes: boolean;
  scores: RubricScore[];
  /** Problems serious enough to block a send regardless of score. */
  blockers: string[];
  wordCount: number;
};

/** A pitch shorter than this is thin; longer than this will not be read on a phone. */
const MIN_WORDS = 90;
const MAX_WORDS = 260;

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Numbers a pitch may legitimately contain: those present in the brief, plus small
 * counts that come from the deliverables ("one video", "3 stories").
 */
function permittedNumbers(brief: PitchBrief): Set<string> {
  const allowed = new Set<string>();
  const add = (value: string | number | null | undefined): void => {
    if (value === null || value === undefined) return;
    const text = String(value);
    for (const match of text.matchAll(/\d[\d,.]*/g)) {
      allowed.add(normalizeNumber(match[0]));
    }
  };

  add(brief.audience.followersCount);
  add(brief.audience.totalViews);
  add(brief.audience.totalEngagement);
  add(brief.audience.medianViewsPerPost);
  add(brief.audience.engagementRatePercent);
  add(brief.audience.postsWithMetrics);
  for (const claim of brief.audience.usableClaims) add(claim);
  add(brief.whyNow?.headline);
  add(brief.whyNow?.description);
  add(brief.whyNow?.date);
  add(brief.concept?.headline);
  add(brief.concept?.detail);
  for (const d of brief.deliverables) add(d.description);
  for (const c of [...brief.compensationOffered, ...brief.compensationRequested]) {
    add(c.amountUsd);
    add(c.percentOff);
    add(c.detail);
  }
  add(brief.estimatedExperienceCostUsd);
  for (const e of brief.evidence) add(e.fact);
  add(brief.mediaKitUrl);
  add(brief.propertyName);
  add(brief.businessName);
  for (const term of brief.termsToWeigh) add(term);

  // Small integers are ordinary English ("one video", "two stories", "a couple weeks").
  for (let i = 0; i <= 12; i += 1) allowed.add(String(i));
  return allowed;
}

function normalizeNumber(raw: string): string {
  return raw.replace(/[,]/g, '').replace(/\.0+$/, '');
}

/** Numbers asserted in the pitch that are not in the brief. */
export function unsupportedNumbers(text: string, brief: PitchBrief): string[] {
  const allowed = permittedNumbers(brief);
  const found: string[] = [];
  // Skip anything inside a URL — a link's digits are not a claim.
  const withoutUrls = text.replace(/https?:\/\/\S+/g, ' ');
  for (const match of withoutUrls.matchAll(/\d[\d,]*(?:\.\d+)?%?/g)) {
    const raw = match[0];
    const normalized = normalizeNumber(raw.replace('%', ''));
    if (!allowed.has(normalized)) found.push(raw);
  }
  return [...new Set(found)];
}

export function evaluatePitch(input: {
  subject: string;
  body: string;
  brief: PitchBrief;
}): PitchEvaluation {
  const { subject, body, brief } = input;
  const text = `${subject}\n${body}`;
  const lower = text.toLowerCase();
  const wordCount = words(body).length;
  const blockers: string[] = [];
  const scores: RubricScore[] = [];

  // ---------------------------------------------------------- factuality
  const factFindings: string[] = [];
  let factuality = 5;
  const unsupported = unsupportedNumbers(text, brief);
  if (unsupported.length > 0) {
    factuality -= Math.min(4, unsupported.length * 2);
    factFindings.push(
      `Asserts ${unsupported.length} number(s) not present in the brief: ${unsupported.join(', ')}.`,
    );
    blockers.push(
      `The pitch states ${unsupported.join(', ')}, which Benson cannot support from any verified fact.`,
    );
  }
  if (brief.audience.followersCount !== null) {
    const exact = brief.audience.followersCount.toLocaleString('en-US');
    const bare = String(brief.audience.followersCount);
    if (!text.includes(exact) && !text.includes(bare)) {
      factuality -= 1;
      factFindings.push('Does not state the real follower count that was supplied.');
    }
  }
  if (/\b(?:over|nearly|almost|more than)\s+\d+\s*k\b/i.test(text)) {
    factuality -= 2;
    factFindings.push('Uses a vague follower band instead of the real number.');
    blockers.push('The pitch describes Kellie\u2019s reach as a band rather than the real number.');
  }
  if (factFindings.length === 0) factFindings.push('Every number traces to a supplied fact.');
  scores.push({ dimension: 'factuality', score: clamp(factuality), findings: factFindings });

  // ---------------------------------------------------------- specificity
  const specFindings: string[] = [];
  let specificity = 0;
  // "Crossroads" is a natural way to address the Crossroads Hotel, so requiring the
  // full legal name would flag a perfectly good pitch. What matters is that the
  // distinctive part of the name is there — a pitch that only says "your hotel" is the
  // mass email this check is for.
  const businessMentioned = [brief.businessName, brief.propertyName].some((name) => {
    if (!name) return false;
    if (lower.includes(name.toLowerCase())) return true;
    const distinctive = distinctiveNameTokens(name);
    return distinctive.length > 0 && distinctive.every((token) => lower.includes(token));
  });
  if (businessMentioned) {
    specificity += 2;
    specFindings.push('Names the business.');
  } else {
    specFindings.push('Never names the business, so it reads as a mass email.');
    blockers.push('The pitch never names the business it is addressed to.');
  }
  if (brief.whyNow) {
    // Match on the headline only. Requiring words from the supporting summary would
    // fail a pitch that correctly leads with the event and date but does not recite
    // the whole event blurb.
    const hook = significantWords(brief.whyNow.headline);
    const overlap = hook.filter((w) => lower.includes(w)).length;
    if (overlap >= Math.max(1, Math.ceil(hook.length * 0.5))) {
      specificity += 2;
      specFindings.push('Leads with the specific current reason for writing.');
    } else {
      specFindings.push('Does not use the current reason for writing that was supplied.');
      blockers.push('The pitch does not mention the specific reason for contacting this business now.');
    }
  }
  if (brief.concept) {
    const conceptWords = significantWords(brief.concept.headline);
    if (conceptWords.some((w) => lower.includes(w))) {
      specificity += 1;
      specFindings.push('Describes the specific concept.');
    } else {
      specFindings.push('Does not describe the concept it was given.');
    }
  }
  scores.push({ dimension: 'specificity', score: clamp(specificity), findings: specFindings });

  // ---------------------------------------------------------- tone
  const toneFindings: string[] = [];
  let tone = 5;
  for (const banned of BANNED_PITCH_PHRASES) {
    const hit = text.match(banned.pattern);
    if (hit) {
      tone -= 2;
      toneFindings.push(`Contains a ${banned.why}: "${hit[0]}".`);
      // Name the exact phrase. A blocker reading "contains a filler opener" gives the
      // retry nothing to act on, and the model repeated the same phrase both attempts.
      blockers.push(
        `Remove the phrase "${hit[0]}" — it is a ${banned.why}. Rewrite that sentence to start with the actual reason for writing.`,
      );
    }
  }
  if (wordCount < MIN_WORDS) {
    tone -= 1;
    toneFindings.push(`Only ${wordCount} words — too thin to carry a real proposal.`);
  } else if (wordCount > MAX_WORDS) {
    tone -= 2;
    toneFindings.push(`${wordCount} words — too long to read on a phone.`);
  }
  if (!/\bkellie\b/i.test(body)) {
    tone -= 1;
    toneFindings.push('Not signed, so it does not read as a person writing.');
  }
  if (toneFindings.length === 0) toneFindings.push('Reads as a person, with no filler phrases.');
  scores.push({ dimension: 'tone', score: clamp(tone), findings: toneFindings });

  // ---------------------------------------------------------- value proposition
  const valueFindings: string[] = [];
  let value = 0;
  if (brief.deliverables.length > 0) {
    // Require most of the deliverable's content words, not just one. A single word
    // match counted "@kckellie on TikTok" as stating "one in-feed TikTok video" —
    // naming the platform Kellie is on is not the same as promising a video.
    const stated = brief.deliverables.filter((d) => {
      const needed = significantWords(d.description);
      if (needed.length === 0) return false;
      const hits = needed.filter((w) => lower.includes(w)).length;
      return hits >= Math.max(1, Math.ceil(needed.length * 0.6));
    }).length;
    if (stated > 0) {
      value += 3;
      valueFindings.push(`States ${stated} of ${brief.deliverables.length} deliverables.`);
    } else {
      valueFindings.push('Does not say what Kellie would actually deliver.');
      blockers.push('The pitch does not state any deliverable.');
    }
  }
  if (brief.audience.usableClaims.length > 0 && /\b(view|audience|follower|engagement)/i.test(body)) {
    value += 2;
    valueFindings.push('Backs the offer with real audience evidence.');
  } else {
    valueFindings.push('Does not connect the offer to Kellie\u2019s actual reach.');
  }
  scores.push({ dimension: 'value_proposition', score: clamp(value), findings: valueFindings });

  // ---------------------------------------------------------- compensation clarity
  const compFindings: string[] = [];
  let comp = 0;
  const asksForSomething =
    /\b(hosted|comp(?:ed|limentary)?|credit|fee|rate|cover|gift card|in exchange|budget)\b/i.test(
      body,
    );
  if (asksForSomething) {
    comp += 3;
    compFindings.push('States a compensation position.');
  } else {
    compFindings.push('Never says what Kellie is asking for.');
    blockers.push('The pitch never states what Kellie is asking for.');
  }
  // The rule that a discount must never be dressed up as a gift.
  const offersDiscountOnly = brief.compensationState === 'discount_only';
  if (offersDiscountOnly && /\b(hosted|comped|complimentary|gifted|on the house)\b/i.test(body)) {
    compFindings.push('Describes a discount as a hosted or gifted experience.');
    blockers.push(
      'The pitch describes a discount as a hosted or gifted experience, which is not what is on offer.',
    );
  } else if (asksForSomething) {
    comp += 2;
    compFindings.push('Does not overstate what is on offer.');
  }
  scores.push({
    dimension: 'compensation_clarity',
    score: clamp(comp),
    findings: compFindings,
  });

  // ---------------------------------------------------------- actionability
  const actionFindings: string[] = [];
  let action = 0;
  if (/\?/.test(body) || /\b(let me know|happy to|would you|are you|could we|open to)\b/i.test(body)) {
    action += 3;
    actionFindings.push('Ends with a clear, answerable next step.');
  } else {
    actionFindings.push('Gives the recipient nothing specific to reply to.');
    blockers.push('The pitch has no clear next step.');
  }
  if (brief.mediaKitUrl && body.includes(brief.mediaKitUrl)) {
    action += 2;
    actionFindings.push('Includes the media kit link.');
  } else if (brief.mediaKitUrl) {
    actionFindings.push('Omits the media kit link.');
  }
  scores.push({ dimension: 'actionability', score: clamp(action), findings: actionFindings });

  const total = scores.reduce((sum, s) => sum + s.score, 0);
  const passes = blockers.length === 0 && scores.every((s) => s.score >= 3);

  return { total, passes, scores, blockers: [...new Set(blockers)], wordCount };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(5, Math.round(value)));
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'is', 'are',
  'this', 'that', 'it', 'as', 'by', 'from', 'new', 'your', 'our', 'their', 'be', 'will',
  'has', 'have', 'about', 'into', 'over', 'one', 'up',
]);

/**
 * Generic venue words that do not identify a business. "Crossroads" identifies the
 * Crossroads Hotel; "Hotel" does not.
 */
const GENERIC_VENUE_WORDS = new Set([
  'hotel', 'hotels', 'restaurant', 'restaurants', 'bar', 'lounge', 'cafe', 'kitchen',
  'grill', 'inn', 'suites', 'resort', 'rooftop', 'the', 'company', 'group',
]);

function distinctiveNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !GENERIC_VENUE_WORDS.has(token));
}

/** Content words from a phrase, for checking whether an idea survived into the output. */
function significantWords(phrase: string): string[] {
  return [
    ...new Set(
      phrase
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
    ),
  ];
}

/** Human-readable report, for pasting into a verification write-up. */
export function formatEvaluation(evaluation: PitchEvaluation): string {
  const lines = [`Score ${evaluation.total}/30 — ${evaluation.passes ? 'PASS' : 'FAIL'}`];
  lines.push(`Body length: ${evaluation.wordCount} words`);
  for (const score of evaluation.scores) {
    lines.push(`  ${score.dimension}: ${score.score}/5`);
    for (const finding of score.findings) lines.push(`      - ${finding}`);
  }
  if (evaluation.blockers.length > 0) {
    lines.push('  Blockers:');
    for (const blocker of evaluation.blockers) lines.push(`      - ${blocker}`);
  }
  return lines.join('\n');
}
