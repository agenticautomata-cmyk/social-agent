import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonChatFeedback, bensonChatMessages } from '../schema.js';
import { buildCreatorStrategistProfile } from '../strategist/profile.js';
import { FEEDBACK_REASON_CODES } from '../pre-alpha/feedback.js';

export type ChatFeedbackSentiment = 'up' | 'down';

export type RecordChatFeedbackInput = {
  messageId: string;
  sentiment: ChatFeedbackSentiment;
  reasonCode?: string | null;
  comment?: string | null;
};

export type ChatFeedbackRecord = {
  messageId: string;
  sentiment: ChatFeedbackSentiment;
  reasonCode: string | null;
  comment: string | null;
  updatedAt: string;
};

function isValidReasonCode(code: string | null | undefined): boolean {
  if (!code?.trim()) return true;
  return (FEEDBACK_REASON_CODES as readonly string[]).includes(code.trim());
}

export async function recordChatFeedback(
  input: RecordChatFeedbackInput,
): Promise<ChatFeedbackRecord> {
  const profile = await buildCreatorStrategistProfile();
  if (!profile) {
    throw new Error('No creator analytics account found');
  }

  const [message] = await db
    .select({ id: bensonChatMessages.id, role: bensonChatMessages.role })
    .from(bensonChatMessages)
    .where(
      and(
        eq(bensonChatMessages.id, input.messageId),
        eq(bensonChatMessages.creatorId, profile.creatorId),
      ),
    )
    .limit(1);

  if (!message) {
    throw new Error('Chat message not found');
  }
  if (message.role !== 'assistant') {
    throw new Error('Feedback is only supported on Benson answers');
  }
  if (!isValidReasonCode(input.reasonCode)) {
    throw new Error('Invalid feedback reason code');
  }

  const now = new Date();
  const [row] = await db
    .insert(bensonChatFeedback)
    .values({
      messageId: input.messageId,
      creatorId: profile.creatorId,
      sentiment: input.sentiment,
      reasonCode: input.reasonCode?.trim() || null,
      comment: input.comment?.trim()?.slice(0, 500) || null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: bensonChatFeedback.messageId,
      set: {
        sentiment: input.sentiment,
        reasonCode: input.reasonCode?.trim() || null,
        comment: input.comment?.trim()?.slice(0, 500) || null,
        updatedAt: now,
      },
    })
    .returning();

  return {
    messageId: row!.messageId,
    sentiment: row!.sentiment as ChatFeedbackSentiment,
    reasonCode: row!.reasonCode,
    comment: row!.comment,
    updatedAt: row!.updatedAt.toISOString(),
  };
}
