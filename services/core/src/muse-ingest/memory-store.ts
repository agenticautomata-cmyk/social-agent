/**
 * In-memory store for tests and the routing rules shared with Postgres:
 * canonical URL merge, location identity merge, no outreach.
 */
import { randomUUID } from 'node:crypto';
import { buildLocationKey, normalizeOpeningBusinessKey } from '../openings-radar/identity.js';
import {
  decideEventAdmission,
  dossierCanonicalUrl,
  eventCanonicalUrl,
  openingEvidenceUrl,
  storedContactRoutes,
  storedDossierFacts,
} from './contract.js';
import type {
  DossierRouteInput,
  EventRouteInput,
  MuseIngestStore,
  MuseItemResult,
  MuseRouteOutcome,
  OpeningRouteInput,
  StoredMuseItem,
} from './types.js';

export type MuseMemoryWrite =
  | {
      kind: 'calendar';
      fingerprint: string;
      canonicalUrl: string | null;
      lifecycle: string;
      autoOutreach: false;
      contentItemId: string;
    }
  | {
      kind: 'opportunity';
      fingerprint: string;
      canonicalUrl: string | null;
      autoOutreach: false;
      outreachTriggered: false;
      business: string;
      contentItemId: string;
      facts: Array<{ claim: string; evidence_url: string | null; verified: boolean | null }>;
      contactRoutes: Array<{ type: string; url: string | null; label: string | null }>;
    }
  | {
      kind: 'opening';
      fingerprint: string;
      evidenceUrl: string | null;
      foundVia: string;
      foundAt: string;
      business: string;
      location: string | null;
      stage: string;
      locationId: string;
      autoOutreach: false;
    };

type RunRow = {
  id: string;
  rawPayload: unknown;
  itemCount: number;
  dispositions: MuseItemResult[];
  status: string;
};

export type MemoryMuseIngestStore = MuseIngestStore & {
  writes: MuseMemoryWrite[];
  runs: RunRow[];
  items: StoredMuseItem[];
};

export function createMemoryMuseIngestStore(): MemoryMuseIngestStore {
  const writes: MuseMemoryWrite[] = [];
  const runs: RunRow[] = [];
  const items: StoredMuseItem[] = [];
  const urls = new Map<string, string>();
  const locations = new Map<string, string>();

  const store: MemoryMuseIngestStore = {
    writes,
    runs,
    items,
    async beginRun(input) {
      const id = randomUUID();
      runs.push({ id, rawPayload: input.rawPayload, itemCount: input.itemCount, dispositions: [], status: 'running' });
      return { id };
    },
    async completeRun(id, dispositions, status) {
      const run = runs.find((row) => row.id === id);
      if (!run) return;
      run.dispositions = dispositions;
      run.status = status;
    },
    async findItem(source, fingerprint) {
      return items.find((row) => row.source === source && row.fingerprint === fingerprint) ?? null;
    },
    async commitItem(row) {
      if (items.some((item) => item.source === row.source && item.fingerprint === row.fingerprint)) {
        return 'conflict';
      }
      items.push({
        source: row.source,
        fingerprint: row.fingerprint,
        disposition: row.disposition,
        reason: row.reason,
        routedKind: row.routedKind,
        routedId: row.routedId,
      });
      return 'inserted';
    },
    async routeEvent(input: EventRouteInput): Promise<MuseRouteOutcome> {
      const canonicalUrl = eventCanonicalUrl(input.item);
      if (canonicalUrl && urls.has(canonicalUrl)) {
        return {
          disposition: 'merged_duplicate',
          reason: 'canonical_url_match',
          routedKind: 'content_item',
          routedId: urls.get(canonicalUrl) ?? null,
          canonicalUrl,
        };
      }
      const admission = decideEventAdmission(input.item, input.now);
      if (admission.disposition === 'rejected') {
        return {
          disposition: 'rejected',
          reason: admission.reason,
          routedKind: null,
          routedId: null,
          canonicalUrl,
        };
      }
      const contentItemId = randomUUID();
      if (canonicalUrl) urls.set(canonicalUrl, contentItemId);
      writes.push({
        kind: 'calendar',
        fingerprint: input.item.fingerprint,
        canonicalUrl,
        lifecycle: admission.disposition,
        autoOutreach: false,
        contentItemId,
      });
      return {
        disposition: admission.disposition,
        reason: admission.reason,
        routedKind: 'content_item',
        routedId: contentItemId,
        canonicalUrl,
      };
    },
    async routeDossier(input: DossierRouteInput): Promise<MuseRouteOutcome> {
      const canonicalUrl = dossierCanonicalUrl(input.item);
      if (canonicalUrl && urls.has(canonicalUrl)) {
        return {
          disposition: 'merged_duplicate',
          reason: 'canonical_url_match',
          routedKind: 'content_item',
          routedId: urls.get(canonicalUrl) ?? null,
          canonicalUrl,
        };
      }
      const contentItemId = randomUUID();
      if (canonicalUrl) urls.set(canonicalUrl, contentItemId);
      writes.push({
        kind: 'opportunity',
        fingerprint: input.item.fingerprint,
        canonicalUrl,
        autoOutreach: false,
        outreachTriggered: false,
        business: String(input.item.raw.business),
        contentItemId,
        facts: storedDossierFacts(input.item),
        contactRoutes: storedContactRoutes(input.item),
      });
      return {
        disposition: 'accepted',
        reason: 'queued_for_review',
        routedKind: 'content_item',
        routedId: contentItemId,
        canonicalUrl,
      };
    },
    async routeOpening(input: OpeningRouteInput): Promise<MuseRouteOutcome> {
      const business = String(input.item.raw.business).trim();
      const location = typeof input.item.raw.location === 'string' ? input.item.raw.location.trim() : null;
      const stage = String(input.item.raw.stage).trim();
      const key = `${normalizeOpeningBusinessKey(business)}|${buildLocationKey({
        businessName: business,
        streetAddress: null,
        suite: null,
        city: null,
        state: null,
        neighborhood: location,
      })}`;
      if (locations.has(key)) {
        return {
          disposition: 'merged_duplicate',
          reason: 'canonical_location_match',
          routedKind: 'opening_location',
          routedId: locations.get(key) ?? null,
          canonicalUrl: openingEvidenceUrl(input.item),
        };
      }
      const locationId = randomUUID();
      locations.set(key, locationId);
      const evidenceUrl = openingEvidenceUrl(input.item);
      writes.push({
        kind: 'opening',
        fingerprint: input.item.fingerprint,
        evidenceUrl,
        foundVia: input.item.provenance.found_via,
        foundAt: input.item.provenance.found_at,
        business,
        location,
        stage,
        locationId,
        autoOutreach: false,
      });
      return {
        disposition: 'accepted',
        reason: 'openings_radar',
        routedKind: 'opening_location',
        routedId: locationId,
        canonicalUrl: evidenceUrl,
      };
    },
  };
  return store;
}
