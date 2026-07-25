import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGreenScreenPlannerPatch } from './planner-patch.js';

describe('buildGreenScreenPlannerPatch', () => {
  const eventDate = new Date('2026-08-15');

  it('keeps visit-later workflow active when green screen is completed', () => {
    const patch = buildGreenScreenPlannerPatch({
      coverageFormat: 'green_screen_then_visit',
      status: 'completed',
      eventStartsAt: eventDate,
    });

    assert.equal(patch.greenScreenStatus, 'completed');
    assert.equal(patch.status, 'planned');
    assert.notEqual(patch.status, 'covered');
    assert.equal(patch.visitReminderAt?.toISOString(), eventDate.toISOString());
    assert.equal(patch.followUpAt?.toISOString(), eventDate.toISOString());
  });

  it('marks green_screen-only opportunities covered when completed', () => {
    const patch = buildGreenScreenPlannerPatch({
      coverageFormat: 'green_screen',
      status: 'completed',
      eventStartsAt: eventDate,
    });

    assert.equal(patch.status, 'covered');
    assert.equal(patch.visitReminderAt, undefined);
  });

  it('sets visit reminder on prepared without closing opportunity', () => {
    const patch = buildGreenScreenPlannerPatch({
      coverageFormat: 'green_screen_then_visit',
      status: 'prepared',
      eventStartsAt: eventDate,
    });

    assert.equal(patch.greenScreenStatus, 'prepared');
    assert.equal(patch.status, undefined);
    assert.equal(patch.visitReminderAt?.toISOString(), eventDate.toISOString());
  });
});
