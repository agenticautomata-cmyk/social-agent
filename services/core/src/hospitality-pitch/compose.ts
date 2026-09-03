/**
 * Hospitality pitch composition.
 *
 * The old drafting path produced generic pitches because of what it was fed, not
 * because of how it was asked. It received a truncated inventory listing, a
 * template-selected "angle", and a follower band the voice rules forced it to use. No
 * compensation, no deliverables, no media kit, no evidence. A better prompt over those
 * inputs would still have produced a generic pitch.
 *
 * So this module inverts the responsibility. Everything a pitch asserts is assembled
 * here from verified facts first; the model's only job is to write those facts in
 * Kellie's voice. If a required fact is missing, composition refuses rather than
 * inventing a bridge — and the refusal names what is missing.
 */

import {
  assessCompensation,
  maxReasonableDeliverables,
  type CompensationComponent,
  type CompensationState,
} from '../partnership-contracts/compensation.js';
import { formatAudienceLine, type PitchAudienceEvidence } from './creator-evidence.js';

export type PitchDeliverable = {
  /** e.g. "one in-feed TikTok video". Plain, countable, no jargon. */
  description: string;
  /** True when this is contingent on something, e.g. rights beyond organic use. */
  conditional?: boolean;
};

export type PitchEvidenceItem = {
  /** The fact itself, stated as Benson knows it. */
  fact: string;
  /** Where it came from. Required — a fact with no source cannot go in a pitch. */
  sourceUrl: string;
  observedAt: string | null;
};

export type PitchBrief = {
  businessName: string;
  /** The specific property or outlet, when narrower than the business. */
  propertyName: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  /** "media", "press", etc. — the label the business itself published. */
  recipientLabel: string | null;
  /**
   * The dated, current reason to write this week. Required.
   *
   * `headline` is the hook itself — the event name and date. `description` adds the
   * supporting detail for the model's context. They are separate because a good pitch
   * leads with the headline and may legitimately leave the rest out, so the rubric has
   * to check for the headline rather than for the whole blob.
   */
  whyNow: {
    headline: string;
    description: string;
    date: string | null;
    sourceUrl: string;
  } | null;
  /** ONE tailored concept. A list of options is a sign nothing was decided. */
  concept: { headline: string; detail: string } | null;
  deliverables: PitchDeliverable[];
  compensationOffered: CompensationComponent[];
  compensationRequested: CompensationComponent[];
  compensationState: CompensationState;
  estimatedExperienceCostUsd: number | null;
  audience: PitchAudienceEvidence;
  mediaKitUrl: string | null;
  evidence: PitchEvidenceItem[];
  /** Terms Kellie should weigh, surfaced not decided — e.g. Loews' UGC licence. */
  termsToWeigh: string[];
  /** Prior relationship context that should change the tone. */
  priorRelationshipNote: string | null;
  /** True when this is a follow-up rather than a first approach. */
  isFollowUp: boolean;
  /** For a follow-up, the original subject so the thread reads sensibly. */
  originalSubject: string | null;
};

export type ComposeRefusal = {
  ok: false;
  /** What is missing, addressed to the operator. Never shown to a business. */
  missing: string[];
  summary: string;
};

export type ComposedPitch = {
  ok: true;
  subject: string;
  body: string;
  /** The facts this pitch asserts, so a reviewer can check each one. */
  assertedFacts: PitchEvidenceItem[];
  compensationSummary: string;
  /** What Kellie is asking for, separate from what was offered. */
  askSummary: string;
  deliverables: string[];
  termsToWeigh: string[];
};

export type ComposeResult = ComposedPitch | ComposeRefusal;

/**
 * Phrases that mark a pitch as machine-written or unsupported. Checked against the
 * OUTPUT, so a model that slips is caught rather than trusted.
 */
