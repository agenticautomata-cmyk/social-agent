import OpenAI from 'openai';
import { env } from '../env.js';
import { searchManualsForQuestion, type ManualSearchHit } from './search.js';
import {
  formatReferenceVideosForPrompt,
  searchReferenceVideosForQuestion,
  type EquipmentReferenceVideoRecord,
} from './reference-videos.js';
import { getEquipmentChecklistBySlug, listEquipmentChecklists } from './checklists.js';

export type EquipmentAskRequest = {
  question: string;
  equipmentSlug?: string | null;
  shootType?: string | null;
  mode?: 'general' | 'troubleshoot' | 'setup';
};

export type EquipmentSourceRef = {
  manualTitle: string;
  pageNumber: number | null;
  sectionTitle: string | null;
  equipmentName: string;
};

export type EquipmentVideoRef = {
  title: string;
  sourceChannel: string;
  referenceUrl: string;
  referenceKind: 'youtube' | 'web';
  equipmentName: string | null;
};

export type EquipmentAskResponse = {
  answer: string;
  sources: EquipmentSourceRef[];
  referenceVideos: EquipmentVideoRef[];
  groundedInManual: boolean;
  usedGeneralKnowledge: boolean;
  equipmentScope: string[];
};

const SYSTEM_PROMPT = `You are Benson, Kellie's Equipment Expert / Gear Coach for her creator setup.
Answer practically for someone filming TikTok content on the go.

Knowledge areas:
- DJI Osmo Mobile 8 gimbal + DJI Mimo
- Hollyland LARK M2 wireless mic
- Apple iPhone 17 Pro camera (Camera app, Camera Control, focus/exposure lock, best settings for TikTok)
- TikTok app creator tools, analytics, Creator Search Insights, TikTok Academy
- TikTok Studio desktop/web workflow
- CapCut editing workflow
- Blackmagic Camera app vs native Camera app

Rules:
- Use the provided manual/source excerpts FIRST. Official PDF manuals are the source of truth for buttons, menus, and specs.
- Reference videos are practical demonstrations only — suggest them when helpful, but never treat a YouTuber’s wording as authoritative over the manual.
- Cite manual name and page/section when available from excerpts.
- Do not invent buttons, menus, or features not in the excerpts.
- Never mix instructions across devices (Osmo vs LARK vs iPhone vs TikTok vs CapCut vs Blackmagic).
- Give numbered step-by-step instructions when explaining setup or troubleshooting.
- Keep answers concise — no giant manual dumps.
- If excerpts do not cover the question, say clearly: "This is not covered in your manual" before any general advice.
- Label general creator tips as "General creator advice:" — not manual facts.
- For portrait vs landscape: default TikTok to vertical/portrait unless Kellie asks about YouTube/landscape.
- Mention Kellie naturally; stay warm and practical.`;

