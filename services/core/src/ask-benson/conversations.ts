import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonChatMessages, bensonConversations } from '../schema.js';
import { providerStatusValueForTerminalResearch } from './provider-status.js';

export type BensonEntityAssociation = {
  entityType: string;
  entityId: string;
  role: string;
  confidence: number;
  source: string;
};

export type BensonEntityCandidate = BensonEntityAssociation & {
  label?: string;
};

export type BensonEntityContext = {
  associations: BensonEntityAssociation[];
  candidates?: BensonEntityCandidate[];
  needsChooser?: boolean;
  resolvedAt?: string | null;
};

export type BensonUiCard = {
  type: string;
  headline: string;
  tier1?: Record<string, unknown>;
  actions?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type BensonAssistantOutput = {
  answer?: string;
  partnershipId?: string;
  researchRunId?: string;
  researchStatus?: string;
  decisionBrief?: Record<string, unknown> | null;
  uiCard?: BensonUiCard | null;
  entityContext?: BensonEntityContext;
  collection?: Record<string, unknown>;
  updatedAt?: string;
  [key: string]: unknown;
};

export type BensonUserInputSnapshot = {
  entityContext?: BensonEntityContext;
  [key: string]: unknown;
};

export type BensonConversation = {
  id: string;
  creatorId: string;
  title: string;
  titleSource: 'auto' | 'user';
  primaryPartnershipId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastOpenedAt: string | null;
  metadata: Record<string, unknown>;
};

export type BensonConversationMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  message: string;
  createdAt: string;
  inputSnapshot: BensonUserInputSnapshot;
  output: BensonAssistantOutput;
  entityContext: BensonEntityContext | null;
  tokenUsage: Record<string, unknown>;
  estimatedCost: number;
};

type PageCursor = { at: string; id: string };

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const NON_TERMINAL_RESEARCH_STATUSES = ['provisional', 'queued', 'researching'];

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit!)));
}

export function encodeBensonCursor(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeBensonCursor(cursor?: string | null): PageCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<PageCursor>;
    if (
      typeof parsed.at !== 'string' ||
      Number.isNaN(Date.parse(parsed.at)) ||
      typeof parsed.id !== 'string' ||
      !parsed.id
    ) {
      throw new Error('invalid cursor');
    }
    return { at: parsed.at, id: parsed.id };
  } catch {
    throw new Error('Invalid Benson pagination cursor');
  }
}

export function deriveBensonConversationTitle(seed: string): string {
  const firstLine = seed.split(/\r?\n/, 1)[0]?.replace(/\s+/g, ' ').trim() ?? '';
  return firstLine.slice(0, 120) || 'New conversation';
}

function previewMessage(message: string): string | null {
  const preview = message.replace(/\s+/g, ' ').trim().slice(0, 240);
  return preview || null;
}

function mapConversation(row: typeof bensonConversations.$inferSelect): BensonConversation {
  return {
    id: row.id,
    creatorId: row.creatorId,
    title: row.title,
    titleSource: row.titleSource as 'auto' | 'user',
    primaryPartnershipId: row.primaryPartnershipId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastMessagePreview: row.lastMessagePreview,
    lastOpenedAt: row.lastOpenedAt?.toISOString() ?? null,
    metadata: row.metadata as Record<string, unknown>,
  };
}

function mapMessage(row: typeof bensonChatMessages.$inferSelect): BensonConversationMessage {
  const inputSnapshot = row.inputSnapshot as BensonUserInputSnapshot;
  const output = row.outputJson as BensonAssistantOutput;
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as 'user' | 'assistant',
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    inputSnapshot,
    output,
    entityContext:
      row.role === 'user'
        ? inputSnapshot.entityContext ?? null
        : output.entityContext ?? null,
    tokenUsage: row.tokenUsage as Record<string, unknown>,
    estimatedCost: Number(row.estimatedCost),
  };
}

