import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorPartnerships } from '../schema.js';
import { logStructured } from '../structured-log.js';

/** Terminal research freshness — reuse without re-run unless stale or forced. */
export const STALE_RESEARCH_MS = 7 * 24 * 60 * 60 * 1000;

/** Max wall-clock ownership for one researching cycle before recovery claim is allowed. */
export const RESEARCH_LEASE_MS = 30 * 60 * 1000;

/** Guard regex for app-layer helpers only; SQL claim uses pg_input_is_valid (PostgreSQL 16+). */
export const ISO_TIMESTAMP_PREFIX_RE = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}';

/** Deploy target: PostgreSQL 16 (docker-compose `pgvector/pgvector:pg16`). */
export const REQUIRES_POSTGRES_INPUT_VALIDITY = true;

export type ClaimPartnershipResearchResult = {
  claimed: boolean;
  researchRunId?: string;
  priorResearchRunId?: string | null;
  priorResearchStartedAt?: string | null;
  priorStatus?: string;
  recovery?: boolean;
};

export type ClaimPartnershipResearchOptions = {
  force?: boolean;
  trigger?: string;
};

export type PartnershipResearchAuthorityState = {
  partnershipId: string;
  researchRunId: string | null;
  researchStartedAt: string | null;
  researchStatus: string;
  research: unknown;
  fitScore: number | null;
  needsVerification: unknown;
  researchError: string | null;
  metadata: Record<string, unknown>;
};

type ClaimRow = {
  id: string;
  prior_status: string | null;
  prior_metadata: Record<string, unknown> | null;
};

function readMetadataString(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : null;
}

export async function claimPartnershipResearch(
  partnershipId: string,
  options?: ClaimPartnershipResearchOptions,
): Promise<ClaimPartnershipResearchResult> {
  const newRunId = randomUUID();
  const startedAt = new Date().toISOString();
  const leaseSecs = RESEARCH_LEASE_MS / 1000;
  const staleSecs = STALE_RESEARCH_MS / 1000;
  const force = options?.force ?? false;

  const result = await db.execute(sql`
    WITH prior AS (
      SELECT id, metadata, research_status, research
      FROM creator_partnerships
      WHERE id = ${partnershipId}::uuid
    )
    UPDATE creator_partnerships cp
    SET
      research_status = 'researching',
      pipeline_status = 'researching',
      research_error = NULL,
      metadata = jsonb_set(
        jsonb_set(
          COALESCE(cp.metadata, '{}'::jsonb),
          '{researchRunId}',
          to_jsonb(${newRunId}::text),
          true
        ),
        '{researchStartedAt}',
        to_jsonb(${startedAt}::text),
        true
      ),
      updated_at = now()
    FROM prior p
    WHERE cp.id = p.id
      AND cp.id = ${partnershipId}::uuid
      AND (
        cp.research_status IN ('queued', 'failed')
        OR (
          cp.research_status IN ('complete', 'needs_verification')
          AND (
            ${force} = true
            OR (p.research->>'researchedAt') IS NULL
            OR NOT pg_input_is_valid(p.research->>'researchedAt', 'timestamptz')
            OR (
              pg_input_is_valid(p.research->>'researchedAt', 'timestamptz')
              AND (p.research->>'researchedAt')::timestamptz
                  < now() - make_interval(secs => ${staleSecs})
            )
          )
        )
        OR (
          cp.research_status = 'researching'
          AND (
            cp.metadata->>'researchStartedAt' IS NULL
            OR NOT pg_input_is_valid(cp.metadata->>'researchStartedAt', 'timestamptz')
            OR (
              pg_input_is_valid(cp.metadata->>'researchStartedAt', 'timestamptz')
              AND (cp.metadata->>'researchStartedAt')::timestamptz
                  < now() - make_interval(secs => ${leaseSecs})
            )
          )
        )
      )
    RETURNING
      cp.id,
      p.research_status AS prior_status,
      p.metadata AS prior_metadata
  `);

  const rows = result as unknown as ClaimRow[];
  if (!rows.length) {
    return { claimed: false };
  }

  const row = rows[0]!;
  const priorMetadata = row.prior_metadata;
  const priorResearchRunId = readMetadataString(priorMetadata, 'researchRunId');
  const priorResearchStartedAt = readMetadataString(priorMetadata, 'researchStartedAt');
  const recovery = row.prior_status === 'researching';

  if (recovery) {
    logStructured({
      level: 'info',
      service: 'creator-partnership',
      message: 'stale_research_lease_recovery',
      event: 'stale_research_lease_recovery',
      partnershipId,
      priorResearchRunId,
      newResearchRunId: newRunId,
      priorResearchStartedAt,
      trigger: options?.trigger ?? 'stale_research_lease_recovery',
      reason: 'stale_research_lease_recovery',
    });
  }

  return {
    claimed: true,
    researchRunId: newRunId,
    priorResearchRunId,
    priorResearchStartedAt,
    priorStatus: row.prior_status ?? undefined,
    recovery,
  };
}

