import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assignmentsSettledForTargets,
  decideHardTimeoutRecovery,
  decideLostResponseRecovery,
  decideSoftTimeoutTransition,
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

  it('multi-target Hotel+Destination requires both ready with matching ?v=', () => {
    const hotel = {
      variant: 'hotel',
      versionNumber: 10,
      webUrl: 'https://benson.kckellie.com/media-kit/kellie-hotel?v=10',
      pdfUrl: 'https://api.kckellie.com/api/public/media-kit/kellie-hotel/pdf?v=10',
      generationStatus: 'ready',
    };
    const destination = {
      variant: 'destination',
      versionNumber: 6,
      webUrl: 'https://benson.kckellie.com/media-kit/kellie-destination?v=6',
      pdfUrl: 'https://api.kckellie.com/api/public/media-kit/kellie-destination/pdf?v=6',
      generationStatus: 'ready',
    };
    assert.equal(assignmentsSettledForTargets([hotel, destination], ['hotel', 'destination']), true);
    assert.equal(assignmentsSettledForTargets([hotel], ['hotel', 'destination']), false);
    assert.equal(
      assignmentsSettledForTargets(
        [hotel, { ...destination, generationStatus: 'pending_build' }],
        ['hotel', 'destination'],
      ),
      false,
    );
  });

  it('client timeout copy does not claim the server failed', () => {
    assert.equal(/server failed|generation stopped|marked as failed/i.test(softTimeoutMessage()), false);
    assert.match(softTimeoutMessage(), /not marked failed/i);
    assert.match(hardTimeoutMessage(), /does not mean generation stopped/i);
  });

  it('soft timeout transitions to generating + poll without failure language', () => {
    const t = decideSoftTimeoutTransition();
    assert.equal(t.nextPhase, 'generating');
    assert.equal(t.startPoll, true);
    assert.equal(/failed|error/i.test(t.notice) && !/not marked failed/i.test(t.notice), false);
    assert.match(t.notice, /not marked failed/i);
  });

  it('lost-response recovery settles when Hotel→Destination already ready', () => {
    const destinationReady = {
      variant: 'destination',
      versionNumber: 6,
      webUrl: 'https://benson.kckellie.com/media-kit/kellie-destination?v=6',
      pdfUrl: 'https://api.kckellie.com/api/public/media-kit/kellie-destination/pdf?v=6',
      generationStatus: 'ready',
    };
    const decision = decideLostResponseRecovery({
      assignments: [destinationReady],
      targets: ['destination'],
      softFired: true,
      fetchErrorMessage: 'Failed to fetch',
    });
    assert.equal(decision.kind, 'ready');
    if (decision.kind === 'ready') {
      assert.match(decision.notice, /lost response/i);
      assert.equal(/server failed/i.test(decision.notice), false);
    }
  });

  it('lost-response recovery polls when rows exist but not settled', () => {
    const pending = {
      variant: 'destination',
      versionNumber: 6,
      webUrl: 'https://benson.kckellie.com/media-kit/kellie-destination?v=6',
      pdfUrl: 'https://api.kckellie.com/api/public/media-kit/kellie-destination/pdf?v=6',
      generationStatus: 'pending_build',
    };
    const afterSoft = decideLostResponseRecovery({
      assignments: [pending],
      targets: ['destination'],
      softFired: true,
      fetchErrorMessage: 'network',
    });
    assert.equal(afterSoft.kind, 'poll');
    if (afterSoft.kind === 'poll') {
      assert.match(afterSoft.notice, /Connection dropped|generating/i);
    }
    const beforeSoft = decideLostResponseRecovery({
      assignments: [pending],
      targets: ['destination'],
      softFired: false,
      fetchErrorMessage: 'network',
    });
    assert.equal(beforeSoft.kind, 'poll');
  });

  it('lost-response with zero rows surfaces the fetch error as failed', () => {
    const decision = decideLostResponseRecovery({
      assignments: [],
      targets: ['hotel', 'destination'],
      softFired: false,
      fetchErrorMessage: 'Failed to fetch',
    });
    assert.deepEqual(decision, { kind: 'failed', error: 'Failed to fetch' });
  });

  it('hard timeout reconciles ready Hotel+Destination without failure claim', () => {
    const rows = [
      {
        variant: 'hotel',
        versionNumber: 10,
        webUrl: 'https://benson.kckellie.com/media-kit/kellie-hotel?v=10',
        pdfUrl: 'https://api.kckellie.com/api/public/media-kit/kellie-hotel/pdf?v=10',
        generationStatus: 'ready',
      },
      {
        variant: 'destination',
        versionNumber: 6,
        webUrl: 'https://benson.kckellie.com/media-kit/kellie-destination?v=6',
        pdfUrl: 'https://api.kckellie.com/api/public/media-kit/kellie-destination/pdf?v=6',
        generationStatus: 'ready',
      },
    ];
    const ready = decideHardTimeoutRecovery({
      assignments: rows,
      targets: ['hotel', 'destination'],
    });
    assert.equal(ready.kind, 'ready');
    const pending = decideHardTimeoutRecovery({
      assignments: [{ ...rows[0]!, generationStatus: 'pending_build' }],
      targets: ['hotel'],
    });
    assert.equal(pending.kind, 'released');
    if (pending.kind === 'released') {
      assert.match(pending.notice, /does not mean the server failed/i);
      assert.equal(pending.closeDraft, true);
    }
    const failed = decideHardTimeoutRecovery({
      assignments: [{ ...rows[0]!, generationStatus: 'generation_failed' }],
      targets: ['hotel'],
    });
    assert.equal(failed.kind, 'released');
    if (failed.kind === 'released') assert.equal(failed.closeDraft, false);
  });
});
