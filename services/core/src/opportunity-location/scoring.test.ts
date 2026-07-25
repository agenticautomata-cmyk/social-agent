import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideLocationResolution,
  nameSimilarity,
  normalizeVenueName,
  scoreLocationCandidate,
  LOCATION_SCORE_THRESHOLDS,
} from './scoring.js';
import type { LocationSearchContext } from './types.js';

function candidate(input: {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  websiteUrl?: string | null;
}) {
  return {
    ...input,
    googleMapsUrl: `https://maps.example/${input.placeId}`,
    websiteUrl: input.websiteUrl ?? null,
  };
}

describe('venue name normalization', () => {
  it('strips punctuation, capitalization, and common venue suffixes', () => {
    assert.equal(normalizeVenueName('The Midland Theatre'), 'midland');
    assert.equal(normalizeVenueName('THE MIDLAND'), 'midland');
    assert.equal(normalizeVenueName('Country Club Plaza'), 'country club');
    assert.equal(normalizeVenueName('Union Station'), 'union');
    assert.equal(normalizeVenueName('Country Club'), 'country club');
    assert.equal(normalizeVenueName('Union Station Kansas City'), 'union');
  });

  it('treats The Midland and The Midland Theatre as near-exact', () => {
    assert.ok(nameSimilarity('The Midland', 'The Midland Theatre') >= LOCATION_SCORE_THRESHOLDS.singleExactNameFloor);
    assert.ok(
      nameSimilarity('Union Station', 'Union Station Kansas City') >=
        LOCATION_SCORE_THRESHOLDS.singleExactNameFloor,
    );
  });
});

describe('candidate scoring', () => {
  it('scores exact address matches strongly', () => {
    const scored = scoreLocationCandidate(
      candidate({
        placeId: 'exact',
        displayName: 'Union Station Kansas City',
        formattedAddress: '30 W Pershing Rd, Kansas City, MO 64108, USA',
        latitude: 39.0854,
        longitude: -94.5859,
        websiteUrl: 'https://unionstation.org',
      }),
      {
        venueName: 'Union Station',
        address: '30 W Pershing Rd, Kansas City, MO 64108',
        city: 'Kansas City',
        state: 'MO',
        zip: '64108',
        sourceUrl: 'https://unionstation.org/event',
      },
    );

    assert.ok(scored.score >= LOCATION_SCORE_THRESHOLDS.resolvedMin);
    assert.ok((scored.scoreBreakdown.address ?? 0) > 0);
    assert.ok((scored.scoreBreakdown.nameSimilarity ?? 0) > 0);
  });

  it('prefers event venue over organizer address', () => {
    const context: LocationSearchContext = {
      eventVenue: 'Kauffman Center for the Performing Arts',
      organizerAddress: '123 Main St, Kansas City, MO 64105',
      city: 'Kansas City',
      state: 'MO',
    };
    const scoredVenue = scoreLocationCandidate(
      candidate({
        placeId: 'kauffman',
        displayName: 'Kauffman Center for the Performing Arts',
        formattedAddress: '1601 Broadway Blvd, Kansas City, MO 64108, USA',
        latitude: 39.0942,
        longitude: -94.5876,
      }),
      context,
    );
    const scoredOrganizer = scoreLocationCandidate(
      candidate({
        placeId: 'office',
        displayName: 'Downtown Arts Alliance Office',
        formattedAddress: '123 Main St, Kansas City, MO 64105, USA',
        latitude: 39.1012,
        longitude: -94.5841,
      }),
      context,
    );

    assert.ok(scoredVenue.score > scoredOrganizer.score);
    assert.ok((scoredVenue.scoreBreakdown.venuePreference ?? 0) > 0);
  });
});

