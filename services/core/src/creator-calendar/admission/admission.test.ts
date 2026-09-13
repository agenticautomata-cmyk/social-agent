/**
 * Permanent Calendar admission fixtures + gate unit tests (second-pass coverage).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NAMED_ADMISSION_FIXTURES,
  admissionEntitiesMatch,
  admissionTitlesLikelySame,
  evaluateCalendarAdmission,
  evaluateEventnessGate,
  evaluateGeographicGate,
  evaluateSourceEvidenceGate,
  evaluateTemporalGate,
  hasMachineTextLeak,
  preferAdmissionStartIso,
  resolveCanonicalVenue,
  sanitizeCalendarDisplay,
  CALENDAR_ADMISSION_RULE_VERSION,
  chicagoDayKeyFromIso,
} from './index.js';
import { dedupePopulationCandidates } from '../population/merge.js';
import type { PopulationCandidate } from '../population/types.js';
import {
  snapshotsEqual,
  suggestionSemanticHash,
  type SuggestionSemanticSnapshot,
} from '../population/semantic-equality.js';

const NOW = new Date('2026-09-12T17:00:00.000Z');

describe('calendar admission named fixtures', () => {
  for (const fixture of NAMED_ADMISSION_FIXTURES) {
    if (fixture.id.startsWith('nerdcon-')) continue;
    if (fixture.id === 'original-sin-wrong-noon') continue; // merge coverage below
    it(`${fixture.id}: ${fixture.expectLifecycle}/${fixture.expectReason}`, () => {
      const decision = evaluateCalendarAdmission(fixture.candidate, NOW);
      assert.equal(decision.lifecycle, fixture.expectLifecycle, `${decision.detail} / ${decision.primaryReason}`);
      assert.equal(decision.primaryReason, fixture.expectReason, decision.detail);
      assert.equal(decision.ruleVersion, CALENDAR_ADMISSION_RULE_VERSION);
    });
  }

  it('merges KC Nerdcon / KC Nerd Con as the same entity', () => {
    const a = NAMED_ADMISSION_FIXTURES.find((f) => f.id === 'nerdcon-a')!;
    const b = NAMED_ADMISSION_FIXTURES.find((f) => f.id === 'nerdcon-b')!;
    assert.equal(evaluateCalendarAdmission(a.candidate, NOW).lifecycle, 'accepted');
    assert.equal(evaluateCalendarAdmission(b.candidate, NOW).lifecycle, 'accepted');
    assert.equal(admissionTitlesLikelySame(a.candidate.title, b.candidate.title), true);
    assert.equal(
      admissionEntitiesMatch(
        {
          title: a.candidate.title,
          startAt: a.candidate.eventDate,
          venue: a.candidate.venue,
          location: a.candidate.locationName,
        },
        {
          title: b.candidate.title,
          startAt: b.candidate.eventDate,
          venue: b.candidate.venue,
          location: b.candidate.locationName,
        },
      ),
      true,
    );
  });

  it('keeps Original Sin accepted at 9pm CT with Woody\'s venue evidence', () => {
    const fixture = NAMED_ADMISSION_FIXTURES.find((f) => f.id === 'original-sin-hookedonkc')!;
    const decision = evaluateCalendarAdmission(fixture.candidate, NOW);
    assert.equal(decision.lifecycle, 'accepted');
    assert.equal(decision.primaryReason, 'ok');
    assert.equal(fixture.candidate.eventDate, '2026-09-20T02:00:00.000Z');
    assert.ok((decision.evidence.geoEvidence ?? []).some((e) => e.startsWith('canonical_venue:')));
  });

  it('merges Original Sin noon vs 9pm CT across UTC date rollover', () => {
    const noon = NAMED_ADMISSION_FIXTURES.find((f) => f.id === 'original-sin-wrong-noon')!;
    const evening = NAMED_ADMISSION_FIXTURES.find((f) => f.id === 'original-sin-hookedonkc')!;
    assert.equal(
      chicagoDayKeyFromIso(noon.candidate.eventDate),
      chicagoDayKeyFromIso(evening.candidate.eventDate),
    );
    assert.equal(
      admissionEntitiesMatch(
        {
          title: noon.candidate.title,
          startAt: noon.candidate.eventDate,
          venue: noon.candidate.venue,
          location: noon.candidate.locationName,
        },
        {
          title: evening.candidate.title,
          startAt: evening.candidate.eventDate,
          venue: evening.candidate.venue,
          location: evening.candidate.locationName,
        },
      ),
      true,
    );
    const preferred = preferAdmissionStartIso(
      {
        startAt: noon.candidate.eventDate!,
        title: noon.candidate.title,
        extractedStartTime: noon.candidate.extractedStartTime,
        sourceUrl: noon.candidate.sourceUrl,
      },
      {
        startAt: evening.candidate.eventDate!,
        title: evening.candidate.title,
        extractedStartTime: evening.candidate.extractedStartTime,
        sourceUrl: evening.candidate.sourceUrl,
      },
    );
    assert.equal(preferred, '2026-09-20T02:00:00.000Z');
  });

  it('merges Sapphic Cabaret alias into Original Sin cluster', () => {
    assert.equal(
      admissionTitlesLikelySame(
        'ORIGINAL SIN: A SAPPHIC CABARET AND DANCE PARTY',
        'Sapphic Cabaret Show + Dance Party',
      ),
      true,
    );
  });

  it('does not accept curator-only locality', () => {
    const fixture = NAMED_ADMISSION_FIXTURES.find((f) => f.id === 'curator-only-no-venue')!;
    const geo = evaluateGeographicGate(fixture.candidate);
    assert.equal(geo.ok, false);
    assert.equal(geo.reason, 'location_unverified');
    assert.equal(
      (geo.geoEvidence ?? []).some((e) => e.startsWith('kc_watchlist_curator:')),
      false,
    );
  });
});

describe('calendar admission gates', () => {
  it('geographic rejects Dallas AAC', () => {
    const result = evaluateGeographicGate({
      title: 'J. Cole: The Fall-Off Tour',
      venue: 'American Airlines Center',
      locationName: 'Dallas, TX',
      formattedAddress: '2500 Victory Ave, Dallas, TX 75219',
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'outside_service_area');
  });

  it('geographic quarantines bare kansas city', () => {
    const result = evaluateGeographicGate({
      title: 'Hike with a Naturalist',
      locationName: 'kansas city',
    });
    assert.equal(result.ok, false);
    assert.equal(result.quarantine, true);
    assert.equal(result.reason, 'location_unverified');
  });

  it('temporal rejects stale 93rd annual Plaza roll', () => {
    const result = evaluateTemporalGate(
      {
        title: '93rd annual Plaza Art Fair returns to the Country Club Plaza',
        eventDate: '2026-09-20T17:00:00.000Z',
        publicationDate: '2024-09-18T12:00:00.000Z',
        yearExplicit: false,
        ingest: 'openai_web_search',
      },
      NOW,
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'stale_source');
  });

  it('eventness rejects Science City General Admission', () => {
    const result = evaluateEventnessGate({
      title: 'Science City General Admission',
      summary: 'Standing museum admission',
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not_a_discrete_event');
  });

  it('eventness rejects merchandise / news / promo / contest / announcement', () => {
    assert.equal(evaluateEventnessGate({ title: 'Limited Edition 2026 CMF Tee' }).reason, 'merchandise_not_event');
    assert.equal(
      evaluateEventnessGate({ title: 'Hundreds of apartments proposed next to future Olathe Dillons' }).reason,
      'news_not_event',
    );
    assert.equal(
      evaluateEventnessGate({ title: 'Ongoing Promotions at Tanger Kansas City' }).reason,
      'promotion_not_event',
    );
    assert.equal(
      evaluateEventnessGate({
        title: 'Explore Your JCPRD: Enter the Picture Your JCPRD photo contest',
      }).reason,
      'contest_not_event',
    );
    assert.equal(
      evaluateEventnessGate({ title: 'A message from the Johnson County Library Foundation' }).reason,
      'announcement_not_event',
    );
  });

  it('source evidence rejects BPCofKC mismatched Eventbrite and Exclusive Sundays Bridge909', () => {
    const bpc = evaluateSourceEvidenceGate({
      title: 'BPCofKC',
      sourceUrl: 'https://www.eventbrite.com/e/sincerely-her-womens-walk-club-tickets-123',
    });
    assert.equal(bpc.ok, false);
    assert.equal(bpc.reason, 'source_event_mismatch');
    const exclusive = evaluateSourceEvidenceGate({
      title: 'Exclusive Sundays',
      sourceUrl: 'https://bridge909.org/news/presales',
    });
    assert.equal(exclusive.ok, false);
    assert.equal(exclusive.reason, 'source_event_mismatch');
  });

  it('sanitation strips Starts: ISO machine text', () => {
    assert.equal(hasMachineTextLeak('Starts: 2026-09-19T15:00:00Z'), true);
    const cleaned = sanitizeCalendarDisplay({
      title: 'Science City General Admission',
      description: 'Starts: 2026-09-19T15:00:00Z',
      venue: 'Science City',
    });
    assert.equal(cleaned.display.description, null);
  });
});

describe('canonical KC venue resolver', () => {
  const required = [
    'kauffman-center',
    'childrens-mercy-park',
    'waldo-branch-library',
    'lakeside-nature-center',
    'op-convention-center',
    't-mobile-center',
    'parkville-nature-sanctuary',
  ];

  for (const id of required) {
    it(`resolves ${id}`, () => {
      const hints: Record<string, string> = {
        'kauffman-center': 'Kauffman Center',
        'childrens-mercy-park': "Children's Mercy Park",
        'waldo-branch-library': 'Waldo Branch Library',
        'lakeside-nature-center': 'Lakeside Nature Center',
        'op-convention-center': 'Overland Park Convention Center',
        't-mobile-center': 'T-Mobile Center',
        'parkville-nature-sanctuary': 'Parkville Nature Sanctuary',
      };
      const result = resolveCanonicalVenue({ venue: hints[id] });
      assert.equal(result.matched, true);
      assert.equal(result.venue?.id, id);
      assert.equal(result.evidenceTag, `canonical_venue:${id}`);
    });
  }

  it('does not treat arbitrary venue-looking text as geo evidence', () => {
    const result = resolveCanonicalVenue({ venue: 'Casa', locationName: 'Kansas City' });
    assert.equal(result.matched, false);
  });
});

describe('local-time duplicate merge', () => {
  function candidate(overrides: Partial<PopulationCandidate>): PopulationCandidate {
    return {
      sourceRecordType: 'content_item',
      sourceRecordId: '00000000-0000-4000-8000-000000000001',
      calendarIntent: 'public_event',
      itemType: 'public_event',
      planningStatus: 'suggested',
      title: 'ORIGINAL SIN: A SAPPHIC CABARET AND DANCE PARTY',
      startAt: '2026-09-19T17:00:00.000Z',
      location: "Woody's",
      sourceUrl: 'https://www.thepitchkc.com/original-sin/',
      occurrenceFingerprint: 'fp-os-noon',
      idempotencyKey: 'skip:os-noon',
      verificationState: 'PARTIALLY_VERIFIED',
      populationSource: 'instagram_watchlist',
      metadata: { extractedStartTime: '12:00 PM' },
      ...overrides,
    };
  }

  it('merges Original Sin / Sapphic Cabaret noon vs 9pm into one survivor at 9pm CT', () => {
    const noon = candidate({});
    const evening = candidate({
      title: 'Sapphic Cabaret Show + Dance Party',
      startAt: '2026-09-20T02:00:00.000Z',
      sourceRecordId: '00000000-0000-4000-8000-000000000002',
      occurrenceFingerprint: 'fp-os-eve',
      idempotencyKey: 'skip:os-eve',
      metadata: { extractedStartTime: '9:00 PM' },
      sourceUrl: 'https://www.instagram.com/p/original-sin/',
    });
    const merged = dedupePopulationCandidates([noon, evening]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.startAt, '2026-09-20T02:00:00.000Z');
  });
});

describe('projection semantic idempotency', () => {
  it('treats reordered admission metadata arrays as unchanged', () => {
    const a: SuggestionSemanticSnapshot = {
      title: 'Hike with a Naturalist',
      description: null,
      location: 'Lakeside Nature Center',
      startAt: '2026-09-19T15:30:00.000Z',
      endAt: null,
      allDay: false,
      sourceUrl: 'https://kcparks.org/event/hike/',
      internalDetailUrl: null,
      notes: null,
      verificationState: 'VERIFIED',
      occurrenceFingerprint: 'fp',
      idempotencyKey: 'key',
      populationSource: 'kc_parks',
      calendarIntent: 'public_event',
      sourceRecordType: 'content_item',
      sourceRecordId: '1',
      admission: {
        lifecycle: 'accepted',
        reasonCodes: ['ok'],
        evidence: { geoEvidence: ['canonical_venue:lakeside-nature-center', 'address_kc:x'] },
      },
      whyIncluded: 'kc parks',
    };
    const b: SuggestionSemanticSnapshot = {
      ...a,
      admission: {
        lifecycle: 'accepted',
        reasonCodes: ['ok'],
        evidence: { geoEvidence: ['address_kc:x', 'canonical_venue:lakeside-nature-center'] },
        evaluatedAt: '2026-09-13T99:99:99.000Z',
      },
    };
    assert.equal(snapshotsEqual(a, b), true);
    assert.equal(suggestionSemanticHash(a), suggestionSemanticHash(b));
  });
});
