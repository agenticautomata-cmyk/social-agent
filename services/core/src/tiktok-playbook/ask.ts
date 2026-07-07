import OpenAI from 'openai';
import { env } from '../env.js';
import { BENSON_PERSONALITY_CORE } from '../benson-personality/prompt.js';
import { searchPlaybookForQuestion, type PlaybookSearchHit } from './search.js';
import { buildPlaybookCoachContext, type PlaybookCoachContext } from './context.js';
import { getPlaybookChecklistBySlug } from './checklists.js';
import type { PlaybookCapability, ScriptFormat } from './constants.js';

export type PlaybookAskRequest = {
  question: string;
  capability?: PlaybookCapability;
  sourceSlug?: string | null;
  scriptFormat?: ScriptFormat | null;
  imageDataUrl?: string | null;
};

export type PlaybookSourceRef = {
  sourceName: string;
  documentTitle: string;
  pageNumber: number | null;
  sectionTitle: string | null;
};

export type PlaybookAskResponse = {
  answer: string;
  sources: PlaybookSourceRef[];
  groundedInPlaybook: boolean;
  usedGeneralStrategy: boolean;
  usedAnalytics: boolean;
  capability: PlaybookCapability;
};

const COACH_RULES = `You are Benson, Kellie's TikTok Creator Coach (TikTok Creator Playbook mode).

Voice: practical creator coach — warm, direct, KC-aware. Not a marketing textbook. Short actionable bullets and numbered steps.

Knowledge priority:
1. Official TikTok playbook excerpts (Academy, Creator Tools, Studio, Search Insights, Creative Center, Ads best practices).
2. Kellie's analytics snapshot when provided and trustworthy.
3. General creator strategy — ONLY when excerpts/analytics don't cover it. Label clearly: "General creator strategy:"

Rules:
- Prefer official TikTok sources; cite document/section when from excerpts.
- Do not guarantee virality or views.
- Do not invent TikTok features not in excerpts.
- Hashtags: 3–5 relevant tags, no stuffing, no unrelated viral tags.
- Hooks: first 1–2 seconds, specific not vague.
- Captions in Kellie's voice: conversational, Kansas City local when relevant, not corporate.
- When analytics.canTrustLiveMetrics is false, say so and avoid precise performance claims.
- Tie posting-time advice to recommendedPostTimes when present.
- Sponsor content: remind about disclosure when relevant.
- Keep answers concise — Kellie may be filming.`;

const CAPABILITY_GUIDANCE: Record<PlaybookCapability, string> = {
  general: 'Answer the TikTok coaching question practically.',
  'improve-hook': 'Analyze the idea and give 3 stronger hooks with why each works in the first 1–2 seconds.',
  'rewrite-caption': 'Rewrite in Kellie\'s voice. Keep line breaks. Strong first line for Search.',
  'tiktok-seo': 'Suggest searchable phrases, on-screen text, and caption keywords people actually type.',
  hashtags: 'Suggest 3–5 hashtags with one-line rationale each. No stuffing.',
  'posting-times': 'Recommend posting windows using Kellie\'s analytics recommendedPostTimes first.',
  'studio-metrics': 'Explain TikTok Studio / analytics metrics plainly and what action to take.',
  'search-insights': 'Suggest content angles from Creator Search Insights patterns in excerpts.',
  'sponsor-angle': 'Turn sponsor brief into authentic TikTok angle + hook + proof + disclosure note.',
  script: 'Write a filmable script: hook, beats, b-roll notes, CTA. Solo iPhone + mic friendly.',
  'before-posting': 'Return a tight before-posting checklist customized to the described video.',
  'analyze-screenshot': 'Analyze the TikTok screenshot for hook, caption, hashtags, cover, and fixes.',
  'content-ideas': 'Give 5 specific content ideas tied to trend/topic and Kellie\'s strengths.',
  'post-today': 'Pick one primary post idea + backup using analytics top categories and posting cadence.',
};

const SCRIPT_FORMAT_HINTS: Record<ScriptFormat, string> = {
  'food-review': 'Restaurant review — hero bite, honest take, ambiance B-roll, clear place name for Search.',
  'thrift-find': 'Thrift find — show item fast, price/value, try-on or use demo, personality beat.',
  'store-walkthrough': 'Store walk — walking energy, find reveal rhythm, voiceover between aisles.',
  'kc-event': 'KC event — date/place in hook, why go, 2–3 must-see moments, local Search terms.',
  'product-review': 'Product review — problem → demo → honest verdict; label if sponsored.',
  'talking-head': 'Talking head — strong opinion hook, 3 beats max, caption summarizes takeaway.',
};

function formatHitsForPrompt(hits: PlaybookSearchHit[]): string {
  if (hits.length === 0) return '(No playbook excerpts matched.)';
  return hits
    .map((h, i) => {
      const loc = [h.documentTitle, h.pageNumber != null ? `p.${h.pageNumber}` : null, h.sectionTitle]
        .filter(Boolean)
        .join(' · ');
      return `[${i + 1}] ${h.sourceName} — ${loc}\n${h.chunkText.slice(0, 1400)}`;
    })
    .join('\n\n---\n\n');
}