export async function listBensonConversations(input: {
  creatorId: string;
  limit?: number;
  cursor?: string | null;
}): Promise<{ items: BensonConversation[]; nextCursor: string | null }> {
  const limit = clampLimit(input.limit);
  const cursor = decodeBensonCursor(input.cursor);
  const cursorCondition = cursor
    ? or(
        lt(bensonConversations.lastMessageAt, new Date(cursor.at)),
        and(
          eq(bensonConversations.lastMessageAt, new Date(cursor.at)),
          lt(bensonConversations.id, cursor.id),
        ),
      )
    : undefined;

  const rows = await db
    .select()
    .from(bensonConversations)
    .where(
      cursorCondition
        ? and(eq(bensonConversations.creatorId, input.creatorId), cursorCondition)
        : eq(bensonConversations.creatorId, input.creatorId),
    )
    .orderBy(desc(bensonConversations.lastMessageAt), desc(bensonConversations.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const boundary = page.at(-1);
  return {
    items: page.map(mapConversation),
    nextCursor:
      rows.length > limit && boundary
        ? encodeBensonCursor({ at: boundary.lastMessageAt.toISOString(), id: boundary.id })
        : null,
  };
}

export async function getBensonConversation(
  creatorId: string,
  conversationId: string,
): Promise<BensonConversation | null> {
  const [row] = await db
    .select()
    .from(bensonConversations)
    .where(
      and(
        eq(bensonConversations.id, conversationId),
        eq(bensonConversations.creatorId, creatorId),
      ),
    )
    .limit(1);
  return row ? mapConversation(row) : null;
}

export async function getBensonConversationMessages(input: {
  creatorId: string;
  conversationId: string;
  limit?: number;
  cursor?: string | null;
}): Promise<{ conversation: BensonConversation | null; items: BensonConversationMessage[]; nextCursor: string | null }> {
  const conversation = await getBensonConversation(input.creatorId, input.conversationId);
  if (!conversation) return { conversation: null, items: [], nextCursor: null };

  const limit = clampLimit(input.limit);
  const cursor = decodeBensonCursor(input.cursor);
  const cursorCondition = cursor
    ? or(
        lt(bensonChatMessages.createdAt, new Date(cursor.at)),
        and(
          eq(bensonChatMessages.createdAt, new Date(cursor.at)),
          lt(bensonChatMessages.id, cursor.id),
        ),
      )
    : undefined;
  const ownership = and(
    eq(bensonChatMessages.creatorId, input.creatorId),
    eq(bensonChatMessages.conversationId, input.conversationId),
  );
  const rows = await db
    .select()
    .from(bensonChatMessages)
    .where(cursorCondition ? and(ownership, cursorCondition) : ownership)
    .orderBy(desc(bensonChatMessages.createdAt), desc(bensonChatMessages.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const boundary = page.at(-1);
  return {
    conversation,
    items: page.reverse().map(mapMessage),
    nextCursor:
      rows.length > limit && boundary
        ? encodeBensonCursor({ at: boundary.createdAt.toISOString(), id: boundary.id })
        : null,
  };
}

export async function patchBensonConversation(input: {
  creatorId: string;
  conversationId: string;
  title?: string;
  lastOpenedAt?: Date;
}): Promise<BensonConversation | null> {
  const changes: Partial<typeof bensonConversations.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) {
    changes.title = deriveBensonConversationTitle(input.title);
    changes.titleSource = 'user';
  }
  if (input.lastOpenedAt !== undefined) changes.lastOpenedAt = input.lastOpenedAt;

  const [row] = await db
    .update(bensonConversations)
    .set(changes)
    .where(
      and(
        eq(bensonConversations.id, input.conversationId),
        eq(bensonConversations.creatorId, input.creatorId),
      ),
    )
    .returning();
  return row ? mapConversation(row) : null;
}

export async function upsertBensonConversation(input: {
  id: string;
  creatorId: string;
  message: string;
  messageAt?: Date;
  titleSeed?: string;
  primaryPartnershipId?: string | null;
}): Promise<BensonConversation> {
  const messageAt = input.messageAt ?? new Date();
  const title = deriveBensonConversationTitle(input.titleSeed ?? input.message);
  await db
    .insert(bensonConversations)
    .values({
      id: input.id,
      creatorId: input.creatorId,
      title,
      lastMessageAt: messageAt,
      lastMessagePreview: previewMessage(input.message),
      primaryPartnershipId: input.primaryPartnershipId ?? null,
      createdAt: messageAt,
      updatedAt: messageAt,
    })
    .onConflictDoNothing({ target: bensonConversations.id });

  const [row] = await db
    .update(bensonConversations)
    .set({
      lastMessageAt: messageAt,
      lastMessagePreview: previewMessage(input.message),
      updatedAt: messageAt,
      ...(input.primaryPartnershipId !== undefined
        ? { primaryPartnershipId: input.primaryPartnershipId }
        : {}),
    })
    .where(
      and(
        eq(bensonConversations.id, input.id),
        eq(bensonConversations.creatorId, input.creatorId),
      ),
    )
    .returning();
  if (!row) throw new Error('Conversation belongs to another creator');
  return mapConversation(row);
}

export async function persistBensonConversationMessage(input: {
  id?: string;
  creatorId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  message: string;
  createdAt?: Date;
  inputSnapshot?: BensonUserInputSnapshot;
  output?: BensonAssistantOutput;
  tokenUsage?: Record<string, unknown>;
  estimatedCost?: number;
  primaryPartnershipId?: string | null;
}): Promise<BensonConversationMessage> {
  const createdAt = input.createdAt ?? new Date();
  return db.transaction(async (tx) => {
    await tx
      .insert(bensonConversations)
      .values({
        id: input.conversationId,
        creatorId: input.creatorId,
        title: deriveBensonConversationTitle(input.message),
        lastMessageAt: createdAt,
        lastMessagePreview: previewMessage(input.message),
        primaryPartnershipId: input.primaryPartnershipId ?? null,
        createdAt,
        updatedAt: createdAt,
      })
      .onConflictDoNothing({ target: bensonConversations.id });

    const [conversation] = await tx
      .update(bensonConversations)
      .set({
        lastMessageAt: createdAt,
        lastMessagePreview: previewMessage(input.message),
        updatedAt: createdAt,
        ...(input.primaryPartnershipId !== undefined
          ? { primaryPartnershipId: input.primaryPartnershipId }
          : {}),
      })
      .where(
        and(
          eq(bensonConversations.id, input.conversationId),
          eq(bensonConversations.creatorId, input.creatorId),
        ),
      )
      .returning({ id: bensonConversations.id });
    if (!conversation) throw new Error('Conversation belongs to another creator');

    const [message] = await tx
      .insert(bensonChatMessages)
      .values({
        ...(input.id ? { id: input.id } : {}),
        creatorId: input.creatorId,
        conversationId: input.conversationId,
        role: input.role,
        message: input.message,
        createdAt,
        inputSnapshot: input.inputSnapshot ?? {},
        outputJson: input.output ?? {},
        tokenUsage: input.tokenUsage ?? {},
        estimatedCost: String(input.estimatedCost ?? 0),
      })
      .returning();
    return mapMessage(message!);
  });
}

function nonTerminalOutputCondition(partnershipId: string, researchRunId?: string) {
  return and(
    sql`${bensonChatMessages.outputJson}->>'partnershipId' = ${partnershipId}`,
    researchRunId
      ? sql`${bensonChatMessages.outputJson}->>'researchRunId' = ${researchRunId}`
      : undefined,
    sql`COALESCE(${bensonChatMessages.outputJson}->>'researchStatus', 'provisional') IN (${sql.join(
      NON_TERMINAL_RESEARCH_STATUSES.map((status) => sql`${status}`),
      sql`, `,
    )})`,
  );
}

export async function bindBensonAssistantResearchRun(input: {
  creatorId: string;
  messageId: string;
  partnershipId: string;
  researchRunId: string;
}): Promise<boolean> {
  const [row] = await db
    .update(bensonChatMessages)
    .set({
      outputJson: sql`${bensonChatMessages.outputJson} || ${JSON.stringify({
        partnershipId: input.partnershipId,
        researchRunId: input.researchRunId,
        researchStatus: 'researching',
        updatedAt: new Date().toISOString(),
      })}::jsonb`,
    })
    .where(
      and(
        eq(bensonChatMessages.id, input.messageId),
        eq(bensonChatMessages.creatorId, input.creatorId),
        eq(bensonChatMessages.role, 'assistant'),
        nonTerminalOutputCondition(input.partnershipId),
      ),
    )
    .returning({ id: bensonChatMessages.id });
  return Boolean(row);
}

export type BensonTerminalMessagePatch = {
  researchStatus: 'complete' | 'needs_verification' | 'failed';
  decisionBrief?: Record<string, unknown> | null;
  uiCard?: BensonUiCard | null;
  answer?: string;
  collection?: Record<string, unknown>;
  updatedAt?: string;
};

function terminalOutputExpression(patch: BensonTerminalMessagePatch) {
  const providerStatusValue = providerStatusValueForTerminalResearch(patch.researchStatus);
  const topLevel = Object.fromEntries(
    Object.entries({
      researchStatus: patch.researchStatus,
      decisionBrief: patch.decisionBrief,
      uiCard: patch.uiCard,
      answer: patch.answer,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    }).filter(([, value]) => value !== undefined),
  );
  const collection = {
    ...(patch.collection ?? {}),
    partnershipResearchStatus: patch.researchStatus,
    ...(patch.decisionBrief !== undefined ? { decisionBrief: patch.decisionBrief } : {}),
  };
  // Flip providerStatus off active-processing while preserving URL/provider/diagnostics.
  return sql`${bensonChatMessages.outputJson}
    || ${JSON.stringify(topLevel)}::jsonb
    || jsonb_build_object(
      'collection',
      COALESCE(${bensonChatMessages.outputJson}->'collection', '{}'::jsonb)
        || ${JSON.stringify(collection)}::jsonb
        || CASE
          WHEN COALESCE(
            ${bensonChatMessages.outputJson}->'collection'->'providerStatus',
            ${bensonChatMessages.outputJson}->'providerStatus'
          ) IS NULL THEN '{}'::jsonb
          ELSE jsonb_build_object(
            'providerStatus',
            COALESCE(
              ${bensonChatMessages.outputJson}->'collection'->'providerStatus',
              ${bensonChatMessages.outputJson}->'providerStatus'
            ) || jsonb_build_object('status', ${providerStatusValue}::text)
          )
        END
    )
    || CASE
      WHEN COALESCE(
        ${bensonChatMessages.outputJson}->'providerStatus',
        ${bensonChatMessages.outputJson}->'collection'->'providerStatus'
      ) IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object(
        'providerStatus',
        COALESCE(
          ${bensonChatMessages.outputJson}->'providerStatus',
          ${bensonChatMessages.outputJson}->'collection'->'providerStatus'
        ) || jsonb_build_object('status', ${providerStatusValue}::text)
      )
    END`;
}

export async function patchBensonAssistantMessageTerminal(input: {
  creatorId: string;
  messageId: string;
  partnershipId: string;
  researchRunId: string;
  patch: BensonTerminalMessagePatch;
}): Promise<boolean> {
  const [row] = await db
    .update(bensonChatMessages)
    .set({
      outputJson: terminalOutputExpression(input.patch),
      ...(input.patch.answer !== undefined ? { message: input.patch.answer } : {}),
    })
    .where(
      and(
        eq(bensonChatMessages.id, input.messageId),
        eq(bensonChatMessages.creatorId, input.creatorId),
        eq(bensonChatMessages.role, 'assistant'),
        nonTerminalOutputCondition(input.partnershipId, input.researchRunId),
      ),
    )
    .returning({ id: bensonChatMessages.id });
  return Boolean(row);
}

export async function patchBensonAssistantMessagesTerminal(input: {
  creatorId?: string;
  partnershipId: string;
  researchRunId: string;
  patch: BensonTerminalMessagePatch;
}): Promise<string[]> {
  const rows = await db
    .update(bensonChatMessages)
    .set({
      outputJson: terminalOutputExpression(input.patch),
      ...(input.patch.answer !== undefined ? { message: input.patch.answer } : {}),
    })
    .where(
      and(
        input.creatorId ? eq(bensonChatMessages.creatorId, input.creatorId) : undefined,
        eq(bensonChatMessages.role, 'assistant'),
        nonTerminalOutputCondition(input.partnershipId, input.researchRunId),
      ),
    )
    .returning({ id: bensonChatMessages.id });
  return rows.map((row) => row.id);
}

/** Clarify/unbound path: exact message id + partnershipId, no researchRunId required. */
export async function clarifyBensonAssistantResearch(input: {
  creatorId: string;
  messageId: string;
  partnershipId: string;
  answer: string;
  reason: string;
}): Promise<boolean> {
  const [row] = await db
    .update(bensonChatMessages)
    .set({
      message: input.answer,
      outputJson: terminalOutputExpression({
        researchStatus: 'failed',
        answer: input.answer,
        decisionBrief: null,
        uiCard: {
          type: 'research_clarify',
          headline: 'Couldn’t attach research',
          tier1: { reason: input.reason },
        },
        collection: {
          partnershipResearchStatus: 'failed',
          clarifyReason: input.reason,
        },
      }),
    })
    .where(
      and(
        eq(bensonChatMessages.id, input.messageId),
        eq(bensonChatMessages.creatorId, input.creatorId),
        eq(bensonChatMessages.role, 'assistant'),
        nonTerminalOutputCondition(input.partnershipId),
      ),
    )
    .returning({ id: bensonChatMessages.id });
  return Boolean(row);
}
