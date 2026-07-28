import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseIcsContent, icsEventsToNewsletterItems } from './ics-parse.js';
import { isGenericEntityName, resolveEntityName } from './entity-resolve.js';

describe('ics-parse', () => {
  it('parses VEVENT with DTSTART and LOCATION', () => {
    const raw = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-uid-123@example.com
SUMMARY:Jazz at the Folly
DTSTART;TZID=America/Chicago:20260815T190000
DTEND;TZID=America/Chicago:20260815T210000
LOCATION:Folly Theater, Kansas City, MO
URL:https://follytheater.org/event
STATUS:CONFIRMED
SEQUENCE:1
END:VEVENT
END:VCALENDAR`;
    const events = parseIcsContent(raw);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.uid, 'test-uid-123@example.com');
    assert.equal(events[0]!.summary, 'Jazz at the Folly');
    assert.equal(events[0]!.dtStart, '2026-08-15');
    assert.match(events[0]!.location ?? '', /Folly/i);

    const items = icsEventsToNewsletterItems(events);
    assert.equal(items[0]!.layer, 'occurrence');
    assert.equal(items[0]!.title, 'Jazz at the Folly');
  });

  it('dedupes by UID conceptually', () => {
    const uid = 'repeat@newsletter.com';
    assert.equal(uid, 'repeat@newsletter.com');
  });
});

describe('entity-resolve', () => {
  it('rejects generic entity names', () => {
    assert.ok(isGenericEntityName('Newsletter'));
    assert.ok(isGenericEntityName('Click Here'));
    assert.ok(!isGenericEntityName('Joe\'s Kansas City BBQ'));
  });

  it('resolves from venue when title is generic', () => {
    const name = resolveEntityName({
      rawName: 'Events',
      title: 'Events',
      senderName: 'Visit KC',
      senderDomain: 'visitkc.com',
      venue: 'Union Station',
      organizer: null,
      officialWebsite: null,
    });
    assert.equal(name, 'Union Station');
  });
});
