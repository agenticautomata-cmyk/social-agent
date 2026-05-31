import { desc } from 'drizzle-orm';
import { db } from '../db.js';
import { testerFeedback } from '../schema.js';

export const FEEDBACK_REASON_CODES = [
  'wrong_timing',
  'wrong_sponsor_fit',
  'already_covered',
  'missing_context',
  'low_confidence',
  'other',
] as const;

export type FeedbackReasonCode = (typeof FEEDBACK_REASON_CODES)[number];

export type TesterFeedbackKind = 'feedback' | 'bug';

export type CreateTesterFeedbackInput = {
  kind: TesterFeedbackKind;
  route: string;
  pageTitle?: string | null;
  sentiment?: 'up' | 'down' | null;
  reasonCode?: string | null;
  comment?: string | null;
  expectedBehavior?: string | null;
  userEmail?: string | null;
  userAgent?: string | null;
  viewport?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

export type TesterFeedbackRecord = {
  id: string;
  kind: TesterFeedbackKind;
  route: string;
  pageTitle: string | null;
  sentiment: 'up' | 'down' | null;
  reasonCode: string | null;
  comment: string | null;
  expectedBehavior: string | null;
  userEmail: string | null;
  createdAt: string;
};

function rowToRecord(row: typeof testerFeedback.$inferSelect): TesterFeedbackRecord {
  return {
    id: row.id,
    kind: row.kind as TesterFeedbackKind,
    route: row.route,
    pageTitle: row.pageTitle,
    sentiment: (row.sentiment as 'up' | 'down' | null) ?? null,
    reasonCode: row.reasonCode,
    comment: row.comment,
    expectedBehavior: row.expectedBehavior,
    userEmail: row.userEmail,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createTesterFeedback(
  input: CreateTesterFeedbackInput,
): Promise<TesterFeedbackRecord> {
  if (input.kind === 'feedback' && !input.sentiment && !input.comment) {
    throw new Error('Feedback requires sentiment or comment');
  }
  if (input.kind === 'bug' && !input.comment?.trim()) {
    throw new Error('Bug report requires a description');
  }

  const [row] = await db
    .insert(testerFeedback)
    .values({
      kind: input.kind,
      route: input.route.slice(0, 500),
      pageTitle: input.pageTitle ?? null,
      sentiment: input.sentiment ?? null,
      reasonCode: input.reasonCode ?? null,
      comment: input.comment ?? null,
      expectedBehavior: input.expectedBehavior ?? null,
      userEmail: input.userEmail ?? null,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
      viewport: input.viewport?.slice(0, 120) ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })
    .returning();

  return rowToRecord(row!);
}

export async function listRecentTesterFeedback(limit = 50): Promise<TesterFeedbackRecord[]> {
  const rows = await db
    .select()
    .from(testerFeedback)
    .orderBy(desc(testerFeedback.createdAt))
    .limit(limit);
  return rows.map(rowToRecord);
}
