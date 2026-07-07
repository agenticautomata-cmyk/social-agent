import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonPushSettings } from '../schema.js';
import {
  DEFAULT_PUSH_TOPICS,
  PUSH_TOPICS,
  type PushTopicId,
} from './constants.js';
import { countPushSubscriptions } from './subscriptions.js';

const GLOBAL_ID = 'global';

export type PushPreferences = {
  masterEnabled: boolean;
  topics: Record<PushTopicId, boolean>;
  subscriptionCount: number;
  updatedAt: string;
};

async function ensureSettingsRow(): Promise<void> {
  await db.insert(bensonPushSettings).values({ id: GLOBAL_ID }).onConflictDoNothing();
}

function normalizeTopics(raw: unknown): Record<PushTopicId, boolean> {
  const stored = (raw ?? {}) as Partial<Record<PushTopicId, boolean>>;
  const topics = { ...DEFAULT_PUSH_TOPICS };
  for (const topic of PUSH_TOPICS) {
    if (typeof stored[topic.id] === 'boolean') {
      topics[topic.id] = stored[topic.id]!;
    }
  }
  return topics;
}

export async function getPushPreferences(): Promise<PushPreferences> {
  await ensureSettingsRow();
  const [row] = await db
    .select()
    .from(bensonPushSettings)
    .where(eq(bensonPushSettings.id, GLOBAL_ID))
    .limit(1);

  return {
    masterEnabled: row?.masterEnabled ?? true,
    topics: normalizeTopics(row?.topics),
    subscriptionCount: await countPushSubscriptions(),
    updatedAt: row?.updatedAt?.toISOString() ?? new Date(0).toISOString(),
  };
}

export async function updatePushPreferences(input: {
  masterEnabled?: boolean;
  topics?: Partial<Record<PushTopicId, boolean>>;
}): Promise<PushPreferences> {
  await ensureSettingsRow();
  const current = await getPushPreferences();

  const topics = { ...current.topics };
  if (input.topics) {
    for (const topic of PUSH_TOPICS) {
      if (typeof input.topics[topic.id] === 'boolean') {
        topics[topic.id] = input.topics[topic.id]!;
      }
    }
  }

  await db
    .update(bensonPushSettings)
    .set({
      masterEnabled: input.masterEnabled ?? current.masterEnabled,
      topics,
      updatedAt: new Date(),
    })
    .where(eq(bensonPushSettings.id, GLOBAL_ID));

  return getPushPreferences();
}

export async function isPushTopicEnabled(topic: PushTopicId): Promise<boolean> {
  const prefs = await getPushPreferences();
  return prefs.masterEnabled && prefs.topics[topic];
}

export async function markPushTopicSent(topic: PushTopicId): Promise<void> {
  await ensureSettingsRow();
  const [row] = await db
    .select({ lastSentAt: bensonPushSettings.lastSentAt })
    .from(bensonPushSettings)
    .where(eq(bensonPushSettings.id, GLOBAL_ID))
    .limit(1);

  const lastSentAt = {
    ...((row?.lastSentAt ?? {}) as Record<string, string>),
    [topic]: new Date().toISOString(),
  };

  await db
    .update(bensonPushSettings)
    .set({ lastSentAt, updatedAt: new Date() })
    .where(eq(bensonPushSettings.id, GLOBAL_ID));
}

export async function getLastPushSentAt(topic: PushTopicId): Promise<Date | null> {
  await ensureSettingsRow();
  const [row] = await db
    .select({ lastSentAt: bensonPushSettings.lastSentAt })
    .from(bensonPushSettings)
    .where(eq(bensonPushSettings.id, GLOBAL_ID))
    .limit(1);

  const raw = (row?.lastSentAt as Record<string, string> | null)?.[topic];
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}
