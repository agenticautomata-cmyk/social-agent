/**
 * Writes a hospitality pitch from a complete brief.
 *
 * The model is a writer, not a researcher. Every fact comes in through the brief,
 * `checkBriefCompleteness` refuses before a single token is spent if something is
 * missing, and `evaluatePitch` inspects the output afterwards. A draft that asserts a
 * number the brief did not supply is rejected and retried once with the problem named;
 * if it fails again the pitch is returned as blocked rather than saved.
 *
 * Kellie never sees "draft a pitch for X" as a task. Either Benson wrote it, or Benson
 * says exactly which fact it is missing.
 */

import OpenAI from 'openai';
import { z } from 'zod';

import { env } from '../env.js';
import { normalizeCreatorNameInText } from '../creator-display.js';
import {
  assemblePitch,
  buildPitchPrompt,
  checkBriefCompleteness,
  refuse,
  type ComposeResult,
  type PitchBrief,
} from './compose.js';
import { evaluatePitch, formatEvaluation, type PitchEvaluation } from './evaluate.js';

const DraftSchema = z.object({
  subject: z.string().min(3).max(200),
  body: z.string().min(40),
});

export type WriteResult =
  | {
      ok: true;
      pitch: Extract<ComposeResult, { ok: true }>;
      evaluation: PitchEvaluation;
      attempts: number;
    }
  | {
      ok: false;
      missing: string[];
      summary: string;
      /** Present when the model produced something but it failed the rubric. */
      rejectedDraft?: { subject: string; body: string; evaluation: PitchEvaluation };
    };

export type PitchModelCaller = (input: {
  system: string;
  user: string;
}) => Promise<{ subject: string; body: string }>;

/** Default caller. Injectable so tests never touch the network. */
export function createOpenAiPitchCaller(): PitchModelCaller {
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new Error('OPENAI_API_KEY is required to write pitches');
  }
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return async ({ system, user }) => {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      // Lower than the old 0.55. The facts are fixed; the only variation wanted is
      // phrasing, and higher temperature is where invented details come from.
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('The model returned an empty pitch');
    const parsed = DraftSchema.parse(JSON.parse(content));
    return {
      subject: normalizeCreatorNameInText(parsed.subject),
      body: normalizeCreatorNameInText(parsed.body),
    };
  };
}

export async function writeHospitalityPitch(
  brief: PitchBrief,
  options: { call?: PitchModelCaller; maxAttempts?: number } = {},
): Promise<WriteResult> {
  const missing = checkBriefCompleteness(brief);
  if (missing.length > 0) {
    const refusal = refuse(missing, brief.propertyName ?? brief.businessName);
    return { ok: false, missing: refusal.missing, summary: refusal.summary };
  }

  const call = options.call ?? createOpenAiPitchCaller();
  const maxAttempts = options.maxAttempts ?? 2;
  const prompt = buildPitchPrompt(brief);

  let lastDraft: { subject: string; body: string } | null = null;
  let lastEvaluation: PitchEvaluation | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const user =
      attempt === 1 || !lastEvaluation
        ? prompt.user
        : // Name the exact problems rather than asking for a vague improvement.
          `${prompt.user}\n\nThe previous attempt was rejected for these reasons. Fix them without adding anything new:\n${lastEvaluation.blockers
            .map((b) => `- ${b}`)
            .join('\n')}`;

    const draft = await call({ system: prompt.system, user });
    // Assemble first, then evaluate. Assembly appends the media kit link if the model
    // dropped it, so evaluating the raw draft would fail a pitch for something that
    // has already been fixed.
    const assembled = assemblePitch({ brief, subject: draft.subject, body: draft.body });
    const evaluation = evaluatePitch({
      subject: assembled.subject,
      body: assembled.body,
      brief,
    });
    lastDraft = { subject: assembled.subject, body: assembled.body };
    lastEvaluation = evaluation;

    if (evaluation.passes) {
      return { ok: true, pitch: assembled, evaluation, attempts: attempt };
    }
  }

  return {
    ok: false,
    missing: lastEvaluation?.blockers ?? ['a draft that passes the pitch rubric'],
    summary: `Benson wrote a draft for ${
      brief.propertyName ?? brief.businessName
    } but it did not pass review: ${lastEvaluation?.blockers.join(' ') ?? 'unknown reason'}`,
    rejectedDraft:
      lastDraft && lastEvaluation
        ? { subject: lastDraft.subject, body: lastDraft.body, evaluation: lastEvaluation }
        : undefined,
  };
}

export { formatEvaluation };
