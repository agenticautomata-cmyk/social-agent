import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBensonUiCardFromBrief,
  isTerminalPartnershipResearchStatus,
  partnershipEntityContext,
  provisionalChatFieldsFromBrief,
  terminalChatPatchFromAuthority,
} from './research-correlation.js';
import type { PartnershipResearchAuthorityState } from '../creator-partnership/research-singleflight.js';

describe('research-correlation helpers', () => {
  it('builds message-level entityContext for a partnership', () => {
    const ctx = partnershipEntityContext('partnership-1');
    assert.equal(ctx.associations.length, 1);
    assert.equal(ctx.associations[0]?.entityType, 'creator_partnership');
    assert.equal(ctx.associations[0]?.entityId, 'partnership-1');
    assert.equal(ctx.associations[0]?.role, 'primary');
  });

  it('maps decisionBrief into a compact uiCard', () => {
    const card = buildBensonUiCardFromBrief({
      phase: 'provisional',
      headline: 'SCHEELS opportunity',
      entities: [{ name: 'SCHEELS', type: 'retailer', confidence: 0.8 }],
      localRelevance: 'Local scope configured',
      provisionalSignals: ['URL captured'],
      knownGaps: ['Program research queued'],
      researchStatus: 'provisional',
      partnershipHref: '/partnerships/p1',
      updatedAt: new Date().toISOString(),
    });
    assert.ok(card);
    assert.equal(card?.type, 'decision_brief');
    assert.equal(card?.headline, 'SCHEELS opportunity');
    assert.equal((card?.tier1 as { signal?: string }).signal, 'URL captured');
  });

  it('builds provisional chat fields without Instagram copy', () => {
    const fields = provisionalChatFieldsFromBrief({
      partnershipId: 'p1',
      researchStatus: 'provisional',
      decisionBrief: {
        phase: 'provisional',
        headline: 'Clothes Mentor',
        entities: [{ name: 'Clothes Mentor', type: 'retailer', confidence: 0.7 }],
        localRelevance: null,
        provisionalSignals: [],
        knownGaps: ['Page content not fetched yet'],
        researchStatus: 'provisional',
        partnershipHref: '/partnerships/p1',
        updatedAt: new Date().toISOString(),
      },
    });
    assert.match(fields.answer, /Clothes Mentor|Looking at/i);
    assert.doesNotMatch(fields.answer, /instagram|tiktok/i);
    assert.equal(fields.entityContext.associations[0]?.entityId, 'p1');
  });

  it('creates terminal chat patches only for terminal authority', () => {
    const researching: PartnershipResearchAuthorityState = {
      partnershipId: 'p1',
      researchRunId: 'run-a',
      researchStartedAt: new Date().toISOString(),
      researchStatus: 'researching',
      research: {},
      fitScore: null,
      needsVerification: null,
      researchError: null,
      metadata: {},
    };
    assert.equal(terminalChatPatchFromAuthority(researching), null);
    assert.equal(isTerminalPartnershipResearchStatus('complete'), true);

    const complete: PartnershipResearchAuthorityState = {
      ...researching,
      researchStatus: 'complete',
      fitScore: 72,
      metadata: {
        decisionBrief: {
          phase: 'complete',
          headline: 'SCHEELS',
          entities: [{ name: 'SCHEELS', type: 'retailer', confidence: 0.9 }],
          localRelevance: null,
          provisionalSignals: [],
          knownGaps: [],
          fitScore: 72,
          researchStatus: 'complete',
          partnershipHref: '/partnerships/p1',
          updatedAt: new Date().toISOString(),
        },
      },
    };
    const patch = terminalChatPatchFromAuthority(complete);
    assert.ok(patch);
    assert.equal(patch?.researchStatus, 'complete');
    assert.equal(patch?.decisionBrief?.headline, 'SCHEELS');
    assert.ok(patch?.uiCard);
  });
});
