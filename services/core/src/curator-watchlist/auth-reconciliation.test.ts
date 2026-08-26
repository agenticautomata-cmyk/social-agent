import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isInstagramAuthError,
  markInstagramAuthenticationRequired,
  reconcileAuthenticatedInstagramSuccess,
  shouldMarkInstagramAuthenticationRequired,
} from './auth-reconciliation.js';
import { db } from '../test-db.js';
import { sourceWatchers } from '../schema.js';
import { eq } from 'drizzle-orm';

describe('Instagram auth-state reconciliation', () => {
  it('login redirect sets authenticationRequired via shouldMark', () => {
    assert.equal(
      shouldMarkInstagramAuthenticationRequired({ pageKind: 'login', pausedForAuth: false }),
      true,
    );
  });

  it('challenge sets authenticationRequired via shouldMark', () => {
    assert.equal(
      shouldMarkInstagramAuthenticationRequired({ pageKind: 'challenge', pausedForAuth: false }),
      true,
    );
    assert.equal(
      shouldMarkInstagramAuthenticationRequired({ sessionStatus: 'captcha_blocked' }),
      true,
    );
  });

  it('unrelated extraction failure does not falsely mark auth required', () => {
    assert.equal(
      shouldMarkInstagramAuthenticationRequired({
        pausedForAuth: false,
        sessionStatus: 'ready',
        pageKind: 'unknown',
      }),
      false,
    );
    assert.equal(isInstagramAuthError('Fetch failed: timeout'), false);
    assert.equal(isInstagramAuthError('OCR parse returned zero rows'), false);
  });

  it('successful session-backed run clears authenticationRequired (db)', async () => {
    const [row] = await db
      .select({ id: sourceWatchers.id })
      .from(sourceWatchers)
      .where(eq(sourceWatchers.canonicalKey, 'instagram:account:jasfoodjourney'))
      .limit(1);
    assert.ok(row?.id, 'jasfoodjourney fixture source required');

    await db
      .update(sourceWatchers)
      .set({
        authenticationRequired: true,
        sessionStatus: 'ready',
        lastFailureMessage: 'Instagram login_required',
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, row.id));

    await reconcileAuthenticatedInstagramSuccess(row.id);

    const [after] = await db
      .select({
        authenticationRequired: sourceWatchers.authenticationRequired,
        sessionStatus: sourceWatchers.sessionStatus,
        lastFailureMessage: sourceWatchers.lastFailureMessage,
      })
      .from(sourceWatchers)
      .where(eq(sourceWatchers.id, row.id))
      .limit(1);

    assert.equal(after?.authenticationRequired, false);
    assert.equal(after?.sessionStatus, 'ready');
    assert.equal(after?.lastFailureMessage, null);
  });

  it('later success clears prior auth-required state (db)', async () => {
    const [row] = await db
      .select({ id: sourceWatchers.id })
      .from(sourceWatchers)
      .where(eq(sourceWatchers.canonicalKey, 'instagram:account:jasfoodjourney'))
      .limit(1);
    assert.ok(row?.id);

    await markInstagramAuthenticationRequired(row.id, 'Instagram challenge checkpoint');
    await reconcileAuthenticatedInstagramSuccess(row.id);

    const [after] = await db
      .select({
        authenticationRequired: sourceWatchers.authenticationRequired,
        lastFailureMessage: sourceWatchers.lastFailureMessage,
      })
      .from(sourceWatchers)
      .where(eq(sourceWatchers.id, row.id))
      .limit(1);

    assert.equal(after?.authenticationRequired, false);
    assert.equal(after?.lastFailureMessage, null);
  });

  it('markInstagramAuthenticationRequired sets flag and reason (db)', async () => {
    const [row] = await db
      .select({ id: sourceWatchers.id })
      .from(sourceWatchers)
      .where(eq(sourceWatchers.canonicalKey, 'instagram:account:jasfoodjourney'))
      .limit(1);
    assert.ok(row?.id);

    await markInstagramAuthenticationRequired(row.id, 'Instagram login_required');
    const [after] = await db
      .select({
        authenticationRequired: sourceWatchers.authenticationRequired,
        lastFailureMessage: sourceWatchers.lastFailureMessage,
      })
      .from(sourceWatchers)
      .where(eq(sourceWatchers.id, row.id))
      .limit(1);

    assert.equal(after?.authenticationRequired, true);
    assert.match(after?.lastFailureMessage ?? '', /login_required/i);

    await reconcileAuthenticatedInstagramSuccess(row.id);
  });
});
