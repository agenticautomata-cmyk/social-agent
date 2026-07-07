import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonChatMessages } from '../schema.js';
import {
  applyPickPlannerState,
  matchConciergePick,
  type ConciergePick,
} from './concierge-picks.js';
import {
  saveConciergePick,
  saveContentItemToPlanner,
  type ConciergeSaveAction,
  type SaveConciergePickResult,
} from './save-concierge-pick.js';
import type { AskBensonCollectionResult } from './types.js';

export type ConciergeSaveIntent = {
  action: ConciergeSaveAction;
  pickHint: string | null;
  pinToTop: boolean;
};

const SAVE_PATTERNS: Array<{ action: ConciergeSaveAction; pinToTop?: boolean; pattern: RegExp }> = [
  {
    action: 'plan_today',
    pinToTop: true,
    pattern:
      /\b(?:add|put|move|pin|stick|place).{0,30}(?:it|that|this|the .{0,40}).{0,40}(?:top|first|#1).{0,30}(?:of|on)?(?:the)?(?:\s)?(?:to[\s-]?do|todo|things to do|list|plan|action)\b/i,
  },
  {
    action: 'plan_today',
    pinToTop: true,
    pattern:
      /\b(?:top|first).{0,24}(?:of|on)?(?:the)?(?:\s)?(?:to[\s-]?do|todo|things to do|action center|list)\b/i,
  },
  {
    action: 'plan_today',
    pattern:
      /\b(?:add|put|schedule).{0,24}(?:that|this|it|the .{0,40}|(?:first|second|third|last)(?: one)?).{0,30}(?:to|on|for).{0,20}(?:today(?:'?s)?(?: things(?: to do)?| list| plan)?|things to do now|to[\s-]?do|todo)\b/i,
  },
  {
    action: 'plan_today',
    pattern:
      /\b(?:add|put).{0,16}(?:to|on).{0,12}(?:today(?:'?s)?(?: things(?: to do)?| list| plan)?|to[\s-]?do|todo)\b/i,
  },
  {
    action: 'save',
    pattern:
      /\b(?:save|bookmark|keep).{0,24}(?:that|this|it|the .{0,40}|(?:first|second|third|last)(?: one)?).{0,24}(?:for later|for me|to my list)?\b/i,
  },
  {
    action: 'save',
    pattern: /\b(?:save|bookmark).{0,12}(?:for later|for me)\b/i,
  },
];

function extractPickHint(message: string): string | null {
  const quoted = message.match(/[""](.+?)[""]/);
  if (quoted?.[1]) return quoted[1].trim();

  const theMatch = message.match(
    /\b(?:the|that)\s+(.{3,60}?)(?:\s+(?:for later|to today|for today|on today|to the top)\b|$)/i,
  );
  if (theMatch?.[1]) return theMatch[1].trim();

  const ordinal = message.match(/\b(first|second|third|last|1st|2nd|3rd)\b/i);
  if (ordinal?.[1]) return ordinal[1];

  return null;
}

export function detectConciergeSaveIntent(message: string): ConciergeSaveIntent | null {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length < 6) return null;

  for (const entry of SAVE_PATTERNS) {
    if (entry.pattern.test(trimmed)) {
      return {
        action: entry.action,
        pickHint: extractPickHint(trimmed),
        pinToTop: entry.pinToTop ?? /\b(top|first|#1)\b/i.test(trimmed),
      };
    }
  }

  return null;
}

function readConciergePicks(outputJson: unknown): ConciergePick[] {
  if (!outputJson || typeof outputJson !== 'object') return [];
  const picks = (outputJson as Record<string, unknown>).conciergePicks;
  if (!Array.isArray(picks)) return [];
  return picks as ConciergePick[];
}

function readCollection(outputJson: unknown): AskBensonCollectionResult | null {
  if (!outputJson || typeof outputJson !== 'object') return null;
  const collection = (outputJson as Record<string, unknown>).collection;
  if (!collection || typeof collection !== 'object') return null;
  return collection as AskBensonCollectionResult;
}

export async function loadLastConciergePicks(input: {
  creatorId: string;
  conversationId: string;
}): Promise<ConciergePick[]> {
  const [row] = await db
    .select({ outputJson: bensonChatMessages.outputJson })
    .from(bensonChatMessages)
    .where(
      and(
        eq(bensonChatMessages.creatorId, input.creatorId),
        eq(bensonChatMessages.conversationId, input.conversationId),
        eq(bensonChatMessages.role, 'assistant'),
      ),
    )
    .orderBy(desc(bensonChatMessages.createdAt))
    .limit(1);

  return readConciergePicks(row?.outputJson);
}

async function loadLastAssistantContext(input: {
  creatorId: string;
  conversationId: string;
}): Promise<{ picks: ConciergePick[]; collection: AskBensonCollectionResult | null }> {
  const [row] = await db
    .select({ outputJson: bensonChatMessages.outputJson })
    .from(bensonChatMessages)
    .where(
      and(
        eq(bensonChatMessages.creatorId, input.creatorId),
        eq(bensonChatMessages.conversationId, input.conversationId),
        eq(bensonChatMessages.role, 'assistant'),
      ),
    )
    .orderBy(desc(bensonChatMessages.createdAt))
    .limit(1);

  return {
    picks: readConciergePicks(row?.outputJson),
    collection: readCollection(row?.outputJson),
  };
}

function matchCollectionItem(
  items: AskBensonCollectionResult['items'],
  hint?: string | null,
): AskBensonCollectionResult['items'][number] | null {
  if (items.length === 0) return null;
  if (!hint?.trim()) return items[0] ?? null;

  const normalized = hint.trim().toLowerCase();
  const ordinal = normalized.match(/\b(first|1st|second|2nd|third|3rd|last)\b/);
  if (ordinal) {
    const word = ordinal[1];
    const index =
      word === 'first' || word === '1st'
        ? 0
        : word === 'second' || word === '2nd'
          ? 1
          : word === 'third' || word === '3rd'
            ? 2
            : items.length - 1;
    return items[index] ?? items[0] ?? null;
  }

  const byTitle = items.find(
    (item) =>
      item.title.toLowerCase().includes(normalized) ||
      normalized.includes(item.title.toLowerCase().slice(0, 12)),
  );
  if (byTitle) return byTitle;

  return items[0] ?? null;
}

export async function tryHandleConciergeSaveMessage(input: {
  creatorId: string;
  conversationId: string;
  message: string;
}): Promise<{
  title: string;
  saveResult: SaveConciergePickResult;
  updatedPicks: ConciergePick[];
  answer: string;
  suggestedActions: string[];
} | null> {
  const intent = detectConciergeSaveIntent(input.message);
  if (!intent) return null;

  const { picks, collection } = await loadLastAssistantContext({
    creatorId: input.creatorId,
    conversationId: input.conversationId,
  });

  const collectionItem = collection?.items?.length
    ? matchCollectionItem(collection.items, intent.pickHint)
    : null;

  if (collectionItem?.contentItemId) {
    const saveResult = await saveContentItemToPlanner({
      contentItemId: collectionItem.contentItemId,
      action: intent.action,
      pinToTop: intent.pinToTop,
    });

    const answer = intent.pinToTop
      ? `Pinned "${collectionItem.title}" to the top of today's list.`
      : intent.action === 'plan_today'
        ? `Got it — "${collectionItem.title}" is on today's board now.`
        : `Saved "${collectionItem.title}" for later.`;

    return {
      title: collectionItem.title,
      saveResult,
      updatedPicks: picks,
      answer,
      suggestedActions: ['Open things to do now', 'Open planner', 'Review in inventory'],
    };
  }

  if (picks.length === 0) return null;

  const pick = matchConciergePick(picks, intent.pickHint);
  if (!pick) return null;

  const saveResult = await saveConciergePick({
    pick,
    action: intent.action,
    pinToTop: intent.pinToTop,
  });
  const updatedPicks = applyPickPlannerState(picks, pick.pickId, intent.action);

  const answer = intent.pinToTop
    ? `Pinned "${pick.title}" to the top of today's list.`
    : intent.action === 'plan_today'
      ? `Got it — "${pick.title}" is on today's board now.`
      : `Saved "${pick.title}" for later. Pull it up whenever you're ready.`;

  return {
    title: pick.title,
    saveResult,
    updatedPicks,
    answer,
    suggestedActions: ['Open things to do now', 'Open planner', 'Ask Benson for another KC pick'],
  };
}

export async function persistConciergeSaveAssistantMessage(input: {
  creatorId: string;
  conversationId: string;
  userMessage: string;
  answer: string;
  suggestedActions: string[];
  updatedPicks: ConciergePick[];
  saveResult: SaveConciergePickResult;
}): Promise<string | null> {
  await db.insert(bensonChatMessages).values({
    creatorId: input.creatorId,
    conversationId: input.conversationId,
    role: 'user',
    message: input.userMessage,
    inputSnapshot: { conciergeSave: true },
    outputJson: {},
    tokenUsage: {},
    estimatedCost: '0',
  });

  const [assistantRow] = await db
    .insert(bensonChatMessages)
    .values({
      creatorId: input.creatorId,
      conversationId: input.conversationId,
      role: 'assistant',
      message: input.answer,
      inputSnapshot: { conciergeSave: true },
      outputJson: {
        answer: input.answer,
        evidence: [],
        suggestedActions: input.suggestedActions,
        usedData: ['conciergeSave'],
        confidence: 92,
        conciergePicks: input.updatedPicks,
        conciergeSaveResult: input.saveResult,
      },
      tokenUsage: {},
      estimatedCost: '0',
    })
    .returning();

  return assistantRow?.id ?? null;
}
