import type { CalendarIntent } from '../intents.js';
import type { CalendarItemType, CalendarPlanningStatus } from '../types.js';

export type PopulationCandidate = {
  sourceRecordType: string;
  sourceRecordId: string;
  calendarIntent: CalendarIntent;
  itemType: CalendarItemType;
  planningStatus: CalendarPlanningStatus;
  title: string;
  description?: string | null;
  startAt: string;
  endAt?: string | null;
  allDay?: boolean;
  timezone?: string;
  location?: string | null;
  sourceUrl?: string | null;
  internalDetailUrl?: string | null;
  occurrenceFingerprint: string;
  idempotencyKey: string;
  confidence?: number;
  verificationState?: string;
  populationSource: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
  whyIncluded?: string;
};

export type PopulationRejection = {
  sourceRecordType: string;
  sourceRecordId: string;
  calendarIntent?: CalendarIntent;
  title?: string;
  reason: string;
  category: 'expired' | 'stale' | 'suppressed' | 'dismissed' | 'skipped' | 'duplicate' | 'excluded' | 'no_date' | 'test';
};

export type CalendarBackfillReport = {
  scanned: number;
  eligible: number;
  rejected: PopulationRejection[];
  stale: number;
  expired: number;
  suppressed: number;
  dismissed: number;
  skipped: number;
  duplicates: number;
  suggestedToCreate: number;
  tentativeToCreate: number;
  confirmedToCreate: number;
  existingPreserved: number;
  existingUpdated: number;
  created: number;
  updated: number;
  samples: {
    created: Array<{ title: string; intent: string; status: string }>;
    rejected: Array<{ title: string; reason: string }>;
    preserved: Array<{ title: string; reason: string }>;
  };
  dryRun: boolean;
  ranAt: string;
};
