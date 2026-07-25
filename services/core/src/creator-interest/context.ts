import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonChatMessages } from '../schema.js';
import { getDiscoveryRecord } from './actions.js';
import { normalizeEntityName } from './normalize.js';
import type { BusinessEnrichment } from './types.js';

export type RecordDiscussionContext = {
  contentItemId: string;
  normalizedEntityName: string;
  title: string;
  summary: string | null;
  category: string | null;
  locationName: string | null;
  sourceUrl: string | null;
  lifecycleStatus: string;
  creatorRelevanceStatus: string;
  enrichment: Partial<BusinessEnrichment> | null;
  assistancePackageSummary: string | null;
  visitBlocked: boolean;
  discussionPrompt: string;
};

function formatField(label: string, field?: { value: unknown; status: string; source?: string | null }): string {
  if (!field) return `${label}: unavailable`;
  if (field.value == null) return `${label}: unavailable (${field.status})`;
  const value =
    Array.isArray(field.value) ? field.value.join(', ') : typeof field.value === 'boolean' ? String(field.value) : String(field.value);
  return `${label}: ${value} [${field.status}${field.source ? ` · ${field.source}` : ''}]`;
}

export async function loadRecordDiscussionContext(contentItemId: string): Promise<RecordDiscussionContext | null> {
  const record = await getDiscoveryRecord(contentItemId);
  if (!record) return null;

  const enrichment = record.enrichment;
  const visitBlocked =
    enrichment?.currentlyOpen?.value === false ||
    /\b(permanently closed|closed permanently|relocating|storefront is closed)\b/i.test(
      `${enrichment?.researchSummary ?? ''} ${record.summary ?? ''}`,
    );

  const lines = [
    `ATTACHED RECORD: ${record.normalizedEntityName} (contentItemId=${contentItemId})`,
    `Title: ${record.title}`,
    `Category: ${record.category ?? 'unknown'}`,
    `Lifecycle: ${record.lifecycleStatus}`,
    `Location: ${record.locationName ?? 'unknown'}`,
    `Source: ${record.sourceUrl ?? 'none'}`,
    enrichment ? formatField('Website', enrichment.website) : null,
    enrichment ? formatField('Address', enrichment.address) : null,
    enrichment ? formatField('Phone', enrichment.phone) : null,
    enrichment ? formatField('Hours', enrichment.hours) : null,
    enrichment ? formatField('Currently open', enrichment.currentlyOpen) : null,
    enrichment ? formatField('Pricing', enrichment.pricing) : null,
    enrichment?.researchSummary ? `Research summary: ${enrichment.researchSummary}` : null,
    record.assistancePackage?.visitPlan?.suggestedTiming
      ? `Visit timing: ${record.assistancePackage.visitPlan.suggestedTiming}`
      : null,
    visitBlocked ? 'VISIT BLOCKED: verify open status before recommending a visit.' : null,
  ].filter(Boolean);

  return {
    contentItemId,
    normalizedEntityName: record.normalizedEntityName,
    title: record.title,
    summary: record.summary,
    category: record.category,
    locationName: record.locationName,
    sourceUrl: record.sourceUrl,
    lifecycleStatus: record.lifecycleStatus,
    creatorRelevanceStatus: record.creatorRelevanceStatus,
    enrichment: record.enrichment,
    assistancePackageSummary: record.assistancePackage?.contentPackage?.openingHook ?? null,
    visitBlocked,
    discussionPrompt: lines.join('\n'),
  };
}

export function recordDiscussionPromptBlock(ctx: RecordDiscussionContext): string {
  return `\n\n--- ATTACHED DISCOVERY RECORD ---\n${ctx.discussionPrompt}\n--- END RECORD ---\nAnswer about THIS exact record. Do not ask Kellie to retype the business name. Use only verified enrichment fields; label guesses as unverified.`;
}

export async function loadContentItemIdFromConversation(conversationId: string): Promise<string | null> {
  const rows = await db
    .select({
      contentItemId: sql<string | null>`${bensonChatMessages.inputSnapshot}->>'contentItemId'`,
    })
    .from(bensonChatMessages)
    .where(eq(bensonChatMessages.conversationId, conversationId))
    .orderBy(desc(bensonChatMessages.createdAt))
    .limit(30);

  for (const entry of rows) {
    if (entry.contentItemId) return entry.contentItemId;
  }
  return null;
}
