import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../env.js';
import type { FrameSummary } from './types.js';
import type { SampledFrame } from './frame-sampling.js';

function normalizeHookStrength(
  value: unknown,
): 'weak' | 'medium' | 'strong' | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const s = value.toLowerCase().trim();
    if (s === 'weak' || s === 'low' || s === 'poor') return 'weak';
    if (s === 'strong' || s === 'high' || s === 'good') return 'strong';
    if (s === 'medium' || s === 'mid' || s === 'average') return 'medium';
    return 'medium';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const scale = value > 1 ? value / 10 : value;
    if (scale <= 0.35) return 'weak';
    if (scale <= 0.7) return 'medium';
    return 'strong';
  }
  return 'medium';
}

function coerceStringList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === 'string') {
          const trimmed = item.trim();
          return trimmed ? [trimmed] : [];
        }
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          for (const key of ['name', 'label', 'location', 'role', 'value', 'text']) {
            if (typeof obj[key] === 'string' && obj[key].trim()) return [obj[key].trim()];
          }
        }
        return [];
      })
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

const HookStrengthSchema = z
  .union([z.enum(['weak', 'medium', 'strong']), z.number(), z.string()])
  .optional()
  .transform(normalizeHookStrength);

const StringListSchema = z.preprocess(coerceStringList, z.array(z.string())).default([]);

const VisualAnalysisSchema = z.object({
  visual_summary: z.coerce.string(),
  hook_assessment: z.coerce.string().nullable().optional(),
  visual_quality_notes: z.coerce.string().nullable().optional(),
  lighting_notes: z.coerce.string().nullable().optional(),
  possible_cover_text: z.coerce.string().nullable().optional(),
  best_cover_frame_notes: z.coerce.string().nullable().optional(),
  detected_products: StringListSchema,
  detected_brands: StringListSchema,
  detected_locations: StringListSchema,
  detected_people_or_roles: StringListSchema,
  frame_summaries: z
    .array(
      z.object({
        timestamp_seconds: z.coerce.number(),
        label: z.string(),
        description: z.string(),
        hook_strength: HookStrengthSchema,
        cover_candidate: z.coerce.boolean().optional(),
      }),
    )
    .default([]),
});

export async function analyzeDraftVisuals(input: {
  frames: SampledFrame[];
  transcript?: string | null;
  userNote?: string | null;
}): Promise<{
  visualSummary: string;
  hookAssessment: string | null;
  visualQualityNotes: string | null;
  lightingNotes: string | null;
  possibleCoverText: string | null;
  bestCoverFrameNotes: string | null;
  detectedProducts: string[];
  detectedBrands: string[];
  detectedLocations: string[];
  detectedPeopleOrRoles: string[];
  frameSummaries: FrameSummary[];
  stub: boolean;
}> {
  if (input.frames.length === 0) {
    return {
      visualSummary: '',
      hookAssessment: null,
      visualQualityNotes: null,
      lightingNotes: null,
      possibleCoverText: null,
      bestCoverFrameNotes: null,
      detectedProducts: [],
      detectedBrands: [],
      detectedLocations: [],
      detectedPeopleOrRoles: [],
      frameSummaries: [],
      stub: true,
    };
  }

  if (!env.OPENAI_API_KEY?.trim() || env.DEMO_MODE) {
    return {
      visualSummary: `Benson sampled ${input.frames.length} frames from this draft. Visual analysis needs OPENAI_API_KEY with DEMO_MODE=false.`,
      hookAssessment: 'Unable to assess hook visually in demo mode.',
      visualQualityNotes: null,
      lightingNotes: null,
      possibleCoverText: null,
      bestCoverFrameNotes: `Frame at ${input.frames[0]?.timestamp_seconds ?? 0}s may work as cover.`,
      detectedProducts: [],
      detectedBrands: [],
      detectedLocations: [],
      detectedPeopleOrRoles: [],
      frameSummaries: input.frames.map((f) => ({
        timestamp_seconds: f.timestamp_seconds,
        label: `Frame ${f.timestamp_seconds}s`,
        description: 'Visual frame captured — analysis pending production mode.',
      })),
      stub: true,
    };
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const imageParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = input.frames.map((f) => ({
    type: 'image_url',
    image_url: { url: `data:${f.mime_type};base64,${f.base64}`, detail: 'low' },
  }));

  const response = await client.chat.completions.create({
    model: env.BENSON_ASK_MODEL,
    temperature: 0.35,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You analyze sampled frames from an unposted creator draft video. Return JSON: visual_summary, hook_assessment, visual_quality_notes, lighting_notes, possible_cover_text, best_cover_frame_notes, detected_products, detected_brands, detected_locations, detected_people_or_roles, frame_summaries (array with timestamp_seconds, label, description, hook_strength as the string "weak" | "medium" | "strong" — not a number, cover_candidate boolean). Be specific about what is shown. Note if the item/location is clear. Do not invent brands you cannot see.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              frameTimestamps: input.frames.map((f) => f.timestamp_seconds),
              transcriptPreview: input.transcript?.slice(0, 1500) ?? null,
              userNote: input.userNote ?? null,
            }),
          },
          ...imageParts,
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('empty visual analysis');
  const parsed = VisualAnalysisSchema.parse(JSON.parse(content));

  return {
    visualSummary: parsed.visual_summary,
    hookAssessment: parsed.hook_assessment ?? null,
    visualQualityNotes: parsed.visual_quality_notes ?? null,
    lightingNotes: parsed.lighting_notes ?? null,
    possibleCoverText: parsed.possible_cover_text ?? null,
    bestCoverFrameNotes: parsed.best_cover_frame_notes ?? null,
    detectedProducts: parsed.detected_products,
    detectedBrands: parsed.detected_brands,
    detectedLocations: parsed.detected_locations,
    detectedPeopleOrRoles: parsed.detected_people_or_roles,
    frameSummaries: parsed.frame_summaries,
    stub: false,
  };
}