export const BANNED_PITCH_PHRASES: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\bI hope this (?:message|email) finds you well\b/i, why: 'form-letter opener' },
  { pattern: /\bI hope you(?:'re| are) doing well\b/i, why: 'form-letter opener' },
  { pattern: /\bI wanted to reach out\b/i, why: 'filler opener' },
  { pattern: /\bI(?:'m| am) reaching out\b/i, why: 'filler opener' },
  { pattern: /\bpartnership opportunit(?:y|ies)\b/i, why: 'corporate filler' },
  { pattern: /\bsynerg(?:y|ies|istic)\b/i, why: 'corporate filler' },
  { pattern: /\bleverage (?:my|your|our)\b/i, why: 'corporate filler' },
  { pattern: /\bwin-win\b/i, why: 'corporate filler' },
  { pattern: /\bexcited to connect\b/i, why: 'corporate filler' },
  { pattern: /\bcircle back\b/i, why: 'corporate filler' },
  { pattern: /\btouch base\b/i, why: 'corporate filler' },
  { pattern: /\bover \d+K followers\b/i, why: 'follower band instead of the real count' },
  { pattern: /\bhi there\b/i, why: 'anonymous greeting' },
  { pattern: /\bdear (?:sir|madam|team)\b/i, why: 'anonymous greeting' },
  {
    pattern: /\b(?:huge|massive|amazing|incredible) (?:fan|admirer)\b/i,
    why: 'unsupported flattery',
  },
  { pattern: /\byour (?:amazing|incredible|stunning) (?:brand|business)\b/i, why: 'unsupported flattery' },
  { pattern: /\bmy (?:demographic|audience) is \d+% /i, why: 'demographic claim Benson cannot verify' },
];

/**
 * Facts a pitch must have before it can be written at all. Returning these as a
 * refusal is the point: Benson writes the pitch when the evidence supports one, and
 * says exactly what is missing when it does not. It never tells Kellie to "draft a
 * pitch" and it never fills a gap with something plausible.
 */
export function checkBriefCompleteness(brief: PitchBrief): string[] {
  const missing: string[] = [];
  if (!brief.businessName.trim()) missing.push('the business name');
  if (!brief.whyNow) {
    missing.push('a current, dated reason to write to this business now');
  }
  if (!brief.concept) missing.push('one specific content concept for this business');
  if (brief.deliverables.length === 0) missing.push('what Kellie would actually deliver');
  if (brief.compensationState === 'unknown_requires_research') {
    missing.push('what compensation is being requested or offered');
  }
  if (brief.compensationRequested.length === 0 && brief.compensationOffered.length === 0) {
    missing.push('a compensation position of any kind');
  }
  if (!brief.audience.followersAvailable) {
    missing.push(
      brief.audience.unavailableReason ?? 'real audience numbers from the TikTok connector',
    );
  }
  if (brief.audience.stale) missing.push('a fresh analytics sync — the current numbers are stale');
  if (!brief.mediaKitUrl) missing.push('a real media kit to link');
  if (brief.evidence.length === 0) missing.push('at least one sourced fact to build the pitch on');
  for (const item of brief.evidence) {
    if (!item.sourceUrl.trim()) {
      missing.push(`a source for the claim "${item.fact}"`);
    }
  }
  return missing;
}

/** Deliverables trimmed to what the compensation reasonably supports. */
export function reasonableDeliverables(brief: PitchBrief): {
  deliverables: PitchDeliverable[];
  trimmedNote: string | null;
} {
  const assessment = assessCompensation({
    offered: brief.compensationOffered,
    requested: brief.compensationRequested,
    estimatedExperienceCostUsd: brief.estimatedExperienceCostUsd,
    businessName: brief.businessName,
  });
  const cap = maxReasonableDeliverables(assessment.state, assessment.isPartial);
  if (brief.deliverables.length <= cap.count) {
    return { deliverables: brief.deliverables, trimmedNote: null };
  }
  return {
    deliverables: brief.deliverables.slice(0, cap.count),
    trimmedNote: cap.guidance,
  };
}

export type PitchModelInput = {
  system: string;
  user: string;
};

/**
 * Builds the model prompt.
 *
 * Every fact is handed over explicitly and the model is told it may not add any. This
 * is the opposite of the old prompt, which described a shape and let the model fill it.
 */
export function buildPitchPrompt(brief: PitchBrief): PitchModelInput {
  const { deliverables, trimmedNote } = reasonableDeliverables(brief);
  const assessment = assessCompensation({
    offered: brief.compensationOffered,
    requested: brief.compensationRequested,
    estimatedExperienceCostUsd: brief.estimatedExperienceCostUsd,
    businessName: brief.businessName,
  });
  const audienceLine = formatAudienceLine(brief.audience);

  const system = [
    'You write partnership emails as Kellie, a Kansas City content creator, to hospitality businesses in her city.',
    '',
    'You are given every fact you may use. Use ONLY those facts.',
    'Do not add statistics, demographics, past clients, press coverage, or compliments about the business that are not in the facts.',
    'If a fact is not provided, leave that idea out entirely rather than approximating it.',
    '',
    'VOICE: Kellie writing to a person. First person, warm, direct, specific. Like a working creator who has actually been to the neighborhood, not an agency and not a template.',
    'LENGTH: 130-190 words in the body. Short paragraphs, two or three sentences each. It will be read on a phone.',
    '',
    'STRUCTURE:',
    '1. A greeting to the named person if there is one, otherwise straight into the reason for writing. Never an anonymous greeting.',
    '2. The specific, current reason you are writing to THIS business NOW. Lead with it.',
    '3. One or two sentences on who Kellie is, using the exact audience numbers given.',
    '4. The ONE concept, concretely. Not a menu of options.',
    '5. The deliverables, plainly and countably.',
    '6. The compensation request, stated plainly and without apology or hedging.',
    '7. A simple next step, and a natural close signed "Kellie".',
    '',
    'NEVER WRITE any of these, in any tense or contraction: "I hope this finds you well", "I wanted to reach out", "I am reaching out", "I\'m reaching out", "partnership opportunity", "synergy", "leverage", "win-win", "excited to connect", "circle back", "touch base", "Hi there", "Dear team".',
    'Do not announce that you are writing. Start with the thing itself — name the event or the reason in the first clause of the first sentence.',
    'When no individual name is known, open with the reason rather than a bare "Hello" or "Hi".',
    'NEVER state a follower count as a band like "over 5K followers" — use the exact number given.',
    'NEVER claim the business already agreed to anything, and never describe a discount as a gifted or hosted experience.',
    '',
    'Return JSON only: {"subject":"...","body":"..."}',
    'The subject line must be specific to this business and this reason. It must not contain the words "partnership opportunity" or "collaboration request".',
  ].join('\n');

  const facts: string[] = [];
  facts.push(`BUSINESS: ${brief.propertyName ?? brief.businessName}`);
  if (brief.propertyName && brief.propertyName !== brief.businessName) {
    facts.push(`PARENT BUSINESS: ${brief.businessName}`);
  }
  facts.push(
    `RECIPIENT: ${
      brief.recipientName
        ? `${brief.recipientName}${brief.recipientLabel ? ` (${brief.recipientLabel})` : ''}`
        : brief.recipientLabel
          ? `their ${brief.recipientLabel} inbox — no individual name is known, so do not invent one`
          : 'no name known — do not invent one'
    }`,
  );
  if (brief.whyNow) {
    facts.push(
      `WHY NOW — open with this, naming it explicitly: ${brief.whyNow.headline}${
        brief.whyNow.date ? ` (${brief.whyNow.date})` : ''
      }`,
    );
    if (brief.whyNow.description !== brief.whyNow.headline) {
      facts.push(`SUPPORTING DETAIL for the above: ${brief.whyNow.description}`);
    }
  }
  facts.push(`THE CONCEPT (use this one only): ${brief.concept?.headline}. ${brief.concept?.detail}`);
  facts.push(
    `DELIVERABLES (state exactly these): ${deliverables.map((d) => d.description).join('; ')}`,
  );
  facts.push(`COMPENSATION REQUEST: ${assessment.requestedSummary}`);
  if (brief.compensationOffered.length > 0) {
    facts.push(
      `ALREADY OFFERED BY THE BUSINESS (do not confuse with the request): ${assessment.offeredSummary}`,
    );
  }
  if (audienceLine) facts.push(`AUDIENCE (use these exact numbers): ${audienceLine}`);
  if (brief.mediaKitUrl) facts.push(`MEDIA KIT LINK (include it): ${brief.mediaKitUrl}`);
  facts.push(
    `SUPPORTING FACTS (each one is verified; you may reference them): ${brief.evidence
      .map((e) => e.fact)
      .join('; ')}`,
  );
  if (brief.priorRelationshipNote) {
    facts.push(`PRIOR RELATIONSHIP: ${brief.priorRelationshipNote}`);
  }
  if (brief.isFollowUp) {
    facts.push(
      `THIS IS A FOLLOW-UP to an earlier email${
        brief.originalSubject ? ` with the subject "${brief.originalSubject}"` : ''
      }. Keep it under 90 words, reference the original briefly, one polite nudge, no guilt.`,
    );
  }
  if (trimmedNote) {
    facts.push(`DELIVERABLE GUIDANCE: ${trimmedNote}`);
  }

  return { system, user: facts.join('\n\n') };
}

/**
 * Assembles the final pitch from the model's prose plus the deterministic parts.
 *
 * The media-kit link and the compensation summary are appended here rather than
 * trusted to the model, so a link can never be dropped or a comp figure paraphrased.
 */
export function assemblePitch(input: {
  brief: PitchBrief;
  subject: string;
  body: string;
}): ComposedPitch {
  const { deliverables } = reasonableDeliverables(input.brief);
  const assessment = assessCompensation({
    offered: input.brief.compensationOffered,
    requested: input.brief.compensationRequested,
    estimatedExperienceCostUsd: input.brief.estimatedExperienceCostUsd,
    businessName: input.brief.businessName,
  });

  let body = input.body.replace(/\r\n/g, '\n').trim();

  // The media kit link is load-bearing: without it the business cannot check Kellie
  // out, and the send-readiness gate required one. Append it if the model omitted it.
  if (input.brief.mediaKitUrl && !body.includes(input.brief.mediaKitUrl)) {
    body = `${body}\n\nMy media kit, with current numbers and recent work: ${input.brief.mediaKitUrl}`;
  }

  return {
    ok: true,
    subject: input.subject.trim(),
    body,
    assertedFacts: input.brief.evidence,
    compensationSummary: assessment.displaySummary,
    askSummary: assessment.requestedSummary,
    deliverables: deliverables.map((d) => d.description),
    termsToWeigh: input.brief.termsToWeigh,
  };
}

export function refuse(missing: string[], businessName: string): ComposeRefusal {
  return {
    ok: false,
    missing,
    summary: `Benson cannot write a pitch to ${businessName} yet — it still needs ${
      missing.length === 1 ? missing[0] : `${missing.length} things: ${missing.join(', ')}`
    }.`,
  };
}
