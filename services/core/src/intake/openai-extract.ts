import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../env.js';
import type { IntakeType } from '../schema.js';
import type { StubExtractionInput, StubExtractionResult } from './stub-extraction.js';
import { stubExtractIntake } from './stub-extraction.js';

const IntakeExtractSchema = z.object({
  ai_summary: z.string().min(1),
  extracted_title: z.string().min(1),
  extracted_category: z.string().nullable().optional(),
  extracted_location: z.string().nullable().optional(),
  extracted_business: z.string().nullable().optional(),
  extracted_date: z.string().nullable().optional(),
  extracted_tags: z.array(z.string()).default([]),
  confidence_score: z.number().min(0).max(1),
});

export type IntakeExtractionResult = Omit<StubExtractionResult, 'extraction_stub'> & {
  extraction_stub: boolean;
};

function parseExtractedDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const parsed = Date.parse(raw.trim());
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

export async function extractIntakeSubmission(
  input: StubExtractionInput & { imageBase64?: string | null; imageMimeType?: string | null },
): Promise<IntakeExtractionResult> {
  if (!env.OPENAI_API_KEY?.trim() || !env.INTAKE_OPENAI_ENABLED) {
    return { ...stubExtractIntake(input), extraction_stub: true };
  }

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const system = `You extract Kansas City content opportunities for a creator studio.
Return JSON only with keys: ai_summary, extracted_title, extracted_category, extracted_location, extracted_business, extracted_date (ISO or null), extracted_tags (array), confidence_score (0-1).
Focus on KC metro events, businesses, openings, and sponsor-friendly angles.`;

    const userParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: JSON.stringify({
          intakeType: input.intakeType,
          url: input.url,
          text: input.text,
          notes: input.notes,
          categorySuggestion: input.categorySuggestion,
        }),
      },
    ];

    if (input.imageBase64 && input.imageMimeType) {
      userParts.push({
        type: 'image_url',
        image_url: { url: `data:${input.imageMimeType};base64,${input.imageBase64}` },
      });
    }

    const response = await client.chat.completions.create({
      model: env.BENSON_ASK_MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userParts },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('empty extraction');

    const parsed = IntakeExtractSchema.parse(JSON.parse(content));
    return {
      ai_summary: parsed.ai_summary,
      extracted_title: parsed.extracted_title,
      extracted_category: parsed.extracted_category ?? input.categorySuggestion ?? null,
      extracted_location: parsed.extracted_location ?? null,
      extracted_business: parsed.extracted_business ?? null,
      extracted_date: parseExtractedDate(parsed.extracted_date),
      extracted_tags: parsed.extracted_tags,
      confidence_score: Number(parsed.confidence_score.toFixed(3)),
      extraction_stub: false,
    };
  } catch {
    return { ...stubExtractIntake(input), extraction_stub: true };
  }
}

export function resolveIntakeTypeFromFlags(
  hasUrl: boolean,
  hasText: boolean,
  hasImage: boolean,
): IntakeType {
  const count = [hasUrl, hasText, hasImage].filter(Boolean).length;
  if (count > 1) return 'mixed';
  if (hasImage) return 'image';
  if (hasUrl) return 'url';
  if (hasText) return 'text';
  return 'text';
}
