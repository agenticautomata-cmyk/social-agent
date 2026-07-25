import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  contentItems,
  shootSessions,
  sponsorContacts,
  type ShootSession,
} from '../schema.js';
import { recommendCoverageFormat } from '../coverage-format/recommend.js';
import { createOutcomeLink, attachShootToOutcome } from '../outcome-engine/link.js';
import { recordRecommendationEvent, linkRecommendationToShoot } from '../outcome-engine/record.js';
import { setCreatorFieldStatus } from '../creator-field-status/index.js';

export type ShootShot = {
  id: string;
  instruction: string;
  hook?: string;
  completed: boolean;
  skipped: boolean;
};

export type ShootNote = {
  id: string;
  text: string;
  at: string;
};

export type ShootCompletionReason =
  | 'completed'
  | 'partial'
  | 'could_not_film'
  | 'business_closed'
  | 'too_crowded'
  | 'permission_denied'
  | 'inaccurate_opportunity'
  | 'reschedule'
  | 'other';

const DEFAULT_SHOTS: ShootShot[] = [
  { id: 'establish', instruction: 'Wide establishing shot — show the venue or event context.', completed: false, skipped: false },
  { id: 'hero', instruction: 'Hero shot — the main thing Kellie came to cover.', completed: false, skipped: false },
  { id: 'detail', instruction: 'Detail or product close-up that tells the story.', completed: false, skipped: false },
  { id: 'talking', instruction: 'On-camera talking point with primary hook.', completed: false, skipped: false },
  { id: 'cta', instruction: 'Wrap with location, timing, or call-to-action.', completed: false, skipped: false },
];

function buildShots(title: string, hook: string): ShootShot[] {
  return DEFAULT_SHOTS.map((s, i) => ({
    ...s,
    hook: i === 3 ? hook : undefined,
    instruction: s.instruction.replace('the main thing Kellie came to cover', title.slice(0, 80) || 'the main subject'),
  }));
}

function parseJsonArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

export async function getActiveShootSession(): Promise<ShootSession | null> {
  const [row] = await db
    .select()
    .from(shootSessions)
    .where(eq(shootSessions.status, 'active'))
    .orderBy(desc(shootSessions.startedAt))
    .limit(1);
  return row ?? null;
}

export async function loadShootSession(sessionId: string): Promise<ShootSession | null> {
  const [row] = await db.select().from(shootSessions).where(eq(shootSessions.id, sessionId)).limit(1);
  return row ?? null;
}

async function loadOpportunityContext(contentItemId: string | null) {
  if (!contentItemId) return null;
  const [item] = await db.select().from(contentItems).where(eq(contentItems.id, contentItemId)).limit(1);
  if (!item) return null;

  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const venue = (meta.venue as string) ?? item.locationName ?? null;
  const address = (meta.address as string) ?? item.formattedAddress ?? null;
  const hook = item.hook ?? (meta.hook as string) ?? item.topic;
  const category = (meta.category as string) ?? null;
  const facts = Array.isArray(meta.keyFacts)
    ? (meta.keyFacts as string[])
    : [meta.summary as string, item.hook].filter(Boolean).slice(0, 4) as string[];

  const formatRec = recommendCoverageFormat({
    title: item.topic,
    summary: (meta.summary as string) ?? null,
    category,
    metadata: meta,
  });

  return {
    item,
    venue,
    address,
    hook,
    facts,
    contentFormat: formatRec ?? 'on-location',
    talkingPoints: Array.isArray(meta.talkingPoints)
      ? (meta.talkingPoints as string[])
      : facts.slice(0, 3),
  };
}

