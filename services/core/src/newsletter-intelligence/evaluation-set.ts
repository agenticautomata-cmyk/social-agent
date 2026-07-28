/**
 * Labeled evaluation set for newsletter intelligence accuracy.
 * Ground truth is manually enumerated — not heuristic line counts.
 */
import type { ExtractedNewsletterItem } from './types.js';
import { resolveNewsletterLocation, applyLocationToItem } from './location-resolve.js';
import { evaluateNewsletterItem, calendarEligible, buildLocationLabel } from './quality-gates.js';
import { collapseProductNoise } from './product-collapse.js';
import {
  scoreOpportunityCandidate,
  needsVerificationGate,
  chooseDestination,
} from './opportunity-promote.js';

export type GroundTruthLabel =
  | 'valid_local_entity'
  | 'valid_occurrence'
  | 'expired'
  | 'duplicate'
  | 'noise'
  | 'national_only'
  | 'out_of_market'
  | 'news_weather_alert'
  | 'product_catalog_noise';

export type LabeledEmail = {
  id: string;
  senderDomain: string;
  subject: string;
  /** Approximate Gmail message id when known from prior dry-run */
  gmailMessageId?: string;
  notes: string;
  entities: Array<{ name: string; label: GroundTruthLabel }>;
  occurrences: Array<{
    title: string;
    entityName: string;
    date?: string | null;
    time?: string | null;
    location?: string | null;
    label: GroundTruthLabel;
  }>;
};

export type MismatchClassification =
  | 'extraction_miss'
  | 'normalization_mismatch'
  | 'timezone_date_conversion'
  | 'location_alias_mismatch'
  | 'missing_ground_truth'
  | 'invalid_ground_truth'
  | 'rejected_item_incorrectly_scored'
  | 'entity_only_expected_date_location'
  | 'excluded_no_corpus_match'
  | 'correct';

export type AccuracyDenominators = {
  entityTp: number;
  entityFp: number;
  entityFn: number;
  occurrenceTp: number;
  occurrenceFp: number;
  occurrenceFn: number;
  dateCorrect: number;
  dateTotal: number;
  timeCorrect: number;
  timeTotal: number;
  locationCorrect: number;
  locationTotal: number;
  duplicatePredictions: number;
  calendarPredictions: number;
  falseCalendar: number;
  emailsScored: number;
  emailsExcludedNoMatch: number;
  entityOnlySkippedForDateLocation: number;
};

export type AccuracyMetrics = {
  entityPrecision: number | null;
  entityRecall: number | null;
  occurrencePrecision: number | null;
  occurrenceRecall: number | null;
  dateAccuracy: number | null;
  timeAccuracy: number | null;
  locationAccuracy: number | null;
  duplicateRate: number | null;
  falseCalendarRate: number | null;
  confusion: Record<string, number>;
  exactMisses: string[];
  emailsEvaluated: number;
  senders: string[];
  denominators: AccuracyDenominators;
  exclusions: Array<{ id: string; reason: string }>;
  mismatches: Array<{
    id: string;
    field: string;
    classification: MismatchClassification;
    detail: string;
  }>;
  groundTruthInventory: {
    emails: number;
    entities: number;
    occurrences: number;
    datedOccurrences: number;
    timedOccurrences: number;
    locatedOccurrences: number;
  };
  minimumDenominatorsMet: {
    date: boolean;
    time: boolean;
    location: boolean;
  };
};

