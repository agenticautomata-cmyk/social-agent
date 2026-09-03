/**
 * Today's partnership slots.
 *
 * The existing today-execution contract is tested in today-execution.test.ts and must
 * keep passing untouched; these tests cover only what partnerships add to it. The
 * question each one asks is whether Today stays a decision desk — a slot is earned by
 * a decision a person can act on, never filled because a row exists.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PartnershipDecision } from '../partnership-today/decisions.js';
import { MAX_PARTNERSHIP_DECISIONS } from '../partnership-today/decisions.js';
import {
  MAX_PRIORITIES,
  computeTodayExecution,
  type TodayExecutionInput,
} from './today-execution.js';

const NOW = new Date('2026-09-03T17:00:00.000Z');

function input(overrides: Partial<TodayExecutionInput> = {}): TodayExecutionInput {
  return {
    now: NOW,
    planner: [],
    inventory: new Map(),
    research: [],
    calendar: [],
    watchlist: [],
    ...overrides,
  };
}

function decision(overrides: Partial<PartnershipDecision> = {}): PartnershipDecision {
  return {
    id: 'opp-1',
    kind: 'approve_pitch',
    businessName: 'Crossroads Hotel',
    title: 'Approve the pitch to Crossroads Hotel',
    why: 'Written from verified facts and scored 85 out of 100. Nothing is missing except your approval.',
    href: '/email/approvals',
    compensationLabel: 'Fully hosted',
    contactLabel: 'Verified role inbox',
    dueDate: null,
    weight: 60,
    ...overrides,
  };
}

describe('today partnership decisions', () => {
  it('leaves Today exactly as it was when no partnership needs a decision', () => {
    const workspace = computeTodayExecution(input());
    assert.deepEqual(workspace.partnershipDecisions, []);
    assert.equal(workspace.empty, true);
  });

  it('surfaces a pitch that is waiting only on approval', () => {
    const workspace = computeTodayExecution(input({ partnerships: [decision()] }));
    assert.equal(workspace.partnershipDecisions.length, 1);
    const item = workspace.partnershipDecisions[0]!;
    assert.equal(item.title, 'Approve the pitch to Crossroads Hotel');
    assert.equal(item.kind, 'partnership');
    assert.equal(item.detailsHref, '/email/approvals');
  });

  it('shows compensation and contact confidence without opening the pitch', () => {
    const workspace = computeTodayExecution(input({ partnerships: [decision()] }));
    // Both stakes and trustworthiness have to be readable on the desk itself,
    // otherwise approving is a blind act.
    assert.equal(workspace.partnershipDecisions[0]!.subtitle, 'Fully hosted · Verified role inbox');
  });

  it('does not call a day empty when a pitch is waiting', () => {
    const workspace = computeTodayExecution(input({ partnerships: [decision()] }));
    assert.equal(workspace.empty, false);
  });

  it('links to the approval page rather than offering a send', () => {
    const workspace = computeTodayExecution(input({ partnerships: [decision()] }));
    // Approval must stay a deliberate act on a page showing the exact recipient and
    // body. A send action on Today would make it a reflex.
    assert.deepEqual(workspace.partnershipDecisions[0]!.actions, ['open']);
  });

  it('puts a waiting business ahead of Kellie\u2019s own content work', () => {
    const workspace = computeTodayExecution(
      input({
        partnerships: [
          decision({
            id: 'reply-1',
            kind: 'answer_reply',
            title: 'Crossroads Hotel replied and is waiting on you',
            weight: 100,
          }),
        ],
      }),
    );
    assert.equal(workspace.priorities[0]?.label, 'Crossroads Hotel replied and is waiting on you');
  });

  it('respects the shared priority cap instead of crowding the list', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      decision({ id: `opp-${i}`, businessName: `Hotel ${i}`, title: `Approve the pitch to Hotel ${i}` }),
    );
    const workspace = computeTodayExecution(input({ partnerships: many }));
    assert.ok(workspace.priorities.length <= MAX_PRIORITIES);
  });

  it('caps the desk at five and never pads it to five', () => {
    assert.equal(MAX_PARTNERSHIP_DECISIONS, 5);
    const one = computeTodayExecution(input({ partnerships: [decision()] }));
    assert.equal(one.partnershipDecisions.length, 1);
  });

  it('states what is blocking a contact rather than guessing an address', () => {
    const workspace = computeTodayExecution(
      input({
        partnerships: [
          decision({
            id: 'opp-raphael',
            kind: 'resolve_contact',
            businessName: 'The Raphael Hotel',
            title: 'Find who to contact at The Raphael Hotel',
            why: 'Worth pitching, but no contact has been verified, so Benson will not send anything.',
            href: '/pitches',
            contactLabel: 'No contact yet',
            weight: 40,
          }),
        ],
      }),
    );
    const item = workspace.partnershipDecisions[0]!;
    assert.match(item.why ?? '', /no contact has been verified/);
    // It must not offer approval, since there is nothing safe to send.
    assert.equal(item.detailsHref, '/pitches');
  });

  it('shows a due date on an obligation so it can be met', () => {
    const workspace = computeTodayExecution(
      input({
        partnerships: [
          decision({
            id: 'opp-won',
            kind: 'partnership_obligation',
            title: 'Crossroads Hotel is expecting the reel',
            dueDate: '2026-09-05',
            weight: 90,
          }),
        ],
      }),
    );
    assert.equal(workspace.partnershipDecisions[0]!.whenLabel, 'Due 2026-09-05');
    assert.equal(workspace.partnershipDecisions[0]!.dueDate, '2026-09-05');
  });
});