/**
 * Read-only authority snapshot for chat join/catch-up. This never grants
 * execution ownership and must not be used in place of the atomic claim.
 */
export async function readPartnershipResearchAuthority(
  partnershipId: string,
): Promise<PartnershipResearchAuthorityState | null> {
  const [row] = await db
    .select({
      id: creatorPartnerships.id,
      researchStatus: creatorPartnerships.researchStatus,
      research: creatorPartnerships.research,
      fitScore: creatorPartnerships.fitScore,
      needsVerification: creatorPartnerships.needsVerification,
      researchError: creatorPartnerships.researchError,
      metadata: creatorPartnerships.metadata,
    })
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, partnershipId))
    .limit(1);
  if (!row) return null;
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    partnershipId: row.id,
    researchRunId: readMetadataString(metadata, 'researchRunId'),
    researchStartedAt: readMetadataString(metadata, 'researchStartedAt'),
    researchStatus: row.researchStatus,
    research: row.research,
    fitScore: row.fitScore,
    needsVerification: row.needsVerification,
    researchError: row.researchError,
    metadata,
  };
}

export async function completePartnershipResearchFenced(input: {
  partnershipId: string;
  researchRunId: string;
  patch: Partial<typeof creatorPartnerships.$inferInsert>;
}): Promise<{ applied: boolean }> {
  const rows = await db
    .update(creatorPartnerships)
    .set({ ...input.patch, updatedAt: new Date() })
    .where(
      and(
        eq(creatorPartnerships.id, input.partnershipId),
        eq(creatorPartnerships.researchStatus, 'researching'),
        sql`${creatorPartnerships.metadata}->>'researchRunId' = ${input.researchRunId}`,
      ),
    )
    .returning({ id: creatorPartnerships.id });

  if (rows.length === 0) {
    logStructured({
      level: 'warn',
      service: 'creator-partnership',
      message: 'stale_research_execution_terminal_write',
      event: 'stale_research_execution',
      partnershipId: input.partnershipId,
      staleResearchRunId: input.researchRunId,
      attemptedTerminalStatus: input.patch.researchStatus ?? 'complete',
    });
  }

  return { applied: rows.length > 0 };
}

export async function failPartnershipResearchFenced(input: {
  partnershipId: string;
  researchRunId: string;
  error: string;
}): Promise<{ applied: boolean }> {
  return completePartnershipResearchFenced({
    partnershipId: input.partnershipId,
    researchRunId: input.researchRunId,
    patch: {
      researchStatus: 'failed',
      researchError: input.error,
    },
  });
}

export function isResearchLeaseExpired(researchStartedAt: string | null | undefined, nowMs = Date.now()): boolean {
  if (!researchStartedAt) return true;
  if (!new RegExp(ISO_TIMESTAMP_PREFIX_RE).test(researchStartedAt)) return true;
  const startedMs = Date.parse(researchStartedAt);
  if (Number.isNaN(startedMs)) return true;
  return nowMs - startedMs >= RESEARCH_LEASE_MS;
}

export function shouldAttemptPartnershipResearch(input: {
  researchStatus: string;
  researchedAt: string | null | undefined;
  researchStartedAt?: string | null;
}): boolean {
  if (input.researchStatus === 'queued' || input.researchStatus === 'failed') return true;
  if (input.researchStatus === 'researching') return true;
  if (input.researchStatus === 'complete' || input.researchStatus === 'needs_verification') {
    if (!input.researchedAt) return true;
    if (!new RegExp(ISO_TIMESTAMP_PREFIX_RE).test(input.researchedAt)) return true;
    const researchedMs = Date.parse(input.researchedAt);
    if (Number.isNaN(researchedMs)) return true;
    return Date.now() - researchedMs > STALE_RESEARCH_MS;
  }
  return false;
}
