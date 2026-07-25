import { BENSON_PERSONALITY_CORE } from '../../benson-personality/index.js';
import { normalizeCreatorNameInText } from '../../creator-display.js';

/** Phrases that make sponsor emails read like generic AI — strip if the model slips. */
const BANNED_INLINE_PATTERNS: RegExp[] = [
  /\bI hope this (?:message|email) finds you well\.?\s*/gi,
  /\bI hope you(?:'re| are) doing well\.?\s*/gi,
  /\bI wanted to reach out(?: to you)?(?: regarding| about)?\.?\s*/gi,
  /\bI am reaching out(?: to you)?(?: regarding| about)?\.?\s*/gi,
  /\bI'm reaching out(?: to you)?(?: regarding| about)?\.?\s*/gi,
  /\bI came across your (?:business|brand|company)(?: online)?\.?\s*/gi,
  /\bI stumbled upon your (?:business|brand|company)\.?\s*/gi,
  /\bI would love to (?:connect|collaborate|partner with you)\.?\s*/gi,
  /\b(?:Excited|Thrilled) to connect\.?\s*/gi,
  /\b(?:Leverage|Utilize) (?:our|your) (?:audience|platform)\.?\s*/gi,
  /\b(?:Synergy|Win-win) (?:opportunity|partnership)\.?\s*/gi,
  /\bAs a (?:content creator|influencer),?\s*/gi,
  /\bI am a Kansas City creator sharing local dining, events, and lifestyle with an engaged KC audience\.?\s*/gi,
];

const BANNED_OPENING_LINES = [
  /^hi there,?\s*$/i,
  /^hello there,?\s*$/i,
  /^hey there,?\s*$/i,
  /^dear (?:sir|madam|team),?\s*$/i,
  /^good (?:morning|afternoon|evening),?\s*$/i,
  /^i hope this (?:message|email) finds you well\.?\s*$/i,
  /^i hope you(?:'re| are) doing well\.?\s*$/i,
];

export const OUTREACH_EMAIL_VOICE_RULES = `TASK: Draft a sponsor outreach email for Kellie (KC lifestyle creator on TikTok) to review before send.

VOICE: Kellie herself — warm, direct, local, human. First person ("I"). Sounds like a real KC creator texting a business owner, not a marketing agency or ChatGPT.

LENGTH: 100–180 words in the body. Short paragraphs (1–3 sentences each).

STRUCTURE:
1. Open with a specific hook — their opening, sale, event, neighborhood, or something from opportunity context. No form-letter greeting.
2. One sentence on audience fit — use creatorStats.followerDescriptor (e.g. "over 5K followers"); NEVER quote exact follower counts like "5,283 followers".
3. Include your TikTok handle from creatorStats.handle in the body (e.g. "I'm @kckellie on TikTok") — sponsors need to look you up.
4. One concrete collaboration idea from pitchAngle / sponsorshipAsk.
5. Soft close — who handles partnerships, or a quick call this week.

OPENINGS — examples:
- Good: "Your Leawood estate sale caught my eye — I film KC shopping hauls and my viewers live for finds like this."
- Good: "Hey Maria — congrats on the Crossroads opening. I cover new KC spots for couples and tourists."
- Good: "Quick note — I run a KC lifestyle TikTok and Do Good Co. keeps showing up in my weekend recs."
- Bad: "Hi there, I hope this message finds you well. I wanted to reach out regarding a partnership opportunity."

GREETING:
- If contactName is set, use their first name naturally ("Hey Sarah —" or "Hi Maria,").
- If no contactName, skip "Hi there" entirely — lead with the business name or hook ("Your Crossroads opening —" / "Quick note about Maj-R Thrift —").
- Never use: Hi there, Hello there, Dear team, Good morning, I hope this finds you well.

SIGN-OFF: "— Kellie" or "Thanks,\\nKellie" — not Best regards, Warmly, Sincerely.

SUBJECT: Specific and human — reference their business, event, or angle. Not "Partnership Opportunity" alone.

HARD BANS (never write these):
- Hi there / Hello there / Hey there
- I hope this message finds you well / I hope you're doing well
- I wanted to reach out / I am reaching out / I'm reaching out
- Partnership opportunity / synergy / leverage / excited to connect
- Generic creator intro ("I'm a Kansas City creator sharing local dining...")
- Exact follower counts or quoted stats ("5,283 followers", "5,300 followers") — use creatorStats.followerDescriptor instead ("over 5K followers")
- Spelling the creator's name as Kelly — always Kellie
- World Cup / FIFA / visitor-economy soccer hooks — KC tournament matches ended July 2026; pitch current local angles instead
- Do not claim the email was sent or that they already agreed.
- Do not invent follower counts, view counts, or press coverage.`;

export function buildOutreachSystemPrompt(options?: { kind?: 'pitch' | 'follow_up' }): string {
  const kind = options?.kind ?? 'pitch';
  const taskExtra =
    kind === 'follow_up'
      ? '\nFOLLOW-UP: Reference the original subject briefly. Keep it shorter (under 90 words). No guilt trip — one polite bump with the same specific hook.'
      : '';

  return `${BENSON_PERSONALITY_CORE}

${OUTREACH_EMAIL_VOICE_RULES}${taskExtra}

Return JSON only: {"subject":"...","body":"...","reasoning":"..."}`;
}

export function sanitizeOutreachEmail(text: string): string {
  let out = text.replace(/\r\n/g, '\n').trim();

  const lines = out.split('\n');
  while (lines.length > 0 && BANNED_OPENING_LINES.some((re) => re.test(lines[0]!.trim()))) {
    lines.shift();
  }
  out = lines.join('\n').trim();

  out = out.replace(/^hi there,?\s*\n?/i, '');
  out = out.replace(/^hello there,?\s*\n?/i, '');
  out = out.replace(/^hey there,?\s*\n?/i, '');

  for (const pattern of BANNED_INLINE_PATTERNS) {
    out = out.replace(pattern, '');
  }

  // Exact follower counts → banded language
  out = out.replace(
    /\b(?:with\s+)?[\d,]+\s+followers?\s+on\s+TikTok\b/gi,
    'with over 5K followers on TikTok',
  );
  out = out.replace(/\bI have\s+[\d,]+\s+followers?\b/gi, 'I have over 5K followers');
  out = out.replace(/\b[\d,]+\s+followers?\s+on\s+TikTok\b/gi, 'over 5K followers on TikTok');

  // Stale World Cup hooks in pitches
  out = out.replace(/\bwith the World Cup[^.!?\n]*/gi, '');
  out = out.replace(/\bWorld Cup[^.!?\n]*(visitor|soccer|watch.?party|tournament)[^.!?\n]*/gi, '');
  out = out.replace(/\bWC26[^.!?\n]*/gi, '');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return normalizeCreatorNameInText(out);
}

export function sanitizeOutreachDraft(input: {
  subject: string;
  body: string;
}): { subject: string; body: string } {
  return {
    subject: sanitizeOutreachEmail(input.subject),
    body: sanitizeOutreachEmail(input.body),
  };
}
export function outreachGreetingName(contactName: string | null | undefined, businessName: string): string {
  const trimmed = contactName?.trim();
  if (trimmed) return trimmed.split(/\s+/)[0] ?? trimmed;
  return `${businessName} team`;
}
