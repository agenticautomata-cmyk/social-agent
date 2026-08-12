import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { describe, it } from 'node:test';
import { db } from '../db.js';
import { bensonChatMessages, bensonConversations, creatorAccounts } from '../schema.js';
import {
  bindBensonAssistantResearchRun,
  patchBensonAssistantMessageTerminal,
  patchBensonAssistantMessagesTerminal,
  persistBensonConversationMessage,
} from './conversations.js';

async function resolveCreatorId(): Promise<string | null> {
  const [row] = await db.select({ id: creatorAccounts.id }).from(creatorAccounts).limit(1);
  return row?.id ?? null;
}

describe('Benson conversation terminal correlation', () => {
  it('A/C: terminal patch matches partnershipId+researchRunId only; Run B does not rewrite Run A', async () => {
    const creatorId = await resolveCreatorId();
    if (!creatorId) return;

    const conversationId = randomUUID();
    const partnershipId = randomUUID();
    const runA = randomUUID();
    const runB = randomUUID();

    const msgA = await persistBensonConversationMessage({
      creatorId,
      conversationId,
      role: 'assistant',
      message: 'Run A provisional',
      primaryPartnershipId: null,
      output: {
        partnershipId,
        researchStatus: 'provisional',
        answer: 'Run A provisional',
      },
    });
    const msgB = await persistBensonConversationMessage({
      creatorId,
      conversationId,
      role: 'assistant',
      message: 'Run B provisional',
      output: {
        partnershipId,
        researchStatus: 'provisional',
        answer: 'Run B provisional',
      },
    });

    assert.equal(
      await bindBensonAssistantResearchRun({
        creatorId,
        messageId: msgA.id,
        partnershipId,
        researchRunId: runA,
      }),
      true,
    );
    assert.equal(
      await bindBensonAssistantResearchRun({
        creatorId,
        messageId: msgB.id,
        partnershipId,
        researchRunId: runB,
      }),
      true,
    );

    const [conversationBefore] = await db
      .select({ lastMessageAt: bensonConversations.lastMessageAt })
      .from(bensonConversations)
      .where(eq(bensonConversations.id, conversationId))
      .limit(1);

    const patchedA = await patchBensonAssistantMessagesTerminal({
      creatorId,
      partnershipId,
      researchRunId: runA,
      patch: {
        researchStatus: 'complete',
        answer: 'Run A complete',
        decisionBrief: { headline: 'A done' },
      },
    });
    assert.deepEqual(patchedA, [msgA.id]);

    const patchedB = await patchBensonAssistantMessagesTerminal({
      creatorId,
      partnershipId,
      researchRunId: runB,
      patch: {
        researchStatus: 'complete',
        answer: 'Run B complete',
      },
    });
    assert.deepEqual(patchedB, [msgB.id]);

    const [afterA] = await db
      .select({ message: bensonChatMessages.message, output: bensonChatMessages.outputJson })
      .from(bensonChatMessages)
      .where(eq(bensonChatMessages.id, msgA.id));
    const [afterB] = await db
      .select({ message: bensonChatMessages.message, output: bensonChatMessages.outputJson })
      .from(bensonChatMessages)
      .where(eq(bensonChatMessages.id, msgB.id));
    assert.equal(afterA?.message, 'Run A complete');
    assert.equal((afterA?.output as { researchRunId?: string }).researchRunId, runA);
    assert.equal(afterB?.message, 'Run B complete');
    assert.equal((afterB?.output as { researchRunId?: string }).researchRunId, runB);

    const [conversationAfter] = await db
      .select({ lastMessageAt: bensonConversations.lastMessageAt })
      .from(bensonConversations)
      .where(eq(bensonConversations.id, conversationId))
      .limit(1);
    assert.equal(
      conversationAfter?.lastMessageAt?.toISOString(),
      conversationBefore?.lastMessageAt?.toISOString(),
    );

    await db.delete(bensonChatMessages).where(eq(bensonChatMessages.conversationId, conversationId));
    await db.delete(bensonConversations).where(eq(bensonConversations.id, conversationId));
  });

  it('B/G: two messages on Run A both terminal-patch; race catch-up is message-exact', async () => {
    const creatorId = await resolveCreatorId();
    if (!creatorId) return;

    const conversationId = randomUUID();
    const partnershipId = randomUUID();
    const runA = randomUUID();

    const first = await persistBensonConversationMessage({
      creatorId,
      conversationId,
      role: 'assistant',
      message: 'first',
      output: { partnershipId, researchStatus: 'provisional' },
    });
    const second = await persistBensonConversationMessage({
      creatorId,
      conversationId,
      role: 'assistant',
      message: 'second',
      output: { partnershipId, researchStatus: 'provisional' },
    });

    await bindBensonAssistantResearchRun({
      creatorId,
      messageId: first.id,
      partnershipId,
      researchRunId: runA,
    });
    await bindBensonAssistantResearchRun({
      creatorId,
      messageId: second.id,
      partnershipId,
      researchRunId: runA,
    });

    const ids = await patchBensonAssistantMessagesTerminal({
      creatorId,
      partnershipId,
      researchRunId: runA,
      patch: { researchStatus: 'complete', answer: 'both done' },
    });
    assert.equal(ids.length, 2);
    assert.ok(ids.includes(first.id));
    assert.ok(ids.includes(second.id));

    // Stale/different run → zero patches (D)
    const stale = await patchBensonAssistantMessagesTerminal({
      creatorId,
      partnershipId,
      researchRunId: randomUUID(),
      patch: { researchStatus: 'complete', answer: 'stale' },
    });
    assert.deepEqual(stale, []);

    // Catch-up helper path on a fresh provisional for the same run
    const late = await persistBensonConversationMessage({
      creatorId,
      conversationId,
      role: 'assistant',
      message: 'late joiner',
      output: { partnershipId, researchStatus: 'provisional' },
    });
    await bindBensonAssistantResearchRun({
      creatorId,
      messageId: late.id,
      partnershipId,
      researchRunId: runA,
    });
    assert.equal(
      await patchBensonAssistantMessageTerminal({
        creatorId,
        messageId: late.id,
        partnershipId,
        researchRunId: runA,
        patch: { researchStatus: 'complete', answer: 'caught up' },
      }),
      true,
    );

    const [lateRow] = await db
      .select({ message: bensonChatMessages.message })
      .from(bensonChatMessages)
      .where(and(eq(bensonChatMessages.id, late.id)));
    assert.equal(lateRow?.message, 'caught up');

    // E: no partnershipId-only sweep — message with different partnership untouched
    const other = await persistBensonConversationMessage({
      creatorId,
      conversationId,
      role: 'assistant',
      message: 'other partnership',
      output: { partnershipId: randomUUID(), researchRunId: runA, researchStatus: 'researching' },
    });
    await patchBensonAssistantMessagesTerminal({
      creatorId,
      partnershipId,
      researchRunId: runA,
      patch: { researchStatus: 'failed', answer: 'should not hit other' },
    });
    const [otherRow] = await db
      .select({ message: bensonChatMessages.message, output: bensonChatMessages.outputJson })
      .from(bensonChatMessages)
      .where(eq(bensonChatMessages.id, other.id));
    assert.equal(otherRow?.message, 'other partnership');
    assert.equal((otherRow?.output as { researchStatus?: string }).researchStatus, 'researching');

    await db.delete(bensonChatMessages).where(eq(bensonChatMessages.conversationId, conversationId));
    await db.delete(bensonConversations).where(eq(bensonConversations.id, conversationId));
  });

  it('terminal patch finalizes processing providerStatus and preserves provenance', async () => {
    const creatorId = await resolveCreatorId();
    if (!creatorId) return;

    const conversationId = randomUUID();
    const partnershipId = randomUUID();
    const researchRunId = randomUUID();
    const originalUrl = 'https://www.scheels.com/c/all/b/wgaca';

    const msg = await persistBensonConversationMessage({
      creatorId,
      conversationId,
      role: 'assistant',
      message: 'provisional',
      output: {
        partnershipId,
        researchStatus: 'researching',
        providerStatus: {
          provider: 'generic',
          status: 'processing',
          originalUrl,
          diagnostics: [{ url: originalUrl, domain: 'scheels.com', methodsAttempted: ['html_text'] }],
        },
        collection: {
          partnershipResearchStatus: 'researching',
          providerStatus: {
            provider: 'generic',
            status: 'processing',
            originalUrl,
            diagnostics: [{ url: originalUrl, domain: 'scheels.com', methodsAttempted: ['html_text'] }],
          },
        },
      },
    });
    await bindBensonAssistantResearchRun({
      creatorId,
      messageId: msg.id,
      partnershipId,
      researchRunId,
    });

    await patchBensonAssistantMessagesTerminal({
      creatorId,
      partnershipId,
      researchRunId,
      patch: { researchStatus: 'complete', answer: 'done' },
    });

    const [completeRow] = await db
      .select({ output: bensonChatMessages.outputJson })
      .from(bensonChatMessages)
      .where(eq(bensonChatMessages.id, msg.id));
    const completeOut = completeRow?.output as {
      researchStatus?: string;
      providerStatus?: { status?: string; provider?: string; originalUrl?: string | null };
      collection?: { providerStatus?: { status?: string; originalUrl?: string | null } };
    };
    assert.equal(completeOut.researchStatus, 'complete');
    assert.equal(completeOut.providerStatus?.status, 'complete');
    assert.equal(completeOut.providerStatus?.provider, 'generic');
    assert.equal(completeOut.providerStatus?.originalUrl, originalUrl);
    assert.equal(completeOut.collection?.providerStatus?.status, 'complete');
    assert.equal(completeOut.collection?.providerStatus?.originalUrl, originalUrl);

    // Reset to non-terminal with processing providerStatus, then fail
    await db
      .update(bensonChatMessages)
      .set({
        outputJson: {
          partnershipId,
          researchRunId,
          researchStatus: 'researching',
          providerStatus: {
            provider: 'generic',
            status: 'processing',
            originalUrl,
            diagnostics: [{ url: originalUrl, domain: 'scheels.com' }],
          },
        },
      })
      .where(eq(bensonChatMessages.id, msg.id));

    await patchBensonAssistantMessagesTerminal({
      creatorId,
      partnershipId,
      researchRunId,
      patch: { researchStatus: 'failed', answer: 'failed' },
    });
    const [failedRow] = await db
      .select({ output: bensonChatMessages.outputJson })
      .from(bensonChatMessages)
      .where(eq(bensonChatMessages.id, msg.id));
    const failedOut = failedRow?.output as {
      providerStatus?: { status?: string; originalUrl?: string | null };
    };
    assert.equal(failedOut.providerStatus?.status, 'terminal_failure');
    assert.equal(failedOut.providerStatus?.originalUrl, originalUrl);

    await db.delete(bensonChatMessages).where(eq(bensonChatMessages.conversationId, conversationId));
    await db.delete(bensonConversations).where(eq(bensonConversations.id, conversationId));
  });
});
