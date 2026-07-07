import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonPushSubscriptions } from '../schema.js';

export type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string | null;
};

export async function savePushSubscription(input: PushSubscriptionInput): Promise<void> {
  const now = new Date();
  await db
    .insert(bensonPushSubscriptions)
    .values({
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: bensonPushSubscriptions.endpoint,
      set: {
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent?.slice(0, 500) ?? null,
        updatedAt: now,
      },
    });
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await db.delete(bensonPushSubscriptions).where(eq(bensonPushSubscriptions.endpoint, endpoint));
}

export async function listPushSubscriptions(): Promise<
  Array<{ endpoint: string; p256dh: string; auth: string }>
> {
  return db
    .select({
      endpoint: bensonPushSubscriptions.endpoint,
      p256dh: bensonPushSubscriptions.p256dh,
      auth: bensonPushSubscriptions.auth,
    })
    .from(bensonPushSubscriptions);
}

export async function countPushSubscriptions(): Promise<number> {
  const rows = await db.select({ id: bensonPushSubscriptions.id }).from(bensonPushSubscriptions);
  return rows.length;
}
