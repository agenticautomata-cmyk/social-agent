import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../env.js';
import { BENSON_PERSONALITY_CORE } from '../benson-personality/index.js';
import { withOpenAiRetry } from '../openai-retry.js';
import type { LearningSignalSnapshot } from './types.js';
import type { BensonInsight, LessonType } from './types.js';

const MODEL = env.BENSON_ASK_MODEL;
const INPUT_COST_PER_M = 0.15;
const OUTPUT_COST_PER_M = 0.6;

const InsightSchema = z.object({
  id: z.string(),
  category: z.enum(['content', 'timing', 'voice', 'sponsor', 'category', 'posting', 'performance']),
  insight: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  lessonType: z.enum([
    'durable_preference',
    'recent_performance_signal',
    'test_needed',
    'temporary_trend',
    'retired_lesson',
  ]),
  durability: z.enum(['durable', 'temporary', 'test']),
  evidenceSource: z.string(),
  evidenceDateRange: z.string(),
  materialChangeSinceLastShown: z.boolean(),
  action: z.string(),
  timelyUntil: z.string().nullable().optional(),
});

const LearningSchema = z.object({
  summary: z.string(),
  insights: z.array(InsightSchema).max(8),
});

export type BensonLearningRecord = {
  summary: string;
  insights: BensonInsight[];
  tokenUsage: { prompt: number; completion: number; total: number };
  estimatedCost: number;
};

function normalizeInsight(raw: z.infer<typeof InsightSchema>): BensonInsight {
  return {
    ...raw,
    timelyUntil: raw.timelyUntil ?? null,
    lastShownAt: null,
  };
}

export async function synthesizeLearnings(
  signals: LearningSignalSnapshot,
): Promise<BensonLearningRecord> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for Benson learning synthesis');
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await withOpenAiRetry(
    () =>
      client.chat.completions.create({
        model: MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.25,
        max_tokens: 1800,
        messages: [
          {
            role: 'system',
            content: `${BENSON_PERSONALITY_CORE}

You synthesize creator intelligence for Kellie (KC TikTok). Output durable, evidence-based lessons — not repetitive filler.

Lesson types (required on every insight):
- durable_preference — repeated operator preference across multiple signals
- recent_performance_signal — analytics-backed, time-limited (use performanceSignals)
- test_needed — one weak result or thin sample; NOT a permanent rule
- temporary_trend — short-lived pattern with explicit expiry
- retired_lesson — explicitly drop stale guidance

Hard rules:
- NEVER invent businesses, grand openings, or event dates. Film recommendations MUST come ONLY from timelyOpportunities in signals — copy title and eventDate exactly when suggesting filming.
- skippedOpportunities and passedOpportunities are silent disinterest — never name those businesses or write "avoid X" / "steer clear"
- One underperforming post or one skip → lessonType test_needed, confidence low, durability test
- Category performance needs sampleSize >= 2 in performanceSignals for medium confidence; n=1 is always low confidence test_needed
- Separate topic vs hook vs format vs timing — do not blame an entire category from one post
- Each insight MUST include: evidenceSource, evidenceDateRange, action (specific next step), durability, materialChangeSinceLastShown (true only if evidence changed vs prior cycle)
- Do NOT write generic filler ("keep up the momentum", "resonating with audience")
- Do NOT convert temporary performance into permanent prohibitions
- If signals lack material new evidence, return empty insights array and summary explaining nothing new was learned
- Prefer 0-4 high-quality insights over repeating thrift/retail/luxury dining themes unless evidence changed

Analytics window: ${signals.analyticsWindow}

Respond JSON:
{
  "summary": "2-3 sentences or honest nothing-new statement",
  "insights": [
    {
      "id": "slug",
      "category": "performance|content|...",
      "insight": "...",
      "confidence": "high|medium|low",
      "lessonType": "recent_performance_signal|...",
      "durability": "durable|temporary|test",
      "evidenceSource": "tiktok analytics|planner|chat feedback|...",
      "evidenceDateRange": "e.g. Jul 1–Jul 25 2026",
      "materialChangeSinceLastShown": false,
      "action": "specific next step Kellie can take now",
      "timelyUntil": "ISO date or null"
    }
  ]
}`,
          },
          {
            role: 'user',
            content: JSON.stringify({ signals }),
          },
        ],
      }),
    { label: 'benson-learning' },
  );

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty learning synthesis');

  const parsed = LearningSchema.parse(JSON.parse(content));
  const prompt = response.usage?.prompt_tokens ?? 0;
  const completion = response.usage?.completion_tokens ?? 0;

  return {
    summary: parsed.summary.trim(),
    insights: parsed.insights.map(normalizeInsight),
    tokenUsage: { prompt, completion, total: prompt + completion },
    estimatedCost:
      (prompt / 1_000_000) * INPUT_COST_PER_M + (completion / 1_000_000) * OUTPUT_COST_PER_M,
  };
}

export type { BensonInsight, LessonType };