function formatHitsForPrompt(hits: ManualSearchHit[]): string {
  if (hits.length === 0) return '(No manual excerpts matched this question.)';
  return hits
    .map((h, i) => {
      const loc = [
        h.manualTitle,
        h.pageNumber != null ? `p.${h.pageNumber}` : null,
        h.sectionTitle ? `"${h.sectionTitle}"` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return `[${i + 1}] ${h.equipmentName} — ${loc}\n${h.chunkText.slice(0, 1400)}`;
    })
    .join('\n\n---\n\n');
}

function videosToRefs(videos: EquipmentReferenceVideoRecord[]): EquipmentVideoRef[] {
  return videos.slice(0, 4).map((v) => ({
    title: v.title,
    sourceChannel: v.sourceChannel,
    referenceUrl: v.referenceUrl,
    referenceKind: v.referenceKind,
    equipmentName: v.equipmentName,
  }));
}

function hitsToSources(hits: ManualSearchHit[]): EquipmentSourceRef[] {
  const seen = new Set<string>();
  const sources: EquipmentSourceRef[] = [];
  for (const h of hits.slice(0, 5)) {
    const key = `${h.manualTitle}:${h.pageNumber}:${h.sectionTitle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      manualTitle: h.manualTitle,
      pageNumber: h.pageNumber,
      sectionTitle: h.sectionTitle,
      equipmentName: h.equipmentName,
    });
  }
  return sources;
}

export async function askEquipmentExpert(
  request: EquipmentAskRequest,
): Promise<EquipmentAskResponse> {
  const question = request.question.trim();
  if (!question) throw new Error('Question is required');

  if (request.shootType) {
    return answerShootSetup(question, request.shootType);
  }

  const hits = await searchManualsForQuestion({
    question,
    equipmentSlug: request.equipmentSlug,
  });
  const referenceVideoHits = await searchReferenceVideosForQuestion({
    question,
    equipmentSlug: request.equipmentSlug,
    mode: request.mode,
  });

  if (!env.OPENAI_API_KEY?.trim()) {
    return fallbackAnswer(question, hits, referenceVideoHits);
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 60_000 });
  const res = await client.chat.completions.create({
    model: env.BENSON_ASK_MODEL,
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          mode: request.mode ?? 'general',
          kellieQuestion: question,
          equipmentFilter: request.equipmentSlug ?? null,
          manualExcerpts: formatHitsForPrompt(hits),
          referenceVideos: formatReferenceVideosForPrompt(referenceVideoHits),
        }),
      },
    ],
  });

  const answer = res.choices[0]?.message?.content?.trim() ?? 'I could not generate an answer.';
  const groundedInManual = hits.length > 0 && !/not covered in your manual/i.test(answer);
  const usedGeneralKnowledge =
    hits.length === 0 || /not covered in your manual|general advice|general creator/i.test(answer);

  return {
    answer,
    sources: hitsToSources(hits),
    referenceVideos: videosToRefs(referenceVideoHits),
    groundedInManual,
    usedGeneralKnowledge,
    equipmentScope: [
      ...new Set([
        ...hits.map((h) => h.equipmentName),
        ...referenceVideoHits.map((v) => v.equipmentName).filter(Boolean) as string[],
      ]),
    ],
  };
}

async function answerShootSetup(
  question: string,
  shootType: string,
): Promise<EquipmentAskResponse> {
  const checklist = await getEquipmentChecklistBySlug(shootType);
  const hits = await searchManualsForQuestion({ question, equipmentSlug: null });
  const referenceVideoHits = await searchReferenceVideosForQuestion({
    question,
    mode: 'setup',
  });

  if (!checklist) {
    return askEquipmentExpert({ question, mode: 'setup' });
  }

  const stepsText = (checklist.steps as Array<{ title: string; detail: string }>)
    .map((s, i) => `${i + 1}. ${s.title} — ${s.detail}`)
    .join('\n');

  const gear = (checklist.gearToBring as string[]).join(', ');
  const equipmentScope = [...new Set((checklist.gearToBring as string[]).concat(hits.map((h) => h.equipmentName)))];

  if (!env.OPENAI_API_KEY?.trim()) {
    return {
      answer: `**${checklist.title}**\n\nGear: ${gear}\n\n${stepsText}`,
      sources: hitsToSources(hits),
      referenceVideos: videosToRefs(referenceVideoHits),
      groundedInManual: hits.length > 0,
      usedGeneralKnowledge: false,
      equipmentScope,
    };
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 60_000 });
  const res = await client.chat.completions.create({
    model: env.BENSON_ASK_MODEL,
    temperature: 0.25,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Give Kellie a shoot setup walkthrough using the checklist and manual excerpts.',
          shootType: checklist.title,
          gearToBring: checklist.gearToBring,
          checklistSteps: checklist.steps,
          commonMistakes: checklist.commonMistakes,
          recoverySteps: checklist.recoverySteps,
          kellieQuestion: question,
          manualExcerpts: formatHitsForPrompt(hits),
          referenceVideos: formatReferenceVideosForPrompt(referenceVideoHits),
        }),
      },
    ],
  });

  return {
    answer: res.choices[0]?.message?.content?.trim() ?? stepsText,
    sources: hitsToSources(hits),
    referenceVideos: videosToRefs(referenceVideoHits),
    groundedInManual: hits.length > 0,
    usedGeneralKnowledge: hits.length === 0,
    equipmentScope,
  };
}

function fallbackAnswer(
  question: string,
  hits: ManualSearchHit[],
  referenceVideoHits: EquipmentReferenceVideoRecord[],
): EquipmentAskResponse {
  const videoRefs = videosToRefs(referenceVideoHits);
  if (hits.length === 0) {
    const videoHint =
      videoRefs.length > 0
        ? `\n\nReference videos:\n${videoRefs.map((v) => `- ${v.title}: ${v.referenceUrl}`).join('\n')}`
        : '';
    return {
      answer:
        'This is not covered in your manual based on my search. Set OPENAI_API_KEY for fuller Gear Coach answers, or try rephrasing with the device name (Osmo, LARK, iPhone, TikTok, CapCut, or Blackmagic).' +
        videoHint,
      sources: [],
      referenceVideos: videoRefs,
      groundedInManual: false,
      usedGeneralKnowledge: true,
      equipmentScope: [],
    };
  }
  const top = hits[0]!;
  return {
    answer: `From **${top.manualTitle}**${top.pageNumber ? ` (page ${top.pageNumber})` : ''}${top.sectionTitle ? ` — ${top.sectionTitle}` : ''}:\n\n${top.chunkText.slice(0, 900)}`,
    sources: hitsToSources(hits),
    referenceVideos: videoRefs,
    groundedInManual: true,
    usedGeneralKnowledge: false,
    equipmentScope: [...new Set(hits.map((h) => h.equipmentName))],
  };
}

export async function generateChecklistWithBenson(input: {
  shootType: string;
  notes?: string;
}): Promise<
  EquipmentAskResponse & { checklist: Awaited<ReturnType<typeof getEquipmentChecklistBySlug>> }
> {
  const existing = await getEquipmentChecklistBySlug(input.shootType);
  const all = await listEquipmentChecklists();
  const match = existing ?? all.find((c) => c.shootType === input.shootType) ?? all[0];

  const response = await askEquipmentExpert({
    question: input.notes?.trim() || `Walk me through setup for ${match?.title ?? input.shootType}`,
    shootType: match?.slug ?? input.shootType,
    mode: 'setup',
  });

  return { checklist: match ?? null, ...response };
}
