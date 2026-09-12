/**
 * Permanent Calendar admission fixtures + gate unit tests.
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
  evaluateTemporalGate,
  hasMachineTextLeak,
  sanitizeCalendarDisplay,
  CALENDAR_ADMISSION_RULE_VERSION,
} from './index.js';

const NOW = new Date('2026-09-12T17:00:00.000Z');

describe('calendar admission named fixtures', () => {
  for (const fixture of NAMED_ADMISSION_FIXTURES) {
    if (fixture.id.startsWith('nerdcon-')) continue; // covered in merge test below
    it(`${fixture.id}: ${fixture.expectLifecycle}/${fixture.expectReason}`, () => {
      const decision = evaluateCalendarAdmission(fixture.candidate, NOW);
      assert.equal(decision.lifecycle, fixture.expectLifecycle, decision.detail);
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

  it('keeps Original Sin accepted', () => {
    const fixture = NAMED_ADMISSION_FIXTURES.find((f) => f.id === 'original-sin-hookedonkc')!;
    const decision = evaluateCalendarAdmission(fixture.candidate, NOW);
    assert.equal(decision.lifecycle, 'accepted');
    assert.equal(decision.primaryReason, 'ok');
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
