/**
 * Bypass detector: every Calendar-visible write path must invoke admission.
 * Fails if a path upserts suggestions without evaluateCalendarAdmission / admission metadata.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const WRITE_PATH_FILES = [
  'population/sync.ts',
  'population/eligibility.ts',
  'population/scout-promote.ts',
  'items.ts',
] as const;

describe('calendar admission bypass detector', () => {
  it('projection sync collects candidates only via eligibility (admission-backed)', () => {
    const src = readFileSync(join(root, 'population/sync.ts'), 'utf8');
    assert.match(src, /evaluateInventoryCalendarEligibility/);
    assert.match(src, /evaluateCuratorLeadCalendarEligibility/);
    assert.doesNotMatch(
      src,
      /insert\(creatorCalendarItems\)[\s\S]{0,200}planningStatus:\s*'suggested'/,
    );
    // Upserts go through upsertSuggestion which receives already-gated candidates.
    assert.match(src, /async function upsertSuggestion/);
  });

  it('eligibility delegates to evaluateCalendarAdmission', () => {
    const src = readFileSync(join(root, 'population/eligibility.ts'), 'utf8');
    assert.match(src, /evaluateCalendarAdmission/);
    assert.match(src, /admissionCandidateFromInventory/);
    assert.match(src, /admissionCandidateFromCuratorLead/);
    assert.match(src, /admissionDecisionToMetadata/);
  });

  it('scout-promote requires admission before persist', () => {
    const src = readFileSync(join(root, 'population/scout-promote.ts'), 'utf8');
    assert.match(src, /evaluateCalendarAdmission/);
    assert.match(src, /admissionCandidateFromScoutPromote/);
    assert.match(src, /isCalendarAccepted/);
    assert.match(src, /admission:\$\{admission\.primaryReason\}/);
  });

  it('listCalendarItems applies admission read filter for suggestions', () => {
    const src = readFileSync(join(root, 'items.ts'), 'utf8');
    assert.match(src, /calendarSuggestionIsDisplayable/);
    assert.match(src, /metadata:\s*row\?\.metadata/);
    assert.match(src, /planningStatus:\s*view\.planningStatus/);
  });

  it('all write-path files reference the admission package', () => {
    for (const rel of WRITE_PATH_FILES) {
      const src = readFileSync(join(root, rel), 'utf8');
      const touchesAdmission =
        /admission\//.test(src) ||
        /evaluateCalendarAdmission|calendarAdmissionAllowsDisplay|admissionDecisionToMetadata|calendarSuggestionIsDisplayable|evaluateInventoryCalendarEligibility|evaluateCuratorLeadCalendarEligibility/.test(
          src,
        );
      assert.equal(touchesAdmission, true, `${rel} must touch admission authority`);
    }
  });
});