export async function startShootSession(input: {
  contentItemId?: string | null;
  sponsorContactId?: string | null;
  locationLabel?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  recommendationEventId?: string | null;
}) {
  const existing = await getActiveShootSession();
  if (existing) return { session: existing, resumed: true };

  const ctx = await loadOpportunityContext(input.contentItemId ?? null);
  const shots = buildShots(ctx?.item.topic ?? 'this opportunity', ctx?.hook ?? 'Quick KC find');

  const outcomeLink = await createOutcomeLink({
    contentItemId: input.contentItemId ?? null,
    shootSessionId: null,
    sponsorContactId: input.sponsorContactId ?? null,
    linkConfidence: input.contentItemId ? 0.95 : 0.7,
    metadata: { shootStarted: true },
  });

  const [session] = await db
    .insert(shootSessions)
    .values({
      contentItemId: input.contentItemId ?? null,
      sponsorContactId: input.sponsorContactId ?? null,
      locationLabel: input.locationLabel ?? ctx?.address ?? ctx?.venue ?? null,
      locationLat: input.locationLat != null ? String(input.locationLat) : null,
      locationLng: input.locationLng != null ? String(input.locationLng) : null,
      contentFormat: ctx?.contentFormat ?? 'on-location',
      shots,
      talkingPoints: ctx?.talkingPoints ?? [],
      keyFacts: ctx?.facts ?? [],
      outcomeLinkId: outcomeLink.id,
    })
    .returning();
  if (!session) throw new Error('Failed to create shoot session');

  await attachShootToOutcome(session.id, outcomeLink.id);

  if (input.recommendationEventId) {
    await linkRecommendationToShoot(input.recommendationEventId, session.id);
  } else if (input.contentItemId) {
    const rec = await recordRecommendationEvent({
      source: 'planner',
      contentItemId: input.contentItemId,
      category: ctx?.item ? ((ctx.item.metadata as Record<string, unknown>)?.category as string) ?? null : null,
      rationale: 'Shoot mode started',
    });
    await linkRecommendationToShoot(rec.id, session.id);
  }

  await setCreatorFieldStatus({
    active: true,
    headline: ctx?.item.topic ?? 'On shoot',
    eventName: ctx?.venue ?? ctx?.item.topic ?? 'Field shoot',
    location: input.locationLabel ?? ctx?.address ?? '',
    eventDate: new Date().toISOString(),
    activity: 'Filming on location',
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  });

  return { session, resumed: false, context: ctx };
}

export async function syncShootSession(
  sessionId: string,
  patch: Partial<{
    shotIndex: number;
    shots: ShootShot[];
    notes: ShootNote[];
    voiceNotes: ShootNote[];
    mediaRefs: Array<{ id: string; url: string; kind: string; at: string }>;
    sponsorChecklist: Record<string, boolean>;
    disclosureChecklist: Record<string, boolean>;
    issues: ShootNote[];
    locationLabel: string;
    locationLat: number;
    locationLng: number;
  }>,
) {
  const update: Record<string, unknown> = { ...patch, updatedAt: new Date() };
  if (patch.locationLat != null) update.locationLat = String(patch.locationLat);
  if (patch.locationLng != null) update.locationLng = String(patch.locationLng);

  const [row] = await db
    .update(shootSessions)
    .set(update)
    .where(and(eq(shootSessions.id, sessionId), eq(shootSessions.status, 'active')))
    .returning();
  return row ?? null;
}

export async function advanceShootShot(sessionId: string, action: 'got_it' | 'next' | 'skip') {
  const session = await loadShootSession(sessionId);
  if (!session || session.status !== 'active') return null;

  const shots = parseJsonArray<ShootShot>(session.shots, DEFAULT_SHOTS);
  const idx = session.shotIndex ?? 0;
  if (shots[idx]) {
    if (action === 'skip') shots[idx].skipped = true;
    else shots[idx].completed = true;
  }
  const nextIndex = action === 'next' || action === 'skip' ? Math.min(idx + 1, shots.length - 1) : idx;

  return syncShootSession(sessionId, { shots, shotIndex: nextIndex });
}

