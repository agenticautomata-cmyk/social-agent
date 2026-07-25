import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../env.js';
import { creatorFirstName, normalizeCreatorNameInText } from '../creator-display.js';

const VideoAnalysisSchema = z.object({
  summary: z.string().min(1),
  extracted_title: z.string().min(1),
  content_theme: z.string().nullable().optional(),
  hook_summary: z.string().nullable().optional(),
  sponsor_relevance: z.string().nullable().optional(),
  detected_products: z.array(z.string()).default([]),
  detected_brands: z.array(z.string()).default([]),
  detected_locations: z.array(z.string()).default([]),
  key_moments: z
    .array(
      z.object({
        timestamp_seconds: z.number().optional(),
        label: z.string(),
        detail: z.string().optional(),
      }),
    )
    .default([]),
  caption_suggestions: z
    .array(
      z.object({
        style: z.string().optional(),
        text: z.string(),
      }),
    )
    .default([]),
  hashtag_suggestions: z.array(z.string()).default([]),
  follow_up_ideas: z.array(z.string()).default([]),
  cover_text_options: z.array(z.string()).default([]),
  first_comment_options: z.array(z.string()).default([]),
  planner_recommendation: z.string().nullable().optional(),
  confidence_score: z.number().min(0).max(1).default(0.6),
  extracted_category: z.string().nullable().optional(),
  extracted_location: z.string().nullable().optional(),
  extracted_business: z.string().nullable().optional(),
  extracted_tags: z.array(z.string()).default([]),
});

export type VideoAnalysisResult = z.infer<typeof VideoAnalysisSchema> & {
  analysis_stub: boolean;
};

function fallbackAnalysis(input: {
  transcript: string;
  notes?: string | null;
  filename?: string | null;
}): VideoAnalysisResult {
  const snippet = input.transcript.slice(0, 200).trim() || 'Shared video';
  const title = snippet.slice(0, 80) || 'Shared video draft';
  return {
    summary: normalizeCreatorNameInText(
      `Benson received a shared video${input.notes ? ` with notes: ${input.notes}` : ''}. Transcript preview: ${snippet}`,
    ),
    extracted_title: title,
    content_theme: 'creator_share',
    hook_summary: snippet.slice(0, 120),
    sponsor_relevance: null,
    detected_products: [],
    detected_brands: [],
    detected_locations: [],
    key_moments: [],
    caption_suggestions: [{ style: 'tiktok', text: snippet.slice(0, 300) }],
    hashtag_suggestions: ['KansasCity', 'KC', 'kclife'],
    follow_up_ideas: ['Film a follow-up with more detail on the main hook'],
    cover_text_options: [title.slice(0, 40)],
    first_comment_options: ['Save this for your KC weekend ✨'],
    planner_recommendation: 'Review transcript and schedule when ready to post.',
    confidence_score: 0.35,
    extracted_category: null,
    extracted_location: null,
    extracted_business: null,
    extracted_tags: [],
    analysis_stub: true,
  };
}

export async function analyzeVideoTranscript(input: {
  transcript: string;
  segments?: Array<{ start: number; end: number; text: string }>;
  notes?: string | null;
  rawText?: string | null;
  filename?: string | null;
  durationSeconds?: number | null;
  intakeType: 'video' | 'audio';
}): Promise<VideoAnalysisResult> {
  if (!env.OPENAI_API_KEY?.trim() || !env.INTAKE_OPENAI_ENABLED) {
    return fallbackAnalysis(input);
  }

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const system = `You are Benson, a Kansas City creator studio assistant for ${creatorFirstName()}.
Analyze a shared ${input.intakeType} transcript and return JSON only with:
summary, extracted_title, content_theme, hook_summary, sponsor_relevance,
detected_products (array), detected_brands (array), detected_locations (array),
key_moments (array of {timestamp_seconds, label, detail}),
caption_suggestions (array of {style, text} — include a likely TikTok caption),
hashtag_suggestions (array), follow_up_ideas (array), cover_text_options (array),
first_comment_options (array), planner_recommendation, confidence_score (0-1),
extracted_category, extracted_location, extracted_business, extracted_tags (array).
Focus on KC metro lifestyle, businesses, events, and sponsor-friendly angles.
The creator's name is ${creatorFirstName()} — never Kelly. extracted_title must be a human-readable title or hook — NEVER a device filename like VID_123.mp4.`;

    const response = await client.chat.completions.create({
      model: env.BENSON_ASK_MODEL,
      temperature: 0.45,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: JSON.stringify({
            intakeType: input.intakeType,
            filename: input.filename,
            durationSeconds: input.durationSeconds,
            notes: input.notes,
            rawText: input.rawText,
            transcript: input.transcript.slice(0, 12000),
            segments: input.segments?.slice(0, 40),
          }),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('empty analysis');

    const parsed = VideoAnalysisSchema.parse(JSON.parse(content));
    return {
      ...parsed,
      summary: normalizeCreatorNameInText(parsed.summary),
      extracted_title: normalizeCreatorNameInText(parsed.extracted_title),
      hook_summary: parsed.hook_summary
        ? normalizeCreatorNameInText(parsed.hook_summary)
        : parsed.hook_summary,
      analysis_stub: false,
    };
  } catch {
    return fallbackAnalysis(input);
  }
}
