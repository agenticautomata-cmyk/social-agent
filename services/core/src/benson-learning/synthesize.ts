import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../env.js';
import { BENSON_PERSONALITY_CORE } from '../benson-personality/index.js';
import type { LearningSignalSnapshot } from './collect-signals.js';

const MODEL = env.BENSON_ASK_MODEL;
const INPUT_COST_PER_M = 0.15;
const OUTPUT_COST_PER_M = 0.6;

const InsightSchema = z.object({
  id: z.string(),
  category: z.enum(['content', 'timing', 'voice', 'sponsor', 'category', 'posting', 'performance']),
  insight: z.string(),
  confidence: z.enum(['high', 'medium']),
});

const LearningSchema = z.object({
  summary: z.string(),
  insights: z.array(InsightSchema).min(1).max(10),
});

export type BensonInsight = z.infer<typeof InsightSchema>;

export type BensonLearningRecord = {
  summary: string;
  insights: BensonInsight[];
  tokenUsage: { prompt: number; completion: number; total: number };
  estimatedCost: number;
};

export async function synthesizeLearnings(
  signals: LearningSignalSnapshot,
  previousSummary: string | null,
): Promise<BensonLearningRecord> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for Benson learning synthesis');
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.35,
    max_tokens: 1200,
    messages: [
      {
        role: 'system',
        content: `${BENSON_PERSONALITY_CORE}

You maintain Benson's long-term memory for Kellie (KC TikTok creator). Synthesize durable learnings from operator signals — not one-off noise.

Rules:
- Prefer patterns repeated across signals (feedback + chatFeedback + planner + performance aligning)
- chatFeedbackEvents are thumbs up/down on specific Benson chat answers — weight down votes with reasonCode heavily
- skippedOpportunities and passedOpportunities are explicit disinterest — NEVER recommend those titles again; convert to "avoid X" insights
- If previousSummary exists but signals are thin, refresh with new angles — retire stale opening/event suggestions (grand openings are only urgent pre-open)
- Separate facts from guesses; mark confidence medium when thin evidence
- Categories: content (what to film), timing (when/how soon), voice (how Benson should talk), sponsor (brand fit), category (inventory types), posting (platform habits), performance (what TikTok posts worked)
- Do NOT duplicate excludedCategories already in preferenceEvents — convert to actionable insight ("she avoids estate sales for now")
- Include what IS working from topPerformingPosts when present
- summary: 2-3 sentences Benson can reuse internally
- insights: 3-8 items, each one concrete sentence, imperative where helpful

Respond JSON: { "summary": "...", "insights": [ { "id": "slug", "category": "...", "insight": "...", "confidence": "high|medium" } ] }`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          previousSummary,
          signals,
        }),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty learning synthesis');

  const parsed = LearningSchema.parse(JSON.parse(content));
  const prompt = response.usage?.prompt_tokens ?? 0;
  const completion = response.usage?.completion_tokens ?? 0;

  return {
    summary: parsed.summary.trim(),
    insights: parsed.insights,
    tokenUsage: { prompt, completion, total: prompt + completion },
    estimatedCost:
      (prompt / 1_000_000) * INPUT_COST_PER_M + (completion / 1_000_000) * OUTPUT_COST_PER_M,
  };
}
