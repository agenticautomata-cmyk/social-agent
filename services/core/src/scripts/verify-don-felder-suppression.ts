#!/usr/bin/env -S pnpm exec tsx
import { loadSkipMatchers, isSkippedByMatchers } from '../creator-skip/index.js';

const matchers = await loadSkipMatchers();
console.log('Loaded matchers: contentItemIds=%d fingerprints=%d identities=%d',
  matchers.contentItemIds.size, matchers.fingerprints.size, matchers.identities.length);

// Simulate a brand-new re-ingestion of the same real-world event from a third
// source: different id, different sourceUrl, reworded title, performer names
// reordered, tracking params added, punctuation changed.
const simulatedReingestion = {
  id: 'brand-new-id-not-in-db',
  title: "Felder, Don — LIVE In Concert!",
  eventDate: '2026-09-12T01:15:00.000Z', // slightly different showtime, same Chicago-local day
  locationName: 'Kansas City, Missouri',
  formattedAddress: null,
  venue: 'Ameristar Casino Hotel Kansas City',
  sourceUrl: 'https://some-other-ticket-site.example.com/events/don-felder-akc?utm_campaign=fall2026&ref=fb',
  summary: 'Legendary Eagles guitarist Don Felder brings his solo tour to Kansas City.',
};

const suppressed = isSkippedByMatchers(matchers, simulatedReingestion);
console.log('\nSimulated third-source re-ingestion suppressed?', suppressed);

// Also verify a genuinely different event on the same day does NOT get wrongly suppressed.
const unrelatedEvent = {
  id: 'unrelated-id',
  title: 'Kansas City Symphony Fall Gala',
  eventDate: '2026-09-12T01:15:00.000Z',
  locationName: 'Kansas City, Missouri',
  formattedAddress: null,
  venue: 'Kauffman Center',
  sourceUrl: 'https://kcsymphony.example.com/gala',
  summary: 'Annual fundraising gala.',
};
console.log('Unrelated same-day event wrongly suppressed?', isSkippedByMatchers(matchers, unrelatedEvent));

process.exit(0);
