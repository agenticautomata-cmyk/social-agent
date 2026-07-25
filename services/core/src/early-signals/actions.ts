import { promoteSignalToOpportunity } from './promote.js';
import { loadSignalView, updateSignal, listRecentDeliveries } from './store.js';
import { db } from '../db.js';
import { earlySignals, sourceWatchers } from '../schema.js';
import { eq } from 'drizzle-orm';

export async function dismissSignal(signalId: string, reason?: string): Promise<void> {
  await updateSignal(signalId, {
    signalState: 'dismissed',
    dismissedAt: new Date(),
    metadata: { dismissReason: reason ?? null },
  });
}

export async function snoozeSignal(signalId: string, hours = 24): Promise<void> {
  const until = new Date(Date.now() + hours * 3600000);
  await updateSignal(signalId, { signalState: 'snoozed', snoozedUntil: until });
}

export async function markSignalVerified(signalId: string): Promise<void> {
  await updateSignal(signalId, {
    verificationStatus: 'verified',
    confidenceLevel: 'high',
    signalState: 'active',
  });
}

export async function mergeSignals(primaryId: string, duplicateId: string): Promise<void> {
  await updateSignal(duplicateId, { signalState: 'merged', dismissedAt: new Date() });
  const primary = await loadSignalView(primaryId);
  const duplicate = await loadSignalView(duplicateId);
  if (primary && duplicate) {
    await updateSignal(primaryId, {
      summary: `${primary.summary}\n\nMerged: ${duplicate.summary}`.slice(0, 4000),
      metadata: {
        ...primary.metadata,
        mergedSignalIds: [...((primary.metadata.mergedSignalIds as string[]) ?? []), duplicateId],
      },
    });
  }
}

export async function approveSignalAsOpportunity(signalId: string) {
  const [signal] = await db.select().from(earlySignals).where(eq(earlySignals.id, signalId)).limit(1);
  if (!signal) throw new Error('Signal not found');
  return promoteSignalToOpportunity(signal);
}

export async function getSignalDetail(signalId: string) {
  const view = await loadSignalView(signalId);
  if (!view) return null;
  const deliveries = await listRecentDeliveries(signalId);
  return {
    signal: view,
    deliveries: deliveries.map((d) => ({
      id: d.id,
      channel: d.channel,
      success: d.success,
      deliveredAt: d.deliveredAt.toISOString(),
      providerResponse: d.providerResponse,
      retryCount: d.retryCount,
    })),
  };
}

export async function disableWatcher(watcherId: string): Promise<void> {
  await db.update(sourceWatchers).set({ enabled: false, updatedAt: new Date() }).where(eq(sourceWatchers.id, watcherId));
}