describe('decision thresholds', () => {
  it('resolves exact single-result district/plaza', () => {
    const context: LocationSearchContext = {
      venueName: 'Country Club Plaza',
      city: 'Kansas City',
      state: 'MO',
    };
    const scored = [
      scoreLocationCandidate(
        candidate({
          placeId: 'plaza',
          displayName: 'Country Club Plaza',
          formattedAddress: '4706 Broadway Blvd, Kansas City, MO 64112',
          latitude: 39.0448,
          longitude: -94.5901,
        }),
        context,
      ),
    ];
    const decision = decideLocationResolution(scored, context);
    assert.equal(decision.status, 'resolved');
    assert.equal(decision.selected?.placeId, 'plaza');
  });

  it('resolves The Midland versus The Midland Theatre via suffix normalization', () => {
    const context: LocationSearchContext = {
      venueName: 'The Midland',
      city: 'Kansas City',
      state: 'MO',
    };
    const scored = [
      scoreLocationCandidate(
        candidate({
          placeId: 'midland',
          displayName: 'The Midland Theatre',
          formattedAddress: '1228 Main St, Kansas City, MO 64105',
          latitude: 39.0987,
          longitude: -94.5839,
        }),
        context,
      ),
    ];
    const decision = decideLocationResolution(scored, context);
    assert.equal(decision.status, 'resolved');
    assert.equal(decision.selected?.displayName, 'The Midland Theatre');
  });

  it('flags chain with multiple metro branches as needs_review', () => {
    const context: LocationSearchContext = {
      businessName: 'Starbucks',
      city: 'Kansas City',
      state: 'MO',
    };
    const candidates = [
      scoreLocationCandidate(
        candidate({
          placeId: 'a',
          displayName: 'Starbucks',
          formattedAddress: '1571 Main St, Kansas City, MO 64108',
          latitude: 39.094,
          longitude: -94.583,
        }),
        context,
      ),
      scoreLocationCandidate(
        candidate({
          placeId: 'b',
          displayName: 'Starbucks',
          formattedAddress: '4706 Broadway Blvd, Kansas City, MO 64112',
          latitude: 39.0448,
          longitude: -94.5901,
        }),
        context,
      ),
      scoreLocationCandidate(
        candidate({
          placeId: 'c',
          displayName: 'Starbucks',
          formattedAddress: '8600 Ward Pkwy, Kansas City, MO 64114',
          latitude: 38.9264,
          longitude: -94.6064,
        }),
        context,
      ),
    ];

    const decision = decideLocationResolution(candidates, context);
    assert.equal(decision.status, 'needs_review');
    assert.equal(decision.selected, null);
    assert.equal(decision.reason, 'multiple_metro_name_matches');
  });

  it('leaves multiple weak unrelated results unresolved', () => {
    const context: LocationSearchContext = {
      businessName: 'Zorbax Nonexistent Cafe KC',
      city: 'Kansas City',
      state: 'MO',
    };
    const candidates = [
      scoreLocationCandidate(
        candidate({
          placeId: 'weak1',
          displayName: 'Cafe KC',
          formattedAddress: '9201 N Congress Ave, Kansas City, MO 64153',
          latitude: 39.246,
          longitude: -94.665,
        }),
        context,
      ),
      scoreLocationCandidate(
        candidate({
          placeId: 'weak2',
          displayName: 'Another Cafe',
          formattedAddress: '100 Main St, Kansas City, MO 64105',
          latitude: 39.1,
          longitude: -94.58,
        }),
        context,
      ),
    ];

    const decision = decideLocationResolution(candidates, context);
    assert.equal(decision.status, 'unresolved');
  });

  it('does not auto-resolve a single weak unrelated Google result', () => {
    const context: LocationSearchContext = {
      businessName: 'Totally Different Name',
      city: 'Kansas City',
      state: 'MO',
    };
    const decision = decideLocationResolution(
      [
        scoreLocationCandidate(
          candidate({
            placeId: 'weak',
            displayName: 'Some Place',
            formattedAddress: '999 Unknown Rd, Topeka, KS 66603, USA',
            latitude: 39.0473,
            longitude: -95.6752,
          }),
          context,
        ),
      ],
      context,
    );
    assert.equal(decision.status, 'unresolved');
  });

  it('lets exact address override chain ambiguity', () => {
    const context: LocationSearchContext = {
      businessName: 'Starbucks',
      address: '4706 Broadway Blvd, Kansas City, MO 64112',
      city: 'Kansas City',
      state: 'MO',
      zip: '64112',
    };
    const candidates = [
      scoreLocationCandidate(
        candidate({
          placeId: 'plaza',
          displayName: 'Starbucks',
          formattedAddress: '4706 Broadway Blvd, Kansas City, MO 64112',
          latitude: 39.0448,
          longitude: -94.5901,
        }),
        context,
      ),
      scoreLocationCandidate(
        candidate({
          placeId: 'main',
          displayName: 'Starbucks',
          formattedAddress: '1571 Main St, Kansas City, MO 64108',
          latitude: 39.094,
          longitude: -94.583,
        }),
        context,
      ),
    ];

    const decision = decideLocationResolution(candidates, context);
    assert.equal(decision.status, 'resolved');
    assert.equal(decision.selected?.placeId, 'plaza');
  });
});