export async function finishShootSession(
  sessionId: string,
  reason: ShootCompletionReason,
  note?: string,
) {
  const session = await loadShootSession(sessionId);
  if (!session) return null;

  const status =
    reason === 'completed' ? 'completed' : reason === 'partial' ? 'partial' : 'aborted';

  const shots = parseJsonArray<ShootShot>(session.shots, DEFAULT_SHOTS);
  const missingShots = shots.filter((s) => !s.completed && !s.skipped).map((s) => s.instruction);

  const summary = {
    reason,
    note: note ?? null,
    missingShots,
    suggestedNextStep:
      status === 'completed'
        ? 'Upload footage via Share to Benson or intake.'
        : reason === 'partial'
          ? 'Review missing shots and schedule a return visit.'
          : 'Update planner and pick a follow-up action.',
    finishedAt: new Date().toISOString(),
  };

  const [row] = await db
    .update(shootSessions)
    .set({
      status,
      completionReason: reason,
      endedAt: new Date(),
      summary,
      updatedAt: new Date(),
    })
    .where(eq(shootSessions.id, sessionId))
    .returning();

  await setCreatorFieldStatus(null);
  return row;
}

export async function listRecentShootSessions(limit = 20) {
  return db
    .select({
      session: shootSessions,
      title: contentItems.topic,
      sponsorName: sponsorContacts.businessName,
    })
    .from(shootSessions)
    .leftJoin(contentItems, eq(shootSessions.contentItemId, contentItems.id))
    .leftJoin(sponsorContacts, eq(shootSessions.sponsorContactId, sponsorContacts.id))
    .orderBy(desc(shootSessions.startedAt))
    .limit(limit);
}

export async function searchShootOpportunities(query: string, limit = 15) {
  const rows = await db
    .select({ id: contentItems.id, topic: contentItems.topic, metadata: contentItems.metadata })
    .from(contentItems)
    .where(isNotNull(contentItems.sourceId))
    .orderBy(desc(contentItems.createdAt))
    .limit(100);

  const q = query.toLowerCase().trim();
  return rows
    .filter((r) => !q || r.topic.toLowerCase().includes(q))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      title: r.topic,
      category: ((r.metadata ?? {}) as Record<string, unknown>).category as string | null ?? null,
    }));
}

export function serializeShootSession(session: ShootSession, context?: Awaited<ReturnType<typeof loadOpportunityContext>>) {
  const shots = parseJsonArray<ShootShot>(session.shots, DEFAULT_SHOTS);
  const idx = session.shotIndex ?? 0;
  const currentShot = shots[idx] ?? shots[0] ?? null;

  return {
    id: session.id,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    completionReason: session.completionReason,
    contentItemId: session.contentItemId,
    title: context?.item.topic ?? null,
    venue: context?.venue ?? null,
    address: context?.address ?? session.locationLabel,
    sponsorContactId: session.sponsorContactId,
    contentFormat: session.contentFormat,
    primaryHook: context?.hook ?? null,
    currentShot,
    shotIndex: idx,
    shotTotal: shots.length,
    shots,
    talkingPoints: parseJsonArray<string>(session.talkingPoints, []),
    keyFacts: parseJsonArray<string>(session.keyFacts, []),
    notes: parseJsonArray<ShootNote>(session.notes, []),
    voiceNotes: parseJsonArray<ShootNote>(session.voiceNotes, []),
    mediaRefs: parseJsonArray(session.mediaRefs, []),
    sponsorChecklist: (session.sponsorChecklist ?? {}) as Record<string, boolean>,
    disclosureChecklist: (session.disclosureChecklist ?? {}) as Record<string, boolean>,
    issues: parseJsonArray<ShootNote>(session.issues, []),
    summary: session.summary,
    outcomeLinkId: session.outcomeLinkId,
  };
}

export async function getShootSessionView(sessionId: string) {
  const session = await loadShootSession(sessionId);
  if (!session) return null;
  const context = await loadOpportunityContext(session.contentItemId);
  return serializeShootSession(session, context ?? undefined);
}
