/**
 * Muse is one more untrusted source. Dispositions match Calendar admission.
 * Outreach is never a disposition.
 */

export const MUSE_SOURCE_ID = 'muse-agent' as const;

export const MUSE_INGEST_HEADER = 'x-benson-ingest-key' as const;

export const MUSE_INGEST_ENV = 'MUSE_INGEST_KEY' as const;

/** ~1 MiB JSON body cap. */
export const MUSE_INGEST_MAX_BYTES = 1_048_576;

export const MUSE_INGEST_RATE_LIMIT = 60;

export const MUSE_INGEST_RATE_WINDOW_MS = 60_000;

export const MUSE_ITEM_TYPES = [
  'event_finding',
  'opportunity_dossier',
  'opening_establishment',
] as const;

export type MuseItemType = (typeof MUSE_ITEM_TYPES)[number];

export type MuseDisposition = 'accepted' | 'merged_duplicate' | 'quarantined' | 'rejected';

export type MuseItemResult = {
  fingerprint: string;
  disposition: MuseDisposition;
  reason: string;
};

export type MuseProvenance = {
  found_via: string;
  found_at: string;
  evidence_urls: string[];
};

export type ValidatedMuseItem = {
  type: MuseItemType;
  source: typeof MUSE_SOURCE_ID;
  fingerprint: string;
  provenance: MuseProvenance;
  raw: Record<string, unknown>;
};

export type StoredMuseItem = {
  source: string;
  fingerprint: string;
  disposition: MuseDisposition;
  reason: string;
  routedKind: string | null;
  routedId: string | null;
};

export type MuseRouteOutcome = {
  disposition: MuseDisposition;
  reason: string;
  routedKind: string | null;
  routedId: string | null;
  canonicalUrl: string | null;
};

export type EventRouteInput = {
  item: ValidatedMuseItem;
  now: Date;
};

export type DossierRouteInput = {
  item: ValidatedMuseItem;
};

export type OpeningRouteInput = {
  item: ValidatedMuseItem;
};

export interface MuseIngestStore {
  beginRun(input: { rawPayload: unknown; itemCount: number }): Promise<{ id: string }>;
  completeRun(
    id: string,
    dispositions: MuseItemResult[],
    status: 'completed' | 'invalid_json' | 'failed',
    error?: string,
  ): Promise<void>;
  findItem(source: string, fingerprint: string): Promise<StoredMuseItem | null>;
  /**
   * Insert the first disposition for (source, fingerprint).
   * Conflict means a concurrent writer won; caller must re-read and return that row.
   */
  commitItem(row: {
    runId: string;
    source: string;
    fingerprint: string;
    itemType: string;
    disposition: MuseDisposition;
    reason: string;
    canonicalUrl: string | null;
    rawItem: unknown;
    routedKind: string | null;
    routedId: string | null;
  }): Promise<'inserted' | 'conflict'>;
  routeEvent(input: EventRouteInput): Promise<MuseRouteOutcome>;
  routeDossier(input: DossierRouteInput): Promise<MuseRouteOutcome>;
  routeOpening(input: OpeningRouteInput): Promise<MuseRouteOutcome>;
}