function hitsToSources(hits: PlaybookSearchHit[]): PlaybookSourceRef[] {
  const seen = new Set<string>();
  const sources: PlaybookSourceRef[] = [];
  for (const h of hits.slice(0, 5)) {
    const key = `${h.documentTitle}:${h.pageNumber}:${h.sectionTitle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      sourceName: h.sourceName,
      documentTitle: h.documentTitle,
      pageNumber: h.pageNumber,
      sectionTitle: h.sectionTitle,
    });
  }
  return sources;
}

function detectCapability(question: string, explicit?: PlaybookCapability): PlaybookCapability {
  if (explicit && explicit !== 'general') return explicit;
  const q = question.toLowerCase();
  if (/hook|opening|first (second|frame)/i.test(q)) return 'improve-hook';
  if (/caption|rewrite.*voice/i.test(q)) return 'rewrite-caption';
  if (/hashtag/i.test(q)) return 'hashtags';
  if (/searchable|seo|search keyword/i.test(q)) return 'tiktok-seo';
  if (/post(ing)? time|when should.*post/i.test(q)) return 'posting-times';
  if (/studio|analytics|metric|retention|watch time/i.test(q)) return 'studio-metrics';
  if (/search insights|content gap|trend topic/i.test(q)) return 'search-insights';
  if (/sponsor|brand deal|paid partnership/i.test(q)) return 'sponsor-angle';
  if (/script|shot list|beats/i.test(q)) return 'script';
  if (/checklist|before post/i.test(q)) return 'before-posting';
  if (/screenshot|this post|analyze.*image/i.test(q)) return 'analyze-screenshot';
  if (/5 ideas|content ideas|from this trend/i.test(q)) return 'content-ideas';
  if (/post today|what should.*post/i.test(q)) return 'post-today';
  return explicit ?? 'general';
}

export async function askPlaybookCoach(request: PlaybookAskRequest): Promise<PlaybookAskResponse> {
  const question = request.question.trim();
  if (!question && !request.imageDataUrl) throw new Error('Question or screenshot is required');

  const capability = detectCapability(question, request.capability);
  const [hits, analytics, checklist] = await Promise.all([
    searchPlaybookForQuestion({ question: question || 'TikTok creator best practices', sourceSlug: request.sourceSlug }),
    buildPlaybookCoachContext(),
    capability === 'before-posting' ? getPlaybookChecklistBySlug('before-posting') : Promise.resolve(null),
  ]);

  if (!env.OPENAI_API_KEY?.trim()) {
    return fallbackAnswer(question, hits, analytics, capability, checklist);
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 90_000 });
  const systemPrompt = `${BENSON_PERSONALITY_CORE}\n\n${COACH_RULES}\n\nTask focus: ${CAPABILITY_GUIDANCE[capability]}${
    request.scriptFormat ? `\nScript format: ${SCRIPT_FORMAT_HINTS[request.scriptFormat]}` : ''
  }`;

  const userPayload = {
    capability,
    kellieQuestion: question,
    playbookExcerpts: formatHitsForPrompt(hits),
    kellieAnalytics: analytics,
    checklistTemplate: checklist,
    scriptFormat: request.scriptFormat ?? null,
  };

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: JSON.stringify(userPayload) },
  ];

  if (request.imageDataUrl && (capability === 'analyze-screenshot' || request.imageDataUrl)) {
    userContent.push({
      type: 'image_url',
      image_url: { url: request.imageDataUrl, detail: 'high' },
    });
  }

  const res = await client.chat.completions.create({
    model: env.BENSON_ASK_MODEL,
    temperature: 0.35,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  });

  const answer = res.choices[0]?.message?.content?.trim() ?? 'I could not generate an answer.';
  const groundedInPlaybook = hits.length > 0 && !/not in (your|the) playbook/i.test(answer);
  const usedGeneralStrategy =
    hits.length === 0 || /general creator strategy|not in (your|the) playbook/i.test(answer);
  const usedAnalytics = analytics != null && analytics.canTrustLiveMetrics;

  return {
    answer,
    sources: hitsToSources(hits),
    groundedInPlaybook,
    usedGeneralStrategy,
    usedAnalytics,
    capability,
  };
}

function fallbackAnswer(
  question: string,
  hits: PlaybookSearchHit[],
  analytics: PlaybookCoachContext | null,
  capability: PlaybookCapability,
  checklist: Awaited<ReturnType<typeof getPlaybookChecklistBySlug>>,
): PlaybookAskResponse {
  if (capability === 'before-posting' && checklist) {
    const steps = checklist.steps.map((s, i) => `${i + 1}. ${s.title} — ${s.detail}`).join('\n');
    return {
      answer: `**${checklist.title}**\n\n${steps}`,
      sources: hitsToSources(hits),
      groundedInPlaybook: hits.length > 0,
      usedGeneralStrategy: hits.length === 0,
      usedAnalytics: false,
      capability,
    };
  }

  if (hits.length > 0) {
    const top = hits[0]!;
    return {
      answer: `From **${top.sourceName}** — ${top.documentTitle}${top.sectionTitle ? ` (${top.sectionTitle})` : ''}:\n\n${top.chunkText.slice(0, 900)}`,
      sources: hitsToSources(hits),
      groundedInPlaybook: true,
      usedGeneralStrategy: false,
      usedAnalytics: false,
      capability,
    };
  }

  const analyticsNote = analytics?.recommendedPostTimes?.[0]
    ? `\n\nGeneral creator strategy: Your best posting slot lately is ${analytics.recommendedPostTimes[0].label}.`
    : '';

  return {
    answer: `This is not in your TikTok Creator Playbook yet.${analyticsNote}\n\nGeneral creator strategy: Set OPENAI_API_KEY for full coaching, or add official TikTok docs to ~/Downloads and run playbook ingest.`,
    sources: [],
    groundedInPlaybook: false,
    usedGeneralStrategy: true,
    usedAnalytics: !!analytics?.canTrustLiveMetrics,
    capability,
  };
}