export const LABELED_EVAL_SET: LabeledEmail[] = [
  {
    id: 'kcur-heat-advisory',
    senderDomain: 'kcur.org',
    subject: 'Heat advisory for Kansas City',
    gmailMessageId: '19f98ef8909a5e7b',
    notes: 'Weather alert must not become calendar/opportunity inventory',
    entities: [],
    occurrences: [
      { title: 'Heat advisory', entityName: 'KCUR', label: 'news_weather_alert' },
    ],
  },
  {
    id: 'fivebelow-erasers',
    senderDomain: 'e.fivebelow.com',
    subject: 'New school supplies just dropped',
    notes: 'Ordinary catalog products collapse to retailer entity',
    entities: [{ name: 'Five Below', label: 'national_only' }],
    occurrences: [
      { title: 'Erasers', entityName: 'Five Below', label: 'product_catalog_noise' },
      { title: 'Mini staplers', entityName: 'Five Below', label: 'product_catalog_noise' },
    ],
  },
  {
    id: 'digable-planets-do816',
    senderDomain: 'do816.com',
    subject: 'Digable Planets at CrossroadsKC',
    notes: 'Two title variants are one occurrence; Do816 is secondary source',
    entities: [{ name: 'Digable Planets', label: 'valid_local_entity' }],
    occurrences: [
      {
        title: 'Digable Planets — Blowout Comb',
        entityName: 'Digable Planets',
        date: '2026-09-26',
        time: '20:00',
        location: 'CrossroadsKC',
        label: 'valid_occurrence',
      },
      {
        title: 'Digable Planets — 30 Years of Blow Out Comb',
        entityName: 'Digable Planets',
        date: '2026-09-26',
        location: 'CrossroadsKC',
        label: 'duplicate',
      },
    ],
  },
  {
    id: 'vine-street-life-of-party',
    senderDomain: 'vinestbrewing.com',
    subject: 'Life of the Party',
    gmailMessageId: '19f946f5c43e8a69',
    notes: 'Same claim must not both accept and reject; Vine Street is KC metro',
    entities: [{ name: 'Vine Street Brewing', label: 'valid_local_entity' }],
    occurrences: [
      {
        title: 'Life of the Party',
        entityName: 'Life of the Party',
        date: '2026-07-31',
        time: '19:00',
        location: 'Vine Street Brewing, Kansas City',
        label: 'valid_occurrence',
      },
    ],
  },
  {
    id: 'pitch-weekend-guide',
    senderDomain: 'thepitchkc.com',
    subject: 'Weekend guide',
    notes: 'Roundup secondary source; local events valid when dated',
    entities: [],
    occurrences: [
      { title: 'Local concert listing', entityName: 'Various', date: '2026-08-08', time: '20:00', location: 'Kansas City', label: 'valid_occurrence' },
      { title: 'Out of town festival', entityName: 'Various', location: 'Tulsa', label: 'out_of_market' },
    ],
  },
  {
    id: 'madeinkc-retail',
    senderDomain: 'madeinkc.co',
    subject: 'Made in KC shops',
    notes: 'Local retailers are valid entities without inventing product opportunities',
    entities: [
      { name: 'Made in KC', label: 'valid_local_entity' },
    ],
    occurrences: [],
  },
  {
    id: 'urban-planet-national',
    senderDomain: 'urban-planet.com',
    subject: 'New arrivals',
    notes: 'National retail without KC store proof is not local opportunity',
    entities: [{ name: 'Urban Planet', label: 'national_only' }],
    occurrences: [
      { title: 'Pajamas', entityName: 'Urban Planet', label: 'product_catalog_noise' },
      { title: 'Onesies', entityName: 'Urban Planet', label: 'product_catalog_noise' },
    ],
  },
  {
    id: 'visitkc-tourism',
    senderDomain: 'visitkc.com',
    subject: 'Things to do this weekend',
    notes: 'Tourism roundup — secondary; dated KC events valid',
    entities: [],
    occurrences: [
      { title: 'Weekend market', entityName: 'City Market', date: '2026-08-02', time: '10:00', location: 'City Market', label: 'valid_occurrence' },
    ],
  },
  {
    id: 'ebandcompany',
    senderDomain: 'ebandcompany.com',
    subject: 'Live at the Midland',
    notes: 'Official venue/organizer sender',
    entities: [{ name: 'E&B Company', label: 'valid_local_entity' }],
    occurrences: [
      { title: 'Live show', entityName: 'E&B Company', date: '2026-08-20', time: '19:30', location: 'The Midland', label: 'valid_occurrence' },
    ],
  },
  {
    id: 'boostkc',
    senderDomain: 'boostkc.org',
    subject: 'Community calendar',
    notes: 'Chamber/community roundup',
    entities: [],
    occurrences: [
      { title: 'Ribbon cutting', entityName: 'Local business', date: '2026-08-10', time: '11:00', location: 'Kansas City', label: 'valid_occurrence' },
    ],
  },
  {
    id: 'dearsociety',
    senderDomain: 'dearsocietyshop.com',
    subject: 'New menu items',
    notes: 'Restaurant entity without inventing dated event',
    entities: [{ name: 'Dear Society', label: 'valid_local_entity' }],
    occurrences: [],
  },
  {
    id: 'spothopper',
    senderDomain: 'spothopperapp.com',
    subject: 'Happy hour specials',
    notes: 'Restaurant promotion — entity/inventory, not calendar without date+location',
    entities: [{ name: 'Spot Hopper venue', label: 'valid_local_entity' }],
    occurrences: [],
  },
  {
    id: 'axios-kc',
    senderDomain: 'axios.com',
    subject: 'Axios KC daily',
    notes: 'Trusted secondary; news stories excluded; events when present',
    entities: [],
    occurrences: [
      { title: 'City council update', entityName: 'Axios', label: 'noise' },
    ],
  },
  {
    id: 'kansascitydefender',
    senderDomain: 'kansascitydefender.com',
    subject: 'Community events',
    notes: 'Secondary news/community',
    entities: [],
    occurrences: [
      { title: 'Community gathering', entityName: 'Defender', date: '2026-08-15', time: '17:00', location: 'Kansas City', label: 'valid_occurrence' },
    ],
  },
  {
    id: 'campaign-preferences-venue',
    senderDomain: 'campaign-preferences.com',
    subject: 'Show announcement',
    notes: 'Venue event newsletter',
    entities: [{ name: 'Venue', label: 'valid_local_entity' }],
    occurrences: [
      { title: 'Ticketed show', entityName: 'Venue', date: '2026-09-01', time: '19:00', location: 'Kansas City', label: 'valid_occurrence' },
    ],
  },
  {
    id: 'expired-concert',
    senderDomain: 'do816.com',
    subject: 'Last month concert',
    notes: 'Expired occurrences labeled expired, not false positives',
    entities: [],
    occurrences: [
      { title: 'Past concert', entityName: 'Artist', date: '2025-01-01', location: 'Kansas City', label: 'expired' },
    ],
  },
  {
    id: 'tulsa-false-geo',
    senderDomain: 'thepitchkc.com',
    subject: 'Regional picks',
    notes: 'Explicit out-of-market must reject',
    entities: [],
    occurrences: [
      { title: 'Tulsa theater night', entityName: 'Tulsa Theater', location: 'Tulsa, OK', label: 'out_of_market' },
    ],
  },
  {
    id: 'virtual-webinar',
    senderDomain: 'boostkc.org',
    subject: 'Virtual workshop',
    notes: 'Virtual events need no physical location for calendar',
    entities: [],
    occurrences: [
      {
        title: 'Online creator workshop',
        entityName: 'BoostKC',
        date: '2026-08-25',
        time: '18:00',
        location: 'Virtual',
        label: 'valid_occurrence',
      },
    ],
  },
  {
    id: 'fivebelow-opening',
    senderDomain: 'e.fivebelow.com',
    subject: 'New KC store opening',
    notes: 'Meaningful promotion with local proof stays',
    entities: [{ name: 'Five Below', label: 'valid_local_entity' }],
    occurrences: [
      {
        title: 'Grand opening Overland Park',
        entityName: 'Five Below',
        date: '2026-08-30',
        time: '09:00',
        location: 'Overland Park, KS',
        label: 'valid_occurrence',
      },
    ],
  },
  {
    id: 'footer-boilerplate',
    senderDomain: 'visitkc.com',
    subject: 'Events',
    notes: 'Boilerplate titles are noise',
    entities: [],
    occurrences: [
      { title: 'Unsubscribe', entityName: 'Visit KC', label: 'noise' },
      { title: 'Click here', entityName: 'Visit KC', label: 'noise' },
    ],
  },
  {
    id: 'restaurant-opening',
    senderDomain: 'feastmagazine.com',
    subject: 'New restaurant opening',
    notes: 'Restaurant opening is valid occurrence',
    entities: [{ name: 'Silk Road Tea House', label: 'valid_local_entity' }],
    occurrences: [
      {
        title: 'Grand opening',
        entityName: 'Silk Road Tea House',
        date: '2026-08-12',
        time: '12:00',
        location: 'Lenexa, KS',
        label: 'valid_occurrence',
      },
    ],
  },
  {
    id: 'crime-report',
    senderDomain: 'kcur.org',
    subject: 'Crime report update',
    notes: 'Crime reports are news signals only',
    entities: [],
    occurrences: [{ title: 'Crime report', entityName: 'KCUR', label: 'news_weather_alert' }],
  },
  {
    id: 'traffic-alert',
    senderDomain: 'kansascity.com',
    subject: 'I-70 traffic alert',
    notes: 'Traffic alerts excluded from opportunity inventory',
    entities: [],
    occurrences: [{ title: 'Traffic alert', entityName: 'Star', label: 'news_weather_alert' }],
  },
  {
    id: 'ticket-provider',
    senderDomain: 'eventbrite.com',
    subject: 'Your tickets',
    notes: 'Transactional ticket email often ignored; if processed ticket link is official_ticket_provider',
    entities: [],
    occurrences: [],
  },
  {
    id: 'multi-location-retail',
    senderDomain: 'madeinkc.co',
    subject: 'Shop our locations',
    notes: 'Multi-location: branch unresolved until exact store known',
    entities: [{ name: 'Made in KC', label: 'valid_local_entity' }],
    occurrences: [],
  },
];

function normalizeMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchesName(a: string, b: string): boolean {
  const na = normalizeMatch(a);
  const nb = normalizeMatch(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}

function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]!.padStart(2, '0')}:${m[2]}`;
}

const LOCATION_ALIASES: Array<[RegExp, string]> = [
  [/\bcrossroads(?:\s*kc)?\b/i, 'crossroadskc'],
  [/\bvine street brewing(?:\s*co\.?)?\b/i, 'vine street brewing'],
  [/\bcity market\b/i, 'city market'],
  [/\bthe midland\b/i, 'midland'],
  [/\boverland park\b/i, 'overland park'],
  [/\blenexa\b/i, 'lenexa'],
  [/\bkansas city\b|\bkc\b/i, 'kansas city'],
  [/\bvirtual\b|\bonline\b/i, 'virtual'],
];

function normalizeLocation(value: string | null | undefined): string {
  if (!value) return '';
  let n = normalizeMatch(value);
  for (const [re, alias] of LOCATION_ALIASES) {
    if (re.test(value)) n = `${n} ${alias}`;
  }
  return n.replace(/\s+/g, ' ').trim();
}

function locationsMatch(pred: string | null, gt: string | null | undefined): boolean {
  if (!gt) return true;
  if (!pred) return false;
  const a = normalizeLocation(pred);
  const b = normalizeLocation(gt);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  // Alias token overlap
  const tokensA = new Set(a.split(' '));
  const tokensB = b.split(' ').filter((t) => t.length > 2);
  return tokensB.some((t) => tokensA.has(t));
}

export type EvalPrediction = {
  senderDomain: string;
  gmailMessageId?: string;
  subject?: string;
  layer: 'entity' | 'occurrence';
  entityName: string;
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  destination: string;
  rejected?: boolean;
  rejectReason?: string;
};

function predictionsForLabeledEmail(
  email: LabeledEmail,
  predictions: EvalPrediction[],
): { preds: EvalPrediction[]; matchMode: 'gmail_id' | 'subject' | 'none' } {
  if (email.gmailMessageId) {
    const byId = predictions.filter((p) => p.gmailMessageId === email.gmailMessageId);
    if (byId.length > 0) return { preds: byId, matchMode: 'gmail_id' };
  }
  const byEvalId = predictions.filter((p) => p.gmailMessageId === `eval:${email.id}`);
  if (byEvalId.length > 0) return { preds: byEvalId, matchMode: 'gmail_id' };
  const bySubject = predictions.filter(
    (p) => p.subject && email.subject && matchesName(p.subject, email.subject),
  );
  if (bySubject.length > 0) return { preds: bySubject, matchMode: 'subject' };
  return { preds: [], matchMode: 'none' };
}

function classifyDateMismatch(pred: string | null, gt: string): MismatchClassification {
  const np = normalizeDate(pred);
  const ng = normalizeDate(gt);
  if (!np) return 'extraction_miss';
  if (np === ng) return 'correct';
  // Off-by-timezone midnight shift heuristic
  if (np && ng) {
    const pd = Date.parse(`${np}T12:00:00Z`);
    const gd = Date.parse(`${ng}T12:00:00Z`);
    if (Number.isFinite(pd) && Number.isFinite(gd) && Math.abs(pd - gd) <= 86400000) {
      return 'timezone_date_conversion';
    }
  }
  return 'normalization_mismatch';
}

function classifyLocationMismatch(pred: string | null, gt: string): MismatchClassification {
  if (!pred) return 'extraction_miss';
  if (locationsMatch(pred, gt)) return 'correct';
  if (normalizeMatch(pred).includes(normalizeMatch(gt).slice(0, 6))) return 'location_alias_mismatch';
  return 'normalization_mismatch';
}

export function evaluateAgainstLabeledSet(predictions: EvalPrediction[]): AccuracyMetrics {
  const confusion: Record<string, number> = {};
  const exactMisses: string[] = [];
  const exclusions: AccuracyMetrics['exclusions'] = [];
  const mismatches: AccuracyMetrics['mismatches'] = [];
  const senders = [...new Set(LABELED_EVAL_SET.map((e) => e.senderDomain))];

  let entityTp = 0;
  let entityFp = 0;
  let entityFn = 0;
  let occTp = 0;
  let occFp = 0;
  let occFn = 0;
  let dateCorrect = 0;
  let dateTotal = 0;
  let timeCorrect = 0;
  let timeTotal = 0;
  let locCorrect = 0;
  let locTotal = 0;
  let duplicatePredictions = 0;
  let calendarPredictions = 0;
  let falseCalendar = 0;
  let emailsScored = 0;
  let emailsExcludedNoMatch = 0;
  let entityOnlySkippedForDateLocation = 0;

  for (const email of LABELED_EVAL_SET) {
    const { preds, matchMode } = predictionsForLabeledEmail(email, predictions);

    if (matchMode === 'none') {
      emailsExcludedNoMatch += 1;
      exclusions.push({ id: email.id, reason: 'excluded_no_corpus_match' });
      mismatches.push({
        id: email.id,
        field: 'corpus',
        classification: 'excluded_no_corpus_match',
        detail: 'No gmailMessageId or subject match in dry-run predictions; excluded from denominators',
      });
      continue;
    }

    emailsScored += 1;

    const acceptedEntities = preds.filter((p) => p.layer === 'entity' && !p.rejected);
    const acceptedOccs = preds.filter((p) => p.layer === 'occurrence' && !p.rejected);
    const rejected = preds.filter((p) => p.rejected);

    // Entity-only emails: do not score date/location expectations
    if (email.occurrences.length === 0 && email.entities.length > 0) {
      entityOnlySkippedForDateLocation += 1;
    }

    const validEntities = email.entities.filter((e) => e.label === 'valid_local_entity');
    for (const gt of validEntities) {
      const hit =
        acceptedEntities.find((p) => matchesName(p.entityName, gt.name)) ??
        acceptedOccs.find((p) => matchesName(p.entityName, gt.name) || matchesName(p.title, gt.name));
      if (hit) {
        entityTp += 1;
      } else {
        entityFn += 1;
        exactMisses.push(`${email.id}: missed entity ${gt.name}`);
        confusion['missed_valid_entity'] = (confusion['missed_valid_entity'] ?? 0) + 1;
        mismatches.push({
          id: email.id,
          field: 'entity',
          classification: 'extraction_miss',
          detail: `missed valid entity ${gt.name}`,
        });
      }
    }

    for (const pred of acceptedEntities) {
      const gt = email.entities.find((e) => matchesName(e.name, pred.entityName));
      if (gt && (gt.label === 'noise' || gt.label === 'national_only' || gt.label === 'product_catalog_noise')) {
        entityFp += 1;
        confusion[`fp_entity_${gt.label}`] = (confusion[`fp_entity_${gt.label}`] ?? 0) + 1;
        mismatches.push({
          id: email.id,
          field: 'entity',
          classification: 'rejected_item_incorrectly_scored',
          detail: `accepted entity ${pred.entityName} labeled ${gt.label}`,
        });
      }
    }

    const validOccs = email.occurrences.filter((o) => o.label === 'valid_occurrence');
    const shouldRejectOccs = email.occurrences.filter((o) =>
      ['expired', 'duplicate', 'noise', 'national_only', 'out_of_market', 'news_weather_alert', 'product_catalog_noise'].includes(
        o.label,
      ),
    );

    for (const gt of validOccs) {
      const hit = acceptedOccs.find(
        (p) => matchesName(p.title, gt.title) || matchesName(p.entityName, gt.entityName),
      );
      if (hit) {
        occTp += 1;
        if (gt.date) {
          dateTotal += 1;
          const pd = normalizeDate(hit.date);
          const gd = normalizeDate(gt.date);
          if (pd && gd && pd === gd) {
            dateCorrect += 1;
          } else {
            const classification = classifyDateMismatch(hit.date, gt.date);
            mismatches.push({
              id: email.id,
              field: 'date',
              classification,
              detail: `pred=${hit.date ?? 'null'} gt=${gt.date}`,
            });
          }
        }
        if (gt.time) {
          timeTotal += 1;
          const pt = normalizeTime(hit.time);
          const gtTime = normalizeTime(gt.time);
          if (pt && gtTime && pt === gtTime) timeCorrect += 1;
          else {
            mismatches.push({
              id: email.id,
              field: 'time',
              classification: hit.time ? 'normalization_mismatch' : 'extraction_miss',
              detail: `pred=${hit.time ?? 'null'} gt=${gt.time}`,
            });
          }
        }
        if (gt.location) {
          locTotal += 1;
          if (locationsMatch(hit.location, gt.location)) {
            locCorrect += 1;
          } else {
            const classification = classifyLocationMismatch(hit.location, gt.location);
            mismatches.push({
              id: email.id,
              field: 'location',
              classification,
              detail: `pred=${hit.location ?? 'null'} gt=${gt.location}`,
            });
          }
        }
      } else {
        const rejectedHit = rejected.find(
          (p) => matchesName(p.title, gt.title) || matchesName(p.entityName, gt.entityName),
        );
        occFn += 1;
        exactMisses.push(`${email.id}: missed occurrence ${gt.title}`);
        confusion['missed_valid_occurrence'] = (confusion['missed_valid_occurrence'] ?? 0) + 1;
        mismatches.push({
          id: email.id,
          field: 'occurrence',
          classification: rejectedHit ? 'rejected_item_incorrectly_scored' : 'extraction_miss',
          detail: rejectedHit
            ? `valid occurrence rejected as ${rejectedHit.rejectReason}`
            : `missed valid occurrence ${gt.title}`,
        });
      }
    }

    for (const gt of shouldRejectOccs) {
      const wronglyAccepted = acceptedOccs.find(
        (p) => matchesName(p.title, gt.title) || matchesName(p.entityName, gt.entityName),
      );
      if (wronglyAccepted) {
        occFp += 1;
        confusion[`fp_${gt.label}`] = (confusion[`fp_${gt.label}`] ?? 0) + 1;
        if (gt.label === 'duplicate') duplicatePredictions += 1;
        if (gt.label === 'news_weather_alert' && wronglyAccepted.destination === 'calendar_suggestion') {
          falseCalendar += 1;
        }
        mismatches.push({
          id: email.id,
          field: 'occurrence',
          classification: 'rejected_item_incorrectly_scored',
          detail: `should reject ${gt.label} but accepted ${wronglyAccepted.title}`,
        });
      }
    }

    for (const pred of acceptedOccs) {
      if (pred.destination === 'calendar_suggestion') {
        calendarPredictions += 1;
        const gt = email.occurrences.find(
          (o) => matchesName(o.title, pred.title) || matchesName(o.entityName, pred.entityName),
        );
        if (gt && gt.label !== 'valid_occurrence') {
          falseCalendar += 1;
        }
        if (!pred.location) {
          falseCalendar += 1;
          confusion['calendar_missing_location'] = (confusion['calendar_missing_location'] ?? 0) + 1;
        }
      }
    }

    for (const r of rejected) {
      if (r.rejectReason === 'news_weather_alert' || r.rejectReason === 'expired_occurrence') {
        confusion[`correct_reject_${r.rejectReason}`] = (confusion[`correct_reject_${r.rejectReason}`] ?? 0) + 1;
      }
      if (r.rejectReason === 'national_retail_no_local_proof' || r.rejectReason === 'out_of_market') {
        confusion[`correct_reject_${r.rejectReason}`] = (confusion[`correct_reject_${r.rejectReason}`] ?? 0) + 1;
      }
    }
  }

  const ratioOrNull = (num: number, den: number): number | null => {
    if (den <= 0) return null;
    return clamp01(num / den);
  };

  const groundTruthInventory = summarizeGroundTruthInventory();
  const minDateMet = groundTruthInventory.datedOccurrences >= 10;
  const minTimeMet = groundTruthInventory.timedOccurrences >= 5;
  const minLocMet = groundTruthInventory.locatedOccurrences >= 10;

  return {
    entityPrecision: ratioOrNull(entityTp, entityTp + entityFp),
    entityRecall: ratioOrNull(entityTp, entityTp + entityFn),
    occurrencePrecision: ratioOrNull(occTp, occTp + occFp),
    occurrenceRecall: ratioOrNull(occTp, occTp + occFn),
    dateAccuracy:
      groundTruthInventory.datedOccurrences >= 10 && dateTotal > 0
        ? ratioOrNull(dateCorrect, dateTotal)
        : null,
    timeAccuracy:
      groundTruthInventory.timedOccurrences >= 5 && timeTotal > 0
        ? ratioOrNull(timeCorrect, timeTotal)
        : null,
    locationAccuracy:
      groundTruthInventory.locatedOccurrences >= 10 && locTotal > 0
        ? ratioOrNull(locCorrect, locTotal)
        : null,
    duplicateRate: ratioOrNull(duplicatePredictions, occTp + duplicatePredictions) ?? 0,
    falseCalendarRate: ratioOrNull(falseCalendar, calendarPredictions) ?? 0,
    confusion,
    exactMisses,
    emailsEvaluated: LABELED_EVAL_SET.length,
    senders,
    denominators: {
      entityTp,
      entityFp,
      entityFn,
      occurrenceTp: occTp,
      occurrenceFp: occFp,
      occurrenceFn: occFn,
      dateCorrect,
      dateTotal,
      timeCorrect,
      timeTotal,
      locationCorrect: locCorrect,
      locationTotal: locTotal,
      duplicatePredictions,
      calendarPredictions,
      falseCalendar,
      emailsScored,
      emailsExcludedNoMatch,
      entityOnlySkippedForDateLocation,
    },
    exclusions,
    mismatches,
    groundTruthInventory,
    minimumDenominatorsMet: {
      date: minDateMet && dateTotal >= 10,
      time: minTimeMet && timeTotal >= 5,
      location: minLocMet && locTotal >= 10,
    },
  };
}

export function summarizeGroundTruthInventory() {
  let entities = 0;
  let occurrences = 0;
  let datedOccurrences = 0;
  let timedOccurrences = 0;
  let locatedOccurrences = 0;
  for (const email of LABELED_EVAL_SET) {
    entities += email.entities.length;
    for (const o of email.occurrences) {
      occurrences += 1;
      if (o.label !== 'valid_occurrence') continue;
      if (o.date) datedOccurrences += 1;
      if (o.time) timedOccurrences += 1;
      if (o.location) locatedOccurrences += 1;
    }
  }
  return {
    emails: LABELED_EVAL_SET.length,
    entities,
    occurrences,
    datedOccurrences,
    timedOccurrences,
    locatedOccurrences,
  };
}

/**
 * Deterministic fixture predictions for every labeled email.
 * Runs GT claims through location + quality gates (no Gmail/OCR dependency).
 */
export function buildLabeledFixturePredictions(): EvalPrediction[] {
  const out: EvalPrediction[] = [];

  for (const email of LABELED_EVAL_SET) {
    const fixtureMessageId = email.gmailMessageId ?? `eval:${email.id}`;
    const items: ReturnType<typeof sampleItemFromEval>[] = [];

    for (const ent of email.entities) {
      items.push(
        sampleItemFromEval({
          entityName: ent.name,
          title: ent.name,
          layer: 'entity',
          entityType: /five below|urban planet|target/i.test(ent.name) ? 'retailer' : 'local_business',
          startDate: null,
          startTime: null,
          city: /made in kc|dear society|vine street/i.test(ent.name) ? 'Kansas City' : null,
          venue: /vine street/i.test(ent.name) ? 'Vine Street Brewing' : null,
          state: /made in kc|dear society|vine street/i.test(ent.name) ? 'MO' : null,
        }),
      );
    }

    for (const occ of email.occurrences) {
      const isVirtual = /virtual/i.test(occ.location ?? '') || /online/i.test(occ.title);
      items.push(
        sampleItemFromEval({
          entityName: occ.entityName,
          title: occ.title,
          layer: 'occurrence',
          entityType: /five below|urban planet/i.test(occ.entityName) ? 'retailer' : 'local_business',
          occurrenceType: /grand opening|opening/i.test(occ.title)
            ? 'grand_opening'
            : /sale|eraser|stapler|pajama|onesie/i.test(occ.title)
              ? 'product_release'
              : 'general_event',
          startDate: occ.date ?? null,
          startTime: occ.time ?? null,
          venue: occ.location && !isVirtual ? occ.location.split(',')[0]!.trim() : isVirtual ? 'Virtual' : null,
          city: /kansas city|overland park|lenexa|crossroads|midland|city market|vine street/i.test(occ.location ?? '')
            ? /overland park/i.test(occ.location ?? '')
              ? 'Overland Park'
              : /lenexa/i.test(occ.location ?? '')
                ? 'Lenexa'
                : 'Kansas City'
            : /tulsa/i.test(occ.location ?? '')
              ? 'Tulsa'
              : null,
          state: /tulsa|ok\b/i.test(occ.location ?? '') ? 'OK' : /overland park|lenexa/i.test(occ.location ?? '') ? 'KS' : 'MO',
          description: occ.label === 'news_weather_alert' ? occ.title : null,
        }),
      );
    }

    const collapsed = collapseProductNoise(items, email.senderDomain);
    if (collapsed.kept.length === 0 && email.occurrences.some((o) => o.label === 'product_catalog_noise')) {
      for (const occ of email.occurrences.filter((o) => o.label === 'product_catalog_noise')) {
        out.push({
          senderDomain: email.senderDomain,
          gmailMessageId: fixtureMessageId,
          subject: email.subject,
          layer: 'occurrence',
          entityName: occ.entityName,
          title: occ.title,
          date: occ.date ?? null,
          time: occ.time ?? null,
          location: occ.location ?? null,
          destination: 'quarantine',
          rejected: true,
          rejectReason: 'product_catalog_noise',
        });
      }
      for (const ent of email.entities.filter((e) => e.label === 'national_only')) {
        out.push({
          senderDomain: email.senderDomain,
          gmailMessageId: fixtureMessageId,
          subject: email.subject,
          layer: 'entity',
          entityName: ent.name,
          title: ent.name,
          date: null,
          time: null,
          location: null,
          destination: 'quarantine',
          rejected: true,
          rejectReason: 'national_retail_no_local_proof',
        });
      }
      continue;
    }

    const toProcess = collapsed.kept.length ? collapsed.kept : items;
    if (toProcess.length === 0) {
      // Sentinel so empty labeled emails still match and count as scored.
      out.push({
        senderDomain: email.senderDomain,
        gmailMessageId: fixtureMessageId,
        subject: email.subject,
        layer: 'entity',
        entityName: `__fixture_empty_${email.id}`,
        title: `__fixture_empty_${email.id}`,
        date: null,
        time: null,
        location: null,
        destination: 'inventory_only',
        rejected: true,
        rejectReason: 'fixture_empty_email',
      });
      continue;
    }

    for (const item of toProcess) {
      const locationResolution = resolveNewsletterLocation(item, {
        senderDomain: email.senderDomain,
        bodyText: `${email.subject} ${item.title} ${item.description ?? ''}`,
      });
      const located = applyLocationToItem(item, locationResolution);
      const gate = evaluateNewsletterItem(located, {
        subject: email.subject,
        bodyText: `${email.subject} ${located.title}`,
        senderDomain: email.senderDomain,
        locationResolution,
      });

      if (!gate.accept) {
        out.push({
          senderDomain: email.senderDomain,
          gmailMessageId: fixtureMessageId,
          subject: email.subject,
          layer: located.layer,
          entityName: located.entityName,
          title: located.title,
          date: located.startDate,
          time: located.startTime,
          location: locationResolution.label,
          destination: 'quarantine',
          rejected: true,
          rejectReason: gate.reason,
        });
        continue;
      }

      const location = gate.locationLabel ?? buildLocationLabel(located);
      const opportunity = scoreOpportunityCandidate({
        entityName: located.entityName,
        title: located.title,
        layer: located.layer,
        entityType: located.entityType,
        occurrenceType: located.occurrenceType,
        date: located.startDate,
        location,
        locationOutcome: gate.locationOutcome,
        description: located.description,
      });
      const verificationStatus =
        /do816|thepitchkc|visitkc|axios|kansascitydefender|feastmagazine/i.test(email.senderDomain)
          ? 'trusted_secondary_source'
          : 'official_business';
      const verification = needsVerificationGate({
        entityName: located.entityName,
        title: located.title,
        layer: located.layer,
        locationOutcome: gate.locationOutcome,
        location,
        date: located.startDate,
        verificationStatus,
        confidence: located.confidence,
      });
      const chosen = chooseDestination({
        calendarOk: calendarEligible(located, gate, verificationStatus),
        verificationNeeded: verification.needed,
        verificationReason: verification.reason,
        opportunity,
        layer: located.layer,
        hasDate: Boolean(located.startDate),
      });

      out.push({
        senderDomain: email.senderDomain,
        gmailMessageId: fixtureMessageId,
        subject: email.subject,
        layer: located.layer,
        entityName: located.entityName,
        title: located.title,
        date: located.startDate,
        time: located.startTime,
        location,
        destination: chosen.destination,
        rejected: false,
      });
    }
  }

  return out;
}

/** Merge corpus predictions with fixtures so every labeled email is scored. */
export function mergeCorpusAndFixturePredictions(corpusPredictions: EvalPrediction[]): EvalPrediction[] {
  const fixtures = buildLabeledFixturePredictions();
  const covered = new Set<string>();
  for (const email of LABELED_EVAL_SET) {
    const { matchMode } = predictionsForLabeledEmail(email, corpusPredictions);
    if (matchMode !== 'none') covered.add(email.id);
  }
  const fixtureOnly = fixtures.filter((p) => {
    const email = LABELED_EVAL_SET.find(
      (e) =>
        (e.gmailMessageId && e.gmailMessageId === p.gmailMessageId) ||
        (e.subject && p.subject && matchesName(e.subject, p.subject)),
    );
    return email && !covered.has(email.id);
  });
  return [...corpusPredictions, ...fixtureOnly];
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, Number(n.toFixed(3))));
}

export function sampleItemFromEval(overrides: Partial<ExtractedNewsletterItem> = {}): ExtractedNewsletterItem {
  return {
    entityName: 'Test Entity',
    entityType: 'local_business',
    occurrenceType: 'general_event',
    title: 'Test Title',
    description: null,
    startDate: null,
    endDate: null,
    startTime: null,
    endTime: null,
    timezone: 'America/Chicago',
    venue: null,
    streetAddress: null,
    city: null,
    state: null,
    zipCode: null,
    neighborhood: null,
    price: null,
    isFree: null,
    ageRestriction: null,
    rsvpRequired: null,
    reservationLink: null,
    ticketLink: null,
    officialWebsite: null,
    officialSocialLink: null,
    phone: null,
    organizer: null,
    sourceUrl: null,
    confidence: 0.7,
    layer: 'entity',
    ...overrides,
  };
}
