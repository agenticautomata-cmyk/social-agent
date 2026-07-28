import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import type { VerificationResult } from './verification.js';
import type { ExtractedNewsletterItem } from './types.js';

export async function upsertVerificationQueueRecord(input: {
  contentItemId: string;
  item: ExtractedNewsletterItem;
  verification: VerificationResult;
  occurrenceFingerprint: string | null;
  gmailMessageId: string;
  newsletterSourceId?: string | null;
}): Promise<void> {
  const asRows = (res: unknown): Array<{ id: string }> => {
    if (Array.isArray(res)) return res as Array<{ id: string }>;
    const rows = (res as { rows?: Array<{ id: string }> })?.rows;
    return rows ?? [];
  };

  if (input.occurrenceFingerprint) {
    const existing = await db.execute(sql`
      SELECT id FROM newsletter_verification_queue
      WHERE occurrence_fingerprint = ${input.occurrenceFingerprint}
      LIMIT 1
    `);
    const rows = asRows(existing);
    if (rows[0]?.id) {
      await db.execute(sql`
        UPDATE newsletter_verification_queue SET
          content_item_id = ${input.contentItemId}::uuid,
          official_claim = ${JSON.stringify(input.verification.officialClaim ?? {})}::jsonb,
          verification_status = ${input.verification.status},
          conflicting_fields = ${JSON.stringify(input.verification.conflictingFields)}::jsonb,
          canonical_official_url = ${input.verification.canonicalOfficialUrl},
          verification_priority = ${input.verification.priority},
          last_verified_at = now(),
          updated_at = now()
        WHERE id = ${rows[0].id}::uuid
      `);
      return;
    }
  }

  await db.execute(sql`
    INSERT INTO newsletter_verification_queue (
      content_item_id,
      occurrence_fingerprint,
      entity_name,
      occurrence_title,
      newsletter_claim,
      official_claim,
      verification_status,
      conflicting_fields,
      canonical_official_url,
      verification_priority,
      gmail_message_id,
      newsletter_source_id,
      last_verified_at,
      updated_at
    ) VALUES (
      ${input.contentItemId}::uuid,
      ${input.occurrenceFingerprint},
      ${input.item.entityName},
      ${input.item.title},
      ${JSON.stringify(input.verification.newsletterClaim)}::jsonb,
      ${JSON.stringify(input.verification.officialClaim ?? {})}::jsonb,
      ${input.verification.status},
      ${JSON.stringify(input.verification.conflictingFields)}::jsonb,
      ${input.verification.canonicalOfficialUrl},
      ${input.verification.priority},
      ${input.gmailMessageId},
      ${input.newsletterSourceId ?? null}::uuid,
      now(),
      now()
    )
  `);
}
