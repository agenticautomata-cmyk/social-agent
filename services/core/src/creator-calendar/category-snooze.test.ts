import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatSnoozeUntilLabel,
  isCalendarCategorySnoozed,
  shouldHideUnselectedSuggestionForSnooze,
  snoozeUntilFromDuration,
  type CalendarCategorySnoozeView,
} from './category-snooze.js';

const NOW = new Date('2026-08-14T16:00:00.000Z');

const THIRTY_DAY: CalendarCategorySnoozeView = {
  category: 'estate_sale',
  label: 'Estate sales',
  until: '2026-09-13T16:00:00.000Z',
  untilLabel: 'until Sep 13',
};

describe('snoozeUntilFromDuration', () => {
  it('computes 7d and 30d from now; indefinite is null', () => {
    assert.equal(snoozeUntilFromDuration('indefinite', NOW), null);
    assert.equal(snoozeUntilFromDuration('7d', NOW)?.toISOString(), '2026-08-21T16:00:00.000Z');
    assert.equal(snoozeUntilFromDuration('30d', NOW)?.toISOString(), '2026-09-13T16:00:00.000Z');
  });
});

describe('formatSnoozeUntilLabel', () => {
  it('uses Chicago calendar day for dated snoozes', () => {
    assert.equal(formatSnoozeUntilLabel(null), 'until I turn it back on');
    assert.equal(
      formatSnoozeUntilLabel(new Date('2026-09-13T16:00:00.000Z'), 'America/Chicago'),
      'until Sep 13',
    );
  });
});

describe('shouldHideUnselectedSuggestionForSnooze', () => {
  it('hides unselected estate-sale suggestions while snoozed', () => {
    assert.equal(
      shouldHideUnselectedSuggestionForSnooze(
        { planningStatus: 'suggested', selected: false, calendarCategory: 'estate_sale' },
        [THIRTY_DAY],
        NOW,
      ),
      true,
    );
  });

  it('keeps selected / planned estate sales visible', () => {
    assert.equal(
      shouldHideUnselectedSuggestionForSnooze(
        { planningStatus: 'suggested', selected: true, calendarCategory: 'estate_sale' },
        [THIRTY_DAY],
        NOW,
      ),
      false,
    );
    assert.equal(
      shouldHideUnselectedSuggestionForSnooze(
        { planningStatus: 'confirmed', selected: true, calendarCategory: 'estate_sale' },
        [THIRTY_DAY],
        NOW,
      ),
      false,
    );
    assert.equal(
      shouldHideUnselectedSuggestionForSnooze(
        { planningStatus: 'tentative', selected: false, calendarCategory: 'estate_sale' },
        [THIRTY_DAY],
        NOW,
      ),
      false,
    );
  });

  it('does not hide other categories', () => {
    assert.equal(
      shouldHideUnselectedSuggestionForSnooze(
        { planningStatus: 'suggested', selected: false, calendarCategory: null },
        [THIRTY_DAY],
        NOW,
      ),
      false,
    );
  });

  it('expires automatically after until', () => {
    const after = new Date('2026-09-13T16:00:01.000Z');
    assert.equal(isCalendarCategorySnoozed('estate_sale', [THIRTY_DAY], after), false);
    assert.equal(
      shouldHideUnselectedSuggestionForSnooze(
        { planningStatus: 'suggested', selected: false, calendarCategory: 'estate_sale' },
        [THIRTY_DAY],
        after,
      ),
      false,
    );
  });

  it('indefinite snooze stays active until wake', () => {
    const snoozes: CalendarCategorySnoozeView[] = [
      { category: 'estate_sale', label: 'Estate sales', until: null, untilLabel: 'until I turn it back on' },
    ];
    assert.equal(isCalendarCategorySnoozed('estate_sale', snoozes, NOW), true);
  });
});
