import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assignmentsSettledForTargets,
  hardTimeoutMessage,
  shouldApplyAssignResult,
  softTimeoutMessage,
} from './creator-assets-assign.ts';

describe('creator-assets assign client helpers', () => {
  it('ignores stale responses from older save attempts', () => {
    assert.equal(shouldApplyAssignResult(1, 2), false);
    assert.equal(shouldApplyAssignResult(2, 2), true);
  });

  it('requires matching version query params before treating kits as settled', () => {
    assert.equal(
      assignmentsSettledForTargets(
        [
          {
            variant: 'hotel',
            versionNumber: 9,
            webUrl: 'https://benson.kckellie.com/media-kit/kellie-hotel?v=9',
            pdfUrl: 'https://api.kckellie.com/api/public/media-kit/kellie-hotel/pdf?v=9',
            generationStatus: 'ready',
          },
        ],
        ['hotel'],
      ),
      true,
    );
    assert.equal(
      assignmentsSettledForTargets(
        [
          {
            variant: 'hotel',
            versionNumber: 8,
            webUrl: 'https://benson.kckellie.com/media-kit/kellie-hotel?v=9',
            pdfUrl: 'https://api.kckellie.com/api/public/media-kit/kellie-hotel/pdf?v=9',
            generationStatus: 'ready',
          },
        ],
        ['hotel'],
      ),
      false,
    );
    assert.equal(
      assignmentsSettledForTargets(
        [
          {
            variant: 'hotel',
            versionNumber: 9,
            webUrl: 'https://benson.kckellie.com/media-kit/kellie-hotel?v=9',
            pdfUrl: 'https://api.kckellie.com/api/public/media-kit/kellie-hotel/pdf?v=9',
            generationStatus: 'pending_build',
          },
        ],
        ['hotel'],
      ),
      false,
    );
  });

  it('treats unassigned as settled only with zero assignment rows', () => {
    assert.equal(assignmentsSettledForTargets([], ['unassigned']), true);
    assert.equal(
      assignmentsSettledForTargets([{ variant: 'hotel', versionNumber: 1, generationStatus: 'ready' }], [
        'unassigned',
      ]),
      false,
    );
  });

  it('Hotel→Destination settle requires destination ready and hotel gone', () => {
    const destinationReady = {
      variant: 'destination',
      versionNumber: 6,
      webUrl: 'https://benson.kckellie.com/media-kit/kellie-destination?v=6',
      pdfUrl: 'https://api.kckellie.com/api/public/media-kit/kellie-destination/pdf?v=6',
      generationStatus: 'ready',
    };
    assert.equal(assignmentsSettledForTargets([destinationReady], ['destination']), true);
    assert.equal(
      assignmentsSettledForTargets(
        [
          destinationReady,
          {
            variant: 'hotel',
            versionNumber: 9,
            webUrl: 'https://benson.kckellie.com/media-kit/kellie-hotel?v=9',
            pdfUrl: 'https://api.kckellie.com/api/public/media-kit/kellie-hotel/pdf?v=9',
            generationStatus: 'ready',
          },
        ],
        ['destination'],
      ),
      false,
    );
    assert.equal(
      assignmentsSettledForTargets(
        [
          {
            ...destinationReady,
            generationStatus: 'pending_build',
          },
        ],
        ['destination'],
      ),
      false,
    );
  });

  it('client timeout copy does not claim the server failed', () => {
    assert.equal(/server failed|generation stopped|marked as failed/i.test(softTimeoutMessage()), false);
    assert.match(softTimeoutMessage(), /not marked failed/i);
    assert.match(hardTimeoutMessage(), /does not mean generation stopped/i);
  });
});
