import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { titleMatchesPassed, type PassedOpportunity } from './passed-opportunities.js';

describe('titleMatchesPassed', () => {
  it('suppresses covered planner titles', () => {
    const passed: PassedOpportunity[] = [
      {
        phrase: 'Maj-R Thrift grand opening in Overland Park',
        reason: 'planner covered',
        at: '2026-07-18T20:00:00.000Z',
      },
    ];
    assert.equal(
      titleMatchesPassed('Maj-R Thrift grand opening in Overland Park', passed),
      true,
    );
    assert.equal(titleMatchesPassed('Unrelated new restaurant opening', passed), false);
  });
});
