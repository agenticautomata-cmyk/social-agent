import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarPayloadHash } from './payload-hash.js';
import { canExportToGoogle } from './items.js';
import type { CalendarItemView } from './types.js';

describe('creator-calendar payload hash', () => {
  it('produces stable hash for same inputs', () => {
    const start = new Date('2026-08-01T15:00:00.000Z');
    const end = new Date('2026-08-01T16:00:00.000Z');
    const a = buildCalendarPayloadHash({
      title: 'Frosty Frogs filming',
      startAt: start,
      endAt: end,
      allDay: false,
      timezone: 'America/Chicago',
      location: 'KC',
      notes: null,
      description: null,
    });
    const b = buildCalendarPayloadHash({
      title: 'Frosty Frogs filming',
      startAt: start,
      endAt: end,
      allDay: false,
      timezone: 'America/Chicago',
      location: 'KC',
      notes: null,
      description: null,
    });
    assert.equal(a, b);
  });

  it('changes hash when filming time changes', () => {
    const base = {
      title: 'Frosty Frogs',
      endAt: null as Date | null,
      allDay: false,
      timezone: 'America/Chicago',
      location: null,
      notes: null,
      description: null,
    };
    const h1 = buildCalendarPayloadHash({ ...base, startAt: new Date('2026-08-01T15:45:00.000Z') });
    const h2 = buildCalendarPayloadHash({ ...base, startAt: new Date('2026-08-01T11:00:00.000Z') });
    assert.notEqual(h1, h2);
  });
});

describe('canExportToGoogle', () => {
  const base: CalendarItemView = {
    id: '1',
    title: 'Test',
    description: null,
    itemType: 'content_filming',
    sourceRecordType: null,
    sourceRecordId: null,
    sourceUrl: null,
    internalDetailUrl: null,
    startAt: new Date(Date.now() + 86400000).toISOString(),
    endAt: null,
    allDay: false,
    timezone: 'America/Chicago',
    location: null,
    latitude: null,
    longitude: null,
    status: 'confirmed',
    planningStatus: 'confirmed',
    creatorAction: 'film',
    reminderSettings: {},
    contentFormat: null,
    verifiedFields: [],
    unverifiedFields: [],
    notes: null,
    travelMinutes: null,
    createdBy: 'kellie',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    missedAt: null,
    expiredAt: null,
    sync: { syncStatus: 'ready_to_export', googleCalendarId: null, googleEventId: null, autoUpdateEnabled: false, lastSyncedAt: null, lastError: null, updateAvailable: false },
    recommendedAction: null,
  };

  it('allows confirmed future items', () => {
    assert.equal(canExportToGoogle(base).ok, true);
  });

  it('blocks tentative items', () => {
    assert.equal(canExportToGoogle({ ...base, planningStatus: 'tentative' }).ok, false);
  });

  it('blocks already synced items', () => {
    assert.equal(
      canExportToGoogle({
        ...base,
        sync: { ...base.sync!, syncStatus: 'synced', googleEventId: 'evt' },
      }).ok,
      false,
    );
  });

  it('blocks expired past events', () => {
    assert.equal(
      canExportToGoogle({
        ...base,
        startAt: new Date(Date.now() - 86400000).toISOString(),
      }).ok,
      false,
    );
  });
});